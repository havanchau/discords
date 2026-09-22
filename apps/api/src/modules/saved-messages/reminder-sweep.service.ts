import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { I18nService } from '@/common/i18n/i18n.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { PushService } from '@/modules/push/push.service';
import { REMINDER_SWEEP_BATCH, REMINDER_SWEEP_INTERVAL_MS } from './saved-message-reminder';

const NOTIFICATION_BODY_MAX_LENGTH = 180;

/**
 * Delivers due saved-message reminders through the notification inbox and push.
 *
 * Every API instance runs this timer. The conditional claim (`remindedAt IS NULL`) is the only
 * place that decides delivery, so a reminder is delivered at most once across instances; a
 * delivery that fails after its claim is logged and not retried.
 */
@Injectable()
export class ReminderSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReminderSweepService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly i18n: I18nService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.sweep();
    }, REMINDER_SWEEP_INTERVAL_MS);
    // Un-refed, like RealtimeHeartbeatService, so the timer never keeps the process alive alone.
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep() {
    // A slow tick must not overlap the next one on the same instance.
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      const now = new Date();
      const due = await this.prisma.savedMessage.findMany({
        where: { remindAt: { lte: now }, remindedAt: null },
        orderBy: { remindAt: 'asc' },
        take: REMINDER_SWEEP_BATCH,
        select: { id: true },
      });

      for (const { id } of due) {
        const { count } = await this.prisma.savedMessage.updateMany({
          where: { id, remindedAt: null, remindAt: { lte: now } },
          data: { remindedAt: now },
        });
        // Another instance claimed it, or the owner rescheduled or removed it in between.
        if (count === 0) continue;
        await this.deliver(id);
      }
    } catch (error) {
      this.logger.error('Saved message reminder sweep failed', errorDetail(error));
    } finally {
      this.isSweeping = false;
    }
  }

  private async deliver(savedMessageId: string) {
    try {
      const saved = await this.prisma.savedMessage.findUnique({
        where: { id: savedMessageId },
        select: {
          ownerId: true,
          channelId: true,
          originalMessageId: true,
          snapshotContent: true,
          snapshotAuthorName: true,
          owner: { select: { locale: true } },
        },
      });
      if (!saved) return;

      const locale = this.i18n.resolveUserLocale(saved.owner.locale);
      const title = this.i18n.t(locale, 'reminder.savedMessage.title');
      const body = this.i18n.t(locale, 'reminder.savedMessage.body', {
        author: saved.snapshotAuthorName,
        content: truncate(saved.snapshotContent, NOTIFICATION_BODY_MAX_LENGTH),
      });

      // No channelId/conversationId: the inbox would otherwise navigate to a source the owner may
      // no longer read. The client opens Saved Messages for this type, which re-checks access.
      await this.notifications.create({
        userId: saved.ownerId,
        type: 'SAVED_MESSAGE_REMINDER',
        title,
        body,
        messageId: saved.originalMessageId,
      });
      // A push can show on a lock screen, so an age-restricted source never puts its author or
      // content there, as for mention pushes (docs/features/age-restricted-channels.md).
      const isAgeRestricted = await this.isFromAgeRestrictedChannel(saved.channelId);
      const pushBody = isAgeRestricted
        ? this.i18n.t(locale, 'reminder.savedMessage.ageRestrictedBody')
        : body;
      await this.push.sendGenericPush(saved.ownerId, { title, body: pushBody, url: '/' });
    } catch (error) {
      this.logger.error(
        `Saved message reminder delivery failed for ${savedMessageId}`,
        errorDetail(error),
      );
    }
  }

  /** Reads the channel's current flag, so a channel restricted after the save is covered too. */
  private async isFromAgeRestrictedChannel(channelId: string | null) {
    if (!channelId) return false;
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { isAgeRestricted: true },
    });
    return channel?.isAgeRestricted ?? false;
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.stack : error;
}
