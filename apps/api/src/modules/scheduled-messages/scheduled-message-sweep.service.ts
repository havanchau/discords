import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type {
  Message,
  ScheduledMessageFailureReason,
  ScheduledMessageUpdatedPayload,
} from '@discord-clone/shared';
import { I18nService, type ApiMessageKey } from '@/common/i18n/i18n.service';
import { DirectMessagesService } from '@/modules/direct-messages/direct-messages.service';
import { MessagesService } from '@/modules/messages/messages.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { withoutViewerVotes } from '@/modules/polls/poll.format';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import {
  failureReasonOf,
  readStoredAttachments,
  SCHEDULED_STALE_CLAIM_MS,
  SCHEDULED_SWEEP_BATCH,
  SCHEDULED_SWEEP_INTERVAL_MS,
} from './scheduled-message.rules';

const NOTIFICATION_BODY_MAX_LENGTH = 180;

const FAILURE_REASON_KEYS: Record<ScheduledMessageFailureReason, ApiMessageKey> = {
  NO_ACCESS: 'scheduledMessage.failure.NO_ACCESS',
  MISSING_PERMISSION: 'scheduledMessage.failure.MISSING_PERMISSION',
  TIMED_OUT: 'scheduledMessage.failure.TIMED_OUT',
  SLOWMODE: 'scheduledMessage.failure.SLOWMODE',
  BLOCKED: 'scheduledMessage.failure.BLOCKED',
  REPLY_TARGET_MISSING: 'scheduledMessage.failure.REPLY_TARGET_MISSING',
  REJECTED: 'scheduledMessage.failure.REJECTED',
  INTERRUPTED: 'scheduledMessage.failure.INTERRUPTED',
  AUTOMOD_BLOCKED: 'scheduledMessage.failure.AUTOMOD_BLOCKED',
  ACCOUNT_DELETION: 'scheduledMessage.failure.ACCOUNT_DELETION',
  RULES_NOT_ACCEPTED: 'scheduledMessage.failure.RULES_NOT_ACCEPTED',
  UNKNOWN: 'scheduledMessage.failure.UNKNOWN',
};

const deliverySelect = {
  id: true,
  authorId: true,
  channelId: true,
  conversationId: true,
  content: true,
  attachments: true,
  replyToMessageId: true,
} as const;

interface ClaimedMessage {
  id: string;
  authorId: string;
  channelId: string | null;
  conversationId: string | null;
  content: string;
}

type SendOutcome =
  | { status: 'SENT'; sentMessageId: string; channelMessage: Message | null }
  | { status: 'FAILED'; failureReason: ScheduledMessageFailureReason };

/**
 * Posts due scheduled messages as their author, through the same send methods a live send uses, so
 * permission, timeout, slowmode and block checks are exactly those of a normal send.
 *
 * Every API instance runs this timer. The conditional claim (`PENDING` → `SENDING`) is the only place
 * that decides delivery, so a scheduled message is sent at most once across instances. A failure is
 * recorded and never retried.
 */
