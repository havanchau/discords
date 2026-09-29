import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, Prisma } from '@prisma/client';
import type {
  Message,
  MessageComponentRow,
  MessageHistoryResult,
  ThreadSummary,
} from '@discord-clone/shared';
import { ForwardSnapshot } from '@/common/forward-snapshot';
import {
  AutoModAlert,
  AutoModScreeningService,
  AutoModScreenInput,
} from '@/modules/automod/automod-screening.service';
import { ChannelsService } from '@/modules/channels/channels.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { WorkflowTriggerService } from '@/modules/workflows/workflow-trigger.service';
import { errorStack, threadSummaryInclude, type ThreadWithSummary } from './thread-summary';
import { withoutViewerVotes } from '@/modules/polls/poll.format';
import { PushService } from '@/modules/push/push.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { formatMessage, messageInclude, notificationAuthorName } from './message.format';
import { readVoiceMaxBytes, toAttachmentCreateData } from './message-attachments';
import { listMessageRevisions, recordMessageRevision } from './message-revisions';
import { parseMentionTokens, requiresMentionEveryonePermission } from './mentions';
import { resolveStickerAttachment, StickerAttachmentData } from './message-stickers';
import { ReactionDto } from './dto/reaction.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { slowmodeRetryAfterSeconds } from './slowmode';
import {
  buildMessageSearchWhere,
  MessageSearchFilters,
  normalizeMessageSearchFilters,
} from './messages.search';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private readonly voiceMaxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly permissions: PermissionsService,
    private readonly push: PushService,
    private readonly realtime: RealtimePublisher,
    private readonly automod: AutoModScreeningService,
    // forwardRef: WorkflowsModule already imports MessagesModule for its POST_MESSAGE step, so the
    // message-match trigger closes the cycle (docs/features/channel-workflows.md).
    @Inject(forwardRef(() => WorkflowTriggerService))
    private readonly workflowTrigger: WorkflowTriggerService,
    config: ConfigService,
  ) {
    this.voiceMaxBytes = readVoiceMaxBytes(config);
  }

  async listMessages(
    userId: string,
    channelId: string,
    cursor?: string,
    search?: MessageSearchFilters,
  ) {
    await this.channels.requireReadableChannel(userId, channelId);
    const filters = normalizeMessageSearchFilters(search);
    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        threadId: null,
        AND: buildMessageSearchWhere(filters),
      },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const replyIds = messages
      .map((message) => message.replyToMessageId)
      .filter((replyId): replyId is string => Boolean(replyId));
    const replyMessages = replyIds.length
      ? await this.prisma.message.findMany({
          where: { id: { in: replyIds } },
          include: messageInclude,
        })
      : [];
    const replyMap = new Map(
      replyMessages.map((message) => [message.id, formatMessage(message, userId)]),
    );
    const threadMap = await this.getThreadSummariesForRoots(
      userId,
      messages.map((message) => message.id),
    );

    const nextCursor = messages.length === 50 ? (messages[messages.length - 1]?.id ?? null) : null;
    const ordered = [...messages].reverse();

    const readState = await this.prisma.readState.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });

    return {
      messages: ordered.map((message) =>
        formatMessage(
          message,
          userId,
          replyMap.get(message.replyToMessageId ?? ''),
          threadMap.get(message.id),
        ),
      ),
      nextCursor,
      lastReadMessageId: readState?.lastReadMessageId ?? null,
      lastReadAt: readState?.lastReadAt ?? null,
    };
  }

  async markChannelRead(userId: string, channelId: string, messageId?: string) {
    await this.channels.requireReadableChannel(userId, channelId);
    const lastMessage =
      messageId ??
      (
        await this.prisma.message.findFirst({
          where: { channelId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
      )?.id;

    const readState = await this.prisma.readState.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: {
        userId,
        channelId,
        lastReadMessageId: lastMessage,
      },
      update: {
        lastReadMessageId: lastMessage,
        lastReadAt: new Date(),
      },
    });
    return { readState };
  }

  async listPinnedMessages(userId: string, channelId: string) {
    await this.channels.requireReadableChannel(userId, channelId);
    const pins = await this.prisma.messagePin.findMany({
      where: { channelId },
      include: {
        message: {
          include: messageInclude,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      messages: pins
        .map((pin) => pin.message)
        .filter((message) => !message.deletedAt)
        .map((message) => formatMessage(message, userId)),
    };
  }

  /**
   * Every gate a new top-level channel message passes. Socket and REST sends, forwards, scheduled
   * sends and channel polls all come through here, so the gates cannot drift between them.
   */
  async requireCanPostInChannel(userId: string, channelId: string) {
    const channel = await this.channels.requireReadableChannel(userId, channelId);
    // A FORUM channel takes only forum posts, so every top-level send path is refused here at once.
    if (channel.type === 'FORUM') {
      throw new BadRequestException('Use forum posts on a FORUM channel');
    }
    // A STAGE channel is audio/video only (`stage-channels.md` → Out of scope).
    if (channel.type === 'STAGE') {
      throw new BadRequestException('Stage channels have no text chat');
    }
    // A DECISION channel takes only decision proposals, so every top-level send path is refused
    // here at once, same shape as FORUM above.
    if (channel.type === 'DECISION') {
      throw new BadRequestException('Use decision proposals on a DECISION channel');
    }
    return this.passSendGates(userId, channel);
  }

  /** The same gates for a forum post, the only top-level message a FORUM channel accepts. */
  async requireCanPostInForum(userId: string, channelId: string) {
    const channel = await this.channels.requireReadableForumChannel(userId, channelId);
    return this.passSendGates(userId, channel);
  }

  /** The same gates for a decision proposal, the only top-level message a DECISION channel accepts. */
  async requireCanPostInDecision(userId: string, channelId: string) {
    const channel = await this.channels.requireReadableDecisionChannel(userId, channelId);
    return this.passSendGates(userId, channel);
  }

  private async passSendGates(userId: string, channel: Channel) {
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.SendMessages);
    await this.permissions.requireNotTimedOut(userId, channel.serverId);
    await this.permissions.requireOnboardingAccepted(userId, channel.serverId);
    await this.enforceSlowmode(userId, channel);
    return channel;
  }

  /**
   * `forward` and `carriedStickers` are set only by the forwarding module; a forward may have no text
   * of its own. `dto.stickerId` must name a sticker of this channel's server.
   */
  async createMessage(
    userId: string,
    channelId: string,
    dto: CreateMessageDto,
    forward?: ForwardSnapshot,
    carriedStickers: StickerAttachmentData[] = [],
    /** Bot-only (`bot-message-components.md`); `CreateMessageDto` itself never carries this field. */
    components?: MessageComponentRow[],
  ) {
    const channel = await this.requireCanPostInChannel(userId, channelId);
    const content = dto.content.trim();
    const sticker = await resolveStickerAttachment(this.prisma, dto.stickerId, channel.serverId);
    const attachments = [
      ...toAttachmentCreateData(dto.attachments ?? [], this.voiceMaxBytes),
      ...(sticker ? [sticker] : []),
      ...carriedStickers,
    ];

    if (!content && attachments.length === 0 && !forward) {
      throw new ForbiddenException('Message content cannot be empty without attachments');
    }

    if (dto.replyToMessageId) {
      const replyTarget = await this.prisma.message.findFirst({
        where: {
          id: dto.replyToMessageId,
          channelId,
          deletedAt: null,
        },
      });
      if (!replyTarget) {
        throw new NotFoundException('Reply target not found');
      }
    }
    await this.requireMentionPermission(userId, channel.serverId, content);
    // A forward carries the source text too, so a rule cannot be dodged by forwarding.
    const autoModAlerts = await this.enforceAutoMod({
      userId,
      serverId: channel.serverId,
      channelId,
      texts: [content, forward?.forwardOriginContent],
    });

    const message = await this.prisma.message.create({
      data: {
        channelId,
        serverId: channel.serverId,
        authorId: userId,
        content,
        replyToMessageId: dto.replyToMessageId,
        ...forward,
        ...(components !== undefined
          ? { components: components as unknown as Prisma.InputJsonValue }
          : {}),
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: messageInclude,
    });

    const replyToMessage = dto.replyToMessageId
      ? await this.prisma.message.findUnique({
          where: { id: dto.replyToMessageId },
          include: messageInclude,
        })
      : null;

    await this.notifyMentionedUsers({
      authorId: userId,
      authorUsername: notificationAuthorName(message.author),
      serverId: channel.serverId,
      channelId: channel.id,
      channelName: channel.name,
      isAgeRestricted: channel.isAgeRestricted,
      isPrivate: channel.isPrivate,
      content,
    });
    await this.postAutoModAlerts(autoModAlerts);
    // Message-match workflow triggers fire only on a message AutoMod already let through
    // (docs/features/channel-workflows.md). `evaluateMessage` catches and logs its own failures, so
    // a broken workflow can never reject a send that already succeeded.
    await this.workflowTrigger.evaluateMessage({
      id: message.id,
      serverId: channel.serverId,
      channelId: channel.id,
      content,
    });

    return {
      message: formatMessage(
        message,
        userId,
        replyToMessage ? formatMessage(replyToMessage, userId) : undefined,
      ),
    };
  }

  async listThreadMessages(userId: string, rootMessageId: string) {
    const rootMessage = await this.requireThreadRoot(userId, rootMessageId);
    const thread = await this.prisma.thread.findUnique({ where: { rootMessageId } });
    const messages = thread
      ? await this.prisma.message.findMany({
          where: { threadId: thread.id, deletedAt: null },
          include: messageInclude,
          orderBy: { createdAt: 'asc' },
          take: 100,
        })
      : [];
    const threadSummary = thread ? await this.getThreadSummary(userId, thread.id) : null;

    return {
      rootMessage: formatMessage(rootMessage, userId, undefined, threadSummary ?? undefined),
      thread: threadSummary,
      messages: messages.map((message) => formatMessage(message, userId)),
    };
  }

  async createThreadMessage(userId: string, rootMessageId: string, dto: CreateMessageDto) {
    const rootMessage = await this.requireThreadRoot(userId, rootMessageId);
    await this.permissions.requireChannelPermission(
      userId,
      rootMessage.channelId,
      Permission.SendMessages,
    );
    await this.permissions.requireNotTimedOut(userId, rootMessage.serverId);
    await this.permissions.requireOnboardingAccepted(userId, rootMessage.serverId);
    const content = dto.content.trim();
    const sticker = await resolveStickerAttachment(
      this.prisma,
      dto.stickerId,
      rootMessage.serverId,
    );
    const attachments = [
      ...toAttachmentCreateData(dto.attachments ?? [], this.voiceMaxBytes),
      ...(sticker ? [sticker] : []),
    ];

    if (!content && attachments.length === 0) {
      throw new ForbiddenException('Message content cannot be empty without attachments');
    }
    await this.requireMentionPermission(userId, rootMessage.serverId, content);
    const autoModAlerts = await this.enforceAutoMod({
      userId,
      serverId: rootMessage.serverId,
      channelId: rootMessage.channelId,
      texts: [content],
    });

    const thread = await this.prisma.thread.upsert({
      where: { rootMessageId },
      create: {
        channelId: rootMessage.channelId,
        serverId: rootMessage.serverId,
        rootMessageId,
        createdById: userId,
        participants: {
          create: [{ userId: rootMessage.authorId }, { userId }].filter(
            (participant, index, participants) =>
              participants.findIndex((item) => item.userId === participant.userId) === index,
          ),
        },
      },
      update: { updatedAt: new Date() },
    });

    await this.prisma.threadParticipant.upsert({
      where: { threadId_userId: { threadId: thread.id, userId } },
      create: { threadId: thread.id, userId },
      update: {},
    });

    const message = await this.prisma.message.create({
      data: {
        channelId: rootMessage.channelId,
        serverId: rootMessage.serverId,
        authorId: userId,
        content,
        threadId: thread.id,
        replyToMessageId: dto.replyToMessageId ?? rootMessageId,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: messageInclude,
    });

    await this.prisma.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    const threadSummary = await this.getThreadSummary(userId, thread.id);
    const formattedMessage = formatMessage(message, userId, formatMessage(rootMessage, userId));
    const formattedRoot = formatMessage(rootMessage, userId, undefined, threadSummary);

    this.realtime.emitToRoom(
      this.realtime.channelRoom(rootMessage.channelId),
      'thread:message:created',
      {
        thread: threadSummary,
        rootMessage: withoutViewerVotes(formattedRoot),
        message: formattedMessage,
      },
    );

    await this.notifyMentionedUsers({
      authorId: userId,
      authorUsername: notificationAuthorName(message.author),
      serverId: rootMessage.serverId,
      channelId: rootMessage.channelId,
      channelName: rootMessage.channel.name,
      isAgeRestricted: rootMessage.channel.isAgeRestricted,
      isPrivate: rootMessage.channel.isPrivate,
      content,
    });
    await this.postAutoModAlerts(autoModAlerts);

    return { thread: threadSummary, rootMessage: formattedRoot, message: formattedMessage };
  }

  /**
   * A human's own edit (`PATCH messages/:messageId`), and a bot's `UPDATE_MESSAGE` callback when it
   * changes `content` (`bot-message-components.md` → Changes, step 7). `components` is bot-only —
   * `UpdateMessageDto` itself never carries it — and, when present, is written in the same
   * transaction as the content edit so the broadcast carries both at once.
   */
  async updateMessage(
    userId: string,
    messageId: string,
    dto: UpdateMessageDto,
    components?: MessageComponentRow[],
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { poll: { select: { id: true } } },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    await this.channels.requireReadableChannel(userId, message.channelId);
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }
    await this.permissions.requireNotTimedOut(userId, message.serverId);
    await this.permissions.requireOnboardingAccepted(userId, message.serverId);
    // The text of a poll message is its question, which is immutable.
    if (message.poll) {
      throw new ForbiddenException('Poll messages cannot be edited');
    }
    const content = dto.content.trim();
    // A blocked edit throws here, so the stored content stands.
    const autoModAlerts = await this.enforceAutoMod({
      userId,
      serverId: message.serverId,
      channelId: message.channelId,
      texts: [content],
    });

    const editedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await recordMessageRevision(tx, messageId, message.content, editedAt);
      return tx.message.update({
        where: { id: messageId },
        data: {
          content,
          editedAt,
          ...(components !== undefined
            ? { components: components as unknown as Prisma.InputJsonValue }
            : {}),
        },
        include: messageInclude,
      });
    });
    const formatted = formatMessage(updated, userId);
    this.realtime.emitToRoom(
      this.realtime.channelRoom(formatted.channelId),
      updated.threadId ? 'thread:message:updated' : 'message:updated',
      formatted,
    );
    await this.postAutoModAlerts(autoModAlerts);
    return { message: formatted };
  }

  /**
   * A bot's `UPDATE_MESSAGE` callback when it touches only `components` (`content` omitted) — the
   * existing text and `editedAt` are left alone, so no AutoMod re-screening or revision is recorded
   * (nothing textual changed). Same author-only gate as `updateMessage`
   * (`bot-message-components.md` → Changes, step 7; Edge cases → "Callback UPDATE_MESSAGE for a
   * message the responding bot does not own").
   */
  async updateMessageComponents(
    userId: string,
    messageId: string,
    components: MessageComponentRow[] | null,
  ) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    await this.channels.requireReadableChannel(userId, message.channelId);
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }
    await this.permissions.requireNotTimedOut(userId, message.serverId);
    await this.permissions.requireOnboardingAccepted(userId, message.serverId);

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        components: components ? (components as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
      include: messageInclude,
    });
    const formatted = formatMessage(updated, userId);
    this.realtime.emitToRoom(
      this.realtime.channelRoom(formatted.channelId),
      updated.threadId ? 'thread:message:updated' : 'message:updated',
      formatted,
    );
    return { message: formatted };
  }

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    await this.channels.requireReadableChannel(userId, message.channelId);
    const canModerate = await this.permissions.hasServerPermission(
      userId,
      message.serverId,
      Permission.ManageMessages,
    );
    if (message.authorId !== userId && !canModerate) {
      throw new ForbiddenException('Only the author or message manager can delete this message');
    }

    // Revisions go with the content, so the pre-delete text is not recoverable from the history.
    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.messageRevision.deleteMany({ where: { messageId } });
      return tx.message.update({
        where: { id: messageId },
        data: {
          content: '',
          deletedAt: new Date(),
        },
      });
    });
    await this.writeAuditLog(message.serverId, userId, 'MESSAGE_DELETE', message.id, {
      authorId: message.authorId,
      channelId: message.channelId,
    });
    const formatted = await this.findMessageForUser(userId, deleted.id);
    this.realtime.emitToRoom(
      this.realtime.channelRoom(formatted.channelId),
      formatted.threadId ? 'thread:message:deleted' : 'message:deleted',
      formatted,
    );
    return { message: formatted };
  }

  /** The author's own view of their message's past versions; moderators go through a report. */
  async getMessageHistory(userId: string, messageId: string): Promise<MessageHistoryResult> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true, authorId: true, deletedAt: true },
    });
    if (!message || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }
    await this.channels.requireReadableChannel(userId, message.channelId);
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can view this message history');
    }
    return { revisions: await listMessageRevisions(this.prisma, messageId, true) };
  }

  async toggleReaction(userId: string, messageId: string, dto: ReactionDto) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }
    await this.channels.requireReadableChannel(userId, message.channelId);
    await this.permissions.requireNotTimedOut(userId, message.serverId);
    await this.permissions.requireOnboardingAccepted(userId, message.serverId);

    const where = {
      messageId_userId_emoji: {
        messageId,
        userId,
        emoji: dto.emoji,
      },
    };
    const existing = await this.prisma.messageReaction.findUnique({ where });

    if (existing) {
      await this.prisma.messageReaction.delete({ where });
    } else {
      await this.prisma.messageReaction.create({
        data: {
          messageId,
          userId,
          emoji: dto.emoji,
        },
      });
    }

    return { message: await this.findMessageForUser(userId, messageId) };
  }

  async togglePin(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }

    const channel = await this.channels.requireReadableChannel(userId, message.channelId);
    const canManageMessages = await this.permissions.hasServerPermission(
      userId,
      channel.serverId,
      Permission.ManageMessages,
    );

    if (message.authorId !== userId && !canManageMessages) {
      throw new ForbiddenException('Only the author or message managers can pin this message');
    }

    const existing = await this.prisma.messagePin.findUnique({ where: { messageId } });
    if (existing) {
      await this.prisma.messagePin.delete({ where: { messageId } });
      await this.writeAuditLog(channel.serverId, userId, 'MESSAGE_UNPIN', message.id, {
        channelId: message.channelId,
      });
      return { pinned: false, message: await this.findMessageForUser(userId, messageId) };
    }

    await this.prisma.messagePin.create({
      data: {
        messageId,
        channelId: message.channelId,
        pinnedById: userId,
      },
    });
    await this.writeAuditLog(channel.serverId, userId, 'MESSAGE_PIN', message.id, {
      channelId: message.channelId,
    });
    return { pinned: true, message: await this.findMessageForUser(userId, messageId) };
  }

  async findMessageForUser(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: messageInclude,
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    await this.channels.requireReadableChannel(userId, message.channelId);
    const replyToMessage = message.replyToMessageId
      ? await this.prisma.message.findUnique({
          where: { id: message.replyToMessageId },
          include: messageInclude,
        })
      : null;

    return formatMessage(
      message,
      userId,
      replyToMessage ? formatMessage(replyToMessage, userId) : undefined,
    );
  }

  /**
   * AutoMod for every channel send path (socket, REST, forward, scheduled send, poll). A blocking rule
   * posts its alerts and throws; otherwise the caller posts the returned alerts after persisting.
   */
  async enforceAutoMod(input: AutoModScreenInput) {
    const verdict = await this.automod.screen(input);
    if (verdict.blockedBy === null) return verdict.alerts;
    await this.postAutoModAlerts(verdict.alerts);
    throw new BadRequestException(`Message blocked by AutoMod: ${verdict.blockedBy}`);
  }

  /** Posted as the server owner past every send gate, AutoMod included, so an alert cannot loop. */
  async postAutoModAlerts(alerts: AutoModAlert[]) {
    for (const alert of alerts) {
      try {
        const message = await this.prisma.message.create({ data: alert, include: messageInclude });
        this.realtime.emitToRoom(
          this.realtime.channelRoom(alert.channelId),
          'message:created',
          formatMessage(message, alert.authorId),
        );
      } catch (error) {
        // The author's message is already stored (or refused); failing the request over a lost alert
        // would only invite a retry and a duplicate.
        this.logger.error(`AutoMod alert to channel ${alert.channelId} failed`, errorStack(error));
      }
    }
  }

  /* Top-level messages only; deleted messages still count so deleting cannot reset the cooldown. */
  private async enforceSlowmode(
    userId: string,
    channel: { id: string; serverId: string; slowmodeSeconds: number },
  ) {
    if (channel.slowmodeSeconds <= 0) return;
    const [canManageMessages, canManageChannels] = await Promise.all([
      this.permissions.hasServerPermission(userId, channel.serverId, Permission.ManageMessages),
      this.permissions.hasServerPermission(userId, channel.serverId, Permission.ManageChannels),
    ]);
    if (canManageMessages || canManageChannels) return;

    const lastMessage = await this.prisma.message.findFirst({
      where: { channelId: channel.id, authorId: userId, threadId: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const retryAfter = slowmodeRetryAfterSeconds(
      lastMessage?.createdAt,
      channel.slowmodeSeconds,
      new Date(),
    );
    if (retryAfter > 0) {
      throw new HttpException(
        `Slowmode is enabled. Try again in ${retryAfter}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async requireThreadRoot(userId: string, rootMessageId: string) {
    const rootMessage = await this.prisma.message.findUnique({
      where: { id: rootMessageId },
      include: { ...messageInclude, channel: true },
    });
    if (!rootMessage || rootMessage.deletedAt || rootMessage.threadId) {
      throw new NotFoundException('Thread root message not found');
    }
    await this.channels.requireReadableChannel(userId, rootMessage.channelId);
    return rootMessage;
  }

  private async getThreadSummariesForRoots(userId: string, rootMessageIds: string[]) {
    if (!rootMessageIds.length) return new Map<string, ThreadSummary>();
    const threads = await this.prisma.thread.findMany({
      where: { rootMessageId: { in: rootMessageIds } },
      include: threadSummaryInclude,
    });
    return new Map(
      threads.map((thread) => [thread.rootMessageId, this.formatThreadSummary(thread, userId)]),
    );
  }

  private async getThreadSummary(userId: string, threadId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      include: threadSummaryInclude,
    });
    return thread ? this.formatThreadSummary(thread, userId) : null;
  }

  private formatThreadSummary(thread: ThreadWithSummary, userId: string): ThreadSummary {
    const messages = thread.messages.filter((message) => !message.deletedAt);
    const lastReply = messages[0] ?? null;
    return {
      id: thread.id,
      rootMessageId: thread.rootMessageId,
      channelId: thread.channelId,
      title: thread.title,
      tags: thread.tags
        .map(({ tag }) => tag)
        .sort((left, right) => left.position - right.position)
        .map(({ id, name }) => ({ id, name })),
      replyCount: thread._count.messages,
      lastReplyAt: lastReply?.createdAt ?? thread.updatedAt,
      participants: thread.participants.map((participant) => ({
        user: participant.user,
        lastReadAt: participant.userId === userId ? participant.lastReadAt : null,
      })),
    };
  }

  /**
   * Root messages carrying their thread summaries, in the order given; unknown ids are skipped. The
   * caller has already checked that the viewer can read the channel.
   */
  async listThreadRoots(userId: string, rootMessageIds: string[]): Promise<Message[]> {
    const [roots, threadMap] = await Promise.all([
      this.prisma.message.findMany({
        where: { id: { in: rootMessageIds } },
        include: messageInclude,
      }),
      this.getThreadSummariesForRoots(userId, rootMessageIds),
    ]);
    const rootMap = new Map(roots.map((root) => [root.id, root]));
    return rootMessageIds.flatMap((id) => {
      const root = rootMap.get(id);
      return root ? [formatMessage(root, userId, undefined, threadMap.get(id))] : [];
    });
  }

  /**
   * Refuses the send before `prisma.message.create` if `content` contains `@everyone`, `@here`, or
   * a `@<role name>` and the author lacks `MentionEveryone` — a denied send must never create the
   * message row (docs/features/everyone-here-and-role-mentions.md). A plain `@username` never
   * requires this permission.
   */
  async requireMentionPermission(userId: string, serverId: string, content: string) {
    if (!content.includes('@')) return;
    const roles = await this.prisma.role.findMany({ where: { serverId }, select: { name: true } });
    const tokens = parseMentionTokens(
      content,
      roles.map((role) => role.name),
    );
    if (requiresMentionEveryonePermission(tokens)) {
      await this.permissions.requireServerPermission(userId, serverId, Permission.MentionEveryone);
    }
  }

  async notifyMentionedUsers(input: {
    authorId: string;
    authorUsername: string;
    serverId: string;
    channelId: string;
    channelName: string;
    /** Age-restricted channels get a content-free push body, whoever the recipient is. */
    isAgeRestricted: boolean;
    /** Required: every call site passes its channel's real value, so an `@everyone` fan-out in a
     * private channel can never fall back to the permissive default. */
    isPrivate: boolean;
    content: string;
  }) {
    if (!input.content.includes('@')) return;

    const roles = await this.prisma.role.findMany({
      where: { serverId: input.serverId },
      select: { id: true, name: true, isMentionable: true },
    });
    const tokens = parseMentionTokens(
      input.content,
      roles.map((role) => role.name),
    );
    if (!tokens.length) return;

    const wantsEveryone = tokens.some((token) => token.kind === 'everyone');
    const wantsHere = tokens.some((token) => token.kind === 'here');
    const roleNamesLower = new Set(
      tokens.flatMap((token) => (token.kind === 'role' ? [token.name.toLowerCase()] : [])),
    );
    const usernames = [
      ...new Set(tokens.flatMap((token) => (token.kind === 'user' ? [token.username] : []))),
    ];

    const recipientIds = new Set<string>();

    if (wantsEveryone || wantsHere || roleNamesLower.size) {
      const members = await this.prisma.serverMember.findMany({
        where: { serverId: input.serverId },
        select: {
          id: true,
          kind: true,
          user: { select: { id: true, status: true } },
          roles: {
            select: { roleId: true, role: { select: { permissions: true } } },
          },
        },
      });
      const viewers = await this.permissions.filterMembersWhoCanView(
        { id: input.channelId, isPrivate: input.isPrivate ?? false },
        members,
      );

      if (wantsEveryone) {
        for (const member of viewers) recipientIds.add(member.user.id);
      }
      if (wantsHere) {
        for (const member of viewers) {
          if (member.user.status === 'ONLINE') recipientIds.add(member.user.id);
        }
      }
      if (roleNamesLower.size) {
        // A @role mention already required MentionEveryone to be typed at all (requireMentionPermission),
        // so the sender holding it is always true here; checked explicitly anyway to match the rule
        // literally (docs/features/everyone-here-and-role-mentions.md, Rules item 2).
        const senderCanMentionEveryone = await this.permissions.hasServerPermission(
          input.authorId,
          input.serverId,
          Permission.MentionEveryone,
        );
        const mentionedRoleIds = new Set(
          roles
            .filter(
              (role) =>
                roleNamesLower.has(role.name.toLowerCase()) &&
                (role.isMentionable || senderCanMentionEveryone),
            )
            .map((role) => role.id),
        );
        for (const member of viewers) {
          if (member.roles.some((memberRole) => mentionedRoleIds.has(memberRole.roleId))) {
            recipientIds.add(member.user.id);
          }
        }
      }
    }

    if (usernames.length) {
      const mentionedUsers = await this.prisma.user.findMany({
        where: {
          username: { in: usernames, mode: 'insensitive' },
          memberships: { some: { serverId: input.serverId } },
        },
        select: { id: true },
      });
      await Promise.all(
        mentionedUsers.map(async (user) => {
          const canViewChannel = await this.permissions.hasChannelPermission(
            user.id,
            input.channelId,
            Permission.ViewChannel,
          );
          if (canViewChannel) recipientIds.add(user.id);
        }),
      );
    }

    await Promise.all(
      [...recipientIds].map((toUserId) =>
        this.push.sendMentionPush({
          toUserId,
          fromUserId: input.authorId,
          fromUsername: input.authorUsername,
          serverId: input.serverId,
          channelId: input.channelId,
          channelName: input.channelName,
          isAgeRestricted: input.isAgeRestricted,
          content: input.content,
        }),
      ),
    );
  }

  private async writeAuditLog(
    serverId: string,
    actorId: string,
    action: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { serverId, actorId, action, targetId, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}
