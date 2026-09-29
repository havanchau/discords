import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushSubscription } from '@prisma/client';
import { I18nService } from '@/common/i18n/i18n.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { isMuteActive } from '@/modules/users/notification-mute';
import { createVapidJwt, encryptWebPushPayload } from './web-push-crypto';

const PUSH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

interface SendMentionPushInput {
  toUserId: string;
  fromUserId: string;
  fromUsername: string;
  serverId: string;
  channelId: string;
  channelName: string;
  isAgeRestricted: boolean;
  content: string;
}

interface SendGenericPushInput {
  title: string;
  body: string;
  url: string;
}

interface SendDirectMessagePushInput {
  toUserId: string;
  fromUserId: string;
  conversationId: string;
  /** The same display title already computed for the in-app `Notification` row, reused as-is. */
  title: string;
  /** The same content-with-fallback text already computed for the in-app `Notification.body`. */
  body: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  getPublicKey() {
    return this.config.get<string>('VAPID_PUBLIC_KEY', '');
  }

  async saveSubscription(
    userId: string,
    subscription: PushSubscriptionPayload,
    deviceName?: string,
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        deviceName,
      },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        deviceName,
      },
    });
    return { ok: true };
  }

  async deleteSubscription(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true };
  }

  async sendMentionPush(input: SendMentionPushInput) {
    if (input.toUserId === input.fromUserId) return;
    if (!(await this.shouldSendPush(input.toUserId, input.serverId, input.channelId))) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: input.toUserId },
    });
    if (!subscriptions.length) return;
    if (!(await this.reserveRateLimit(input.toUserId, input.channelId))) return;

    const recipient = await this.prisma.user.findUnique({
      where: { id: input.toUserId },
      select: { locale: true },
    });
    const locale = this.i18n.resolveUserLocale(recipient?.locale);

    const payload = JSON.stringify({
      title: this.i18n.t(locale, 'push.channelMessage.title', { channel: input.channelName }),
      // A lock screen is more public than the app: an age-restricted channel's push never carries
      // its author or content, even for a recipient who confirmed their age.
      body: input.isAgeRestricted
        ? this.i18n.t(locale, 'push.channelMessage.ageRestrictedBody')
        : this.i18n.t(locale, 'push.channelMessage.body', {
            author: input.fromUsername,
            content: truncate(input.content, 100),
          }),
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: {
        channelId: input.channelId,
        serverId: input.serverId,
        url: `/channels/${input.channelId}`,
      },
    });

    await this.deliver(subscriptions, payload);
  }

  /**
   * A direct message has no server/channel scope, so it is gated by the global `NotificationPreference`
   * row only (`shouldSendDirectMessagePush`), and carries no per-recipient rate limit (see
   * docs/features/dm-push-notifications.md, Trade-offs) — every DM that passes the mute/online check
   * sends one push.
   */
  async sendDirectMessagePush(input: SendDirectMessagePushInput) {
    if (input.toUserId === input.fromUserId) return;
    if (!(await this.shouldSendDirectMessagePush(input.toUserId, input.conversationId))) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: input.toUserId },
    });
    if (!subscriptions.length) return;

    const recipient = await this.prisma.user.findUnique({
      where: { id: input.toUserId },
      select: { locale: true },
    });
    const locale = this.i18n.resolveUserLocale(recipient?.locale);

    const payload = JSON.stringify({
      title: this.i18n.t(locale, 'push.directMessage.title', { title: input.title }),
      body: this.i18n.t(locale, 'push.directMessage.body', {
        content: truncate(input.body, 100),
      }),
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: {
        conversationId: input.conversationId,
        url: `/channels/@me/${input.conversationId}`,
      },
    });

    await this.deliver(subscriptions, payload);
  }

  /**
   * A push that is not tied to a channel template, e.g. a saved-message reminder. It follows the
   * same "online users get no push" and global desktop-notification rules as a mention, but has no
   * per-channel throttle: the caller sends it once.
   */
  async sendGenericPush(userId: string, input: SendGenericPushInput) {
    if (!(await this.isPushAllowed(userId))) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subscriptions.length) return;

    const payload = JSON.stringify({
      title: input.title,
      body: truncate(input.body, 100),
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: input.url },
    });
    await this.deliver(subscriptions, payload);
  }

  private async deliver(subscriptions: PushSubscription[], payload: string) {
    await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await this.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (err) {
          const statusCode = getStatusCode(err);
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription.deleteMany({
              where: { endpoint: subscription.endpoint },
            });
            return;
          }
          this.logger.warn(`Push delivery failed (${statusCode ?? 'unknown'}): ${String(err)}`);
        }
      }),
    );
  }

  /** The rules every push shares: no push to an online user or one who turned desktop off. */
  private async isPushAllowed(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status === 'ONLINE') return false;

    const globalPreference = await this.prisma.notificationPreference.findFirst({
      where: { userId, serverId: null, channelId: null },
      select: { desktopEnabled: true },
    });
    return globalPreference?.desktopEnabled !== false;
  }

  private async shouldSendPush(userId: string, serverId: string, channelId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status === 'ONLINE') return false;

    const preferences = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const globalPreference = preferences.find((item) => !item.serverId && !item.channelId);
    const serverPreference = preferences.find(
      (item) => item.serverId === serverId && !item.channelId,
    );
    const channelPreference = preferences.find((item) => item.channelId === channelId);

    if (globalPreference && !globalPreference.desktopEnabled) return false;
    // Each level is checked on its own: an unmuted or expired channel row must not mask an active
    // server or global mute (docs/features/timed-notification-mute.md, Rules item 6).
    const now = new Date();
    if (
      isMuteActive(channelPreference, now) ||
      isMuteActive(serverPreference, now) ||
      isMuteActive(globalPreference, now)
    ) {
      return false;
    }
    return true;
  }

  /**
   * The global-only slice of `shouldSendPush` (a DM has no server/channel scope, so only the global
   * `NotificationPreference` row, `serverId: null, channelId: null`, gates it there), plus this
   * conversation's own `DirectConversationMute` row — an additional, independent gate: either one
   * suppresses (docs/features/dm-conversation-mute.md). This is the one place the conversation mute
   * is checked; `sendDirectMessagePush` is the DM send path's single call site.
   */
  private async shouldSendDirectMessagePush(userId: string, conversationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status === 'ONLINE') return false;

    const now = new Date();
    const [globalPreference, conversationMute] = await Promise.all([
      this.prisma.notificationPreference.findFirst({
        where: { userId, serverId: null, channelId: null },
      }),
      this.prisma.directConversationMute.findUnique({
        where: { userId_conversationId: { userId, conversationId } },
      }),
    ]);
    if (globalPreference && !globalPreference.desktopEnabled) return false;
    return !isMuteActive(globalPreference, now) && !isMuteActive(conversationMute, now);
  }

  private async reserveRateLimit(userId: string, channelId: string) {
    const now = new Date();
    const reusableBefore = new Date(now.getTime() - PUSH_RATE_LIMIT_WINDOW_MS);
    const existing = await this.prisma.pushNotificationThrottle.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });

    if (existing && existing.lastSentAt > reusableBefore) return false;

    await this.prisma.pushNotificationThrottle.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, lastSentAt: now },
      update: { lastSentAt: now },
    });
    return true;
  }

  private async sendNotification(subscription: PushSubscriptionPayload, payload: string) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_EMAIL', 'mailto:admin@localhost');
    if (!publicKey || !privateKey) {
      this.logger.warn(
        'Skipping push delivery because VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing.',
      );
      return;
    }

    const encrypted = encryptWebPushPayload(subscription, payload);
    const jwt = createVapidJwt(subscription.endpoint, subject, publicKey, privateKey);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        ...encrypted.headers,
        Authorization: `vapid t=${jwt}, k=${publicKey}`,
        Urgency: 'normal',
      },
      body: new Uint8Array(encrypted.body),
    });

    if (!response.ok) {
      const error = new Error(await response.text().catch(() => response.statusText));
      (error as Error & { statusCode?: number }).statusCode = response.status;
      throw error;
    }
  }
}

interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function getStatusCode(err: unknown) {
  return typeof err === 'object' && err && 'statusCode' in err
    ? Number((err as { statusCode?: number }).statusCode)
    : undefined;
}