@Injectable()
export class ScheduledMessageSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledMessageSweepService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly directMessages: DirectMessagesService,
    private readonly unread: RealtimeUnreadService,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
    private readonly i18n: I18nService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.sweep();
    }, SCHEDULED_SWEEP_INTERVAL_MS);
    // Un-refed, like ReminderSweepService, so the timer never keeps the process alive alone.
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
      await this.failStaleClaims(now);

      const due = await this.prisma.scheduledMessage.findMany({
        where: { status: 'PENDING', sendAt: { lte: now } },
        orderBy: { sendAt: 'asc' },
        take: SCHEDULED_SWEEP_BATCH,
        select: { id: true },
      });

      for (const { id } of due) {
        // An author with a pending account deletion never gets a claim: the request already failed
        // their pending rows, and this also closes the gap between that update and a concurrent tick.
        const { count } = await this.prisma.scheduledMessage.updateMany({
          where: {
            id,
            status: 'PENDING',
            sendAt: { lte: now },
            author: { deletionRequestedAt: null },
          },
          data: { status: 'SENDING', claimedAt: now },
        });
        // Another instance claimed it, or the author edited or cancelled it in between.
        if (count === 0) continue;
        await this.deliver(id);
      }
    } catch (error) {
      this.logger.error('Scheduled message sweep failed', errorDetail(error));
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * A row left in `SENDING` belongs to a process that stopped mid-send. It is failed, not re-sent:
   * the post may already exist, and a duplicate cannot be taken back.
   */
  private async failStaleClaims(now: Date) {
    const cutoff = new Date(now.getTime() - SCHEDULED_STALE_CLAIM_MS);
    const stale = await this.prisma.scheduledMessage.findMany({
      where: { status: 'SENDING', claimedAt: { lt: cutoff } },
      take: SCHEDULED_SWEEP_BATCH,
      select: { id: true, authorId: true, channelId: true, conversationId: true, content: true },
    });
    for (const row of stale) {
      const { count } = await this.prisma.scheduledMessage.updateMany({
        where: { id: row.id, status: 'SENDING', claimedAt: { lt: cutoff } },
        data: { status: 'FAILED', failureReason: 'INTERRUPTED' },
      });
      if (count === 0) continue;
      this.logger.warn(`Scheduled message ${row.id} was left mid-send and is marked failed`);
      this.emitUpdated(row, 'FAILED');
      await this.notifyFailed(row, 'INTERRUPTED');
    }
  }

  private async deliver(scheduledMessageId: string) {
    try {
      const row = await this.prisma.scheduledMessage.findUnique({
        where: { id: scheduledMessageId },
        select: deliverySelect,
      });
      if (!row) return;

      const outcome = await this.send(row);
      const { count } = await this.prisma.scheduledMessage.updateMany({
        where: { id: row.id, status: 'SENDING' },
        data:
          outcome.status === 'SENT'
            ? { status: 'SENT', sentMessageId: outcome.sentMessageId }
            : { status: 'FAILED', failureReason: outcome.failureReason },
      });
      // A posted channel message is broadcast even if its row lost the race below: it exists.
      if (outcome.status === 'SENT' && outcome.channelMessage) {
        await this.broadcastChannelMessage(outcome.channelMessage);
      }
      // The stale-claim pass already failed it; the author has been told.
      if (count === 0) return;

      this.emitUpdated(row, outcome.status);
      if (outcome.status === 'FAILED') await this.notifyFailed(row, outcome.failureReason);
    } catch (error) {
      this.logger.error(
        `Scheduled message delivery failed for ${scheduledMessageId}`,
        errorDetail(error),
      );
    }
  }

  private async send(row: {
    id: string;
    authorId: string;
    channelId: string | null;
    conversationId: string | null;
    content: string;
    attachments: Parameters<typeof readStoredAttachments>[0];
    replyToMessageId: string | null;
  }): Promise<SendOutcome> {
    const input = {
      content: row.content,
      replyToMessageId: row.replyToMessageId ?? undefined,
      attachments: readStoredAttachments(row.attachments),
    };
    try {
      if (row.channelId) {
        const { message } = await this.messages.createMessage(row.authorId, row.channelId, input);
        return { status: 'SENT', sentMessageId: message.id, channelMessage: message };
      }
      if (row.conversationId) {
        // The direct-message send path persists, then emits `dm:created` and unread counts itself.
        const message = await this.directMessages.createMessage(
          row.authorId,
          row.conversationId,
          input,
        );
        return { status: 'SENT', sentMessageId: message.message.id, channelMessage: null };
      }
      return { status: 'FAILED', failureReason: 'NO_ACCESS' };
    } catch (error) {
      const failureReason = failureReasonOf(error);
      if (failureReason === 'UNKNOWN') {
        this.logger.error(`Scheduled message ${row.id} could not be sent`, errorDetail(error));
      }
      return { status: 'FAILED', failureReason };
    }
  }

  /** Persist first, emit second: the same events the socket gateway sends after a live send. */
  private async broadcastChannelMessage(message: Message) {
    this.realtime.emitToRoom(
      this.realtime.channelRoom(message.channelId),
      'message:created',
      withoutViewerVotes(message),
    );
    const recipients = await this.unread.listUnreadRecipients(message);
    recipients.forEach((recipient) => {
      this.realtime.emitToRoom(this.realtime.userRoom(recipient.userId), 'unread:updated', {
        channelId: message.channelId,
        count: 1,
        mentions: recipient.mentions,
      });
    });
  }

  private emitUpdated(row: ClaimedMessage, status: 'SENT' | 'FAILED') {
    const payload: ScheduledMessageUpdatedPayload = {
      scheduledMessageId: row.id,
      channelId: row.channelId,
      conversationId: row.conversationId,
      status,
    };
    this.realtime.emitToRoom(
      this.realtime.userRoom(row.authorId),
      'scheduled-message:updated',
      payload,
    );
  }

  private async notifyFailed(row: ClaimedMessage, reason: ScheduledMessageFailureReason) {
    const author = await this.prisma.user.findUnique({
      where: { id: row.authorId },
      select: { locale: true },
    });
    const locale = this.i18n.resolveUserLocale(author?.locale);
    // No channelId/conversationId: the author may have lost access to the destination, and the
    // reason is what they need; the composer's scheduled list shows the full message.
    await this.notifications.create({
      userId: row.authorId,
      type: 'SCHEDULED_MESSAGE_FAILED',
      title: this.i18n.t(locale, 'scheduledMessage.failed.title'),
      body: this.i18n.t(locale, 'scheduledMessage.failed.body', {
        reason: this.i18n.t(locale, FAILURE_REASON_KEYS[reason]),
        content: truncate(row.content, NOTIFICATION_BODY_MAX_LENGTH),
      }),
    });
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.stack : error;
}
