import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { createVapidJwt, encryptWebPushPayload } from './web-push-crypto';

const PUSH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

interface SendMentionPushInput {
  toUserId: string;
  fromUserId: string;
  fromUsername: string;
  serverId: string;
  channelId: string;
  channelName: string;
  content: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

    const payload = JSON.stringify({
      title: `#${input.channelName}`,
      body: `${input.fromUsername}: ${truncate(input.content, 100)}`,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: {
        channelId: input.channelId,
        serverId: input.serverId,
        url: `/channels/${input.channelId}`,
      },
    });

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
    const effectivePreference = channelPreference ?? serverPreference ?? globalPreference;

    if (globalPreference && !globalPreference.desktopEnabled) return false;
    if (effectivePreference?.muted) return false;
    return true;
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
      body: encrypted.body,
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
