import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, Prisma } from '@prisma/client';
import type { Message, ThreadSummary } from '@discord-clone/shared';
import { ForwardSnapshot } from '@/common/forward-snapshot';
import {
  AutoModAlert,
  AutoModScreeningService,
  AutoModScreenInput,
} from '@/modules/automod/automod-screening.service';
import { ChannelsService } from '@/modules/channels/channels.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { withoutViewerVotes } from '@/modules/polls/poll.format';
import { PushService } from '@/modules/push/push.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { formatMessage, messageInclude } from './message.format';
import { readVoiceMaxBytes, toAttachmentCreateData } from './message-attachments';
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

    return {
      messages: messages
        .reverse()
        .map((message) =>
          formatMessage(
            message,
            userId,
            replyMap.get(message.replyToMessageId ?? ''),
            threadMap.get(message.id),
          ),
        ),
      nextCursor: messages.length === 50 ? messages[messages.length - 1]?.id : null,
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
    return this.passSendGates(userId, channel);
  }

  /** The same gates for a forum post, the only top-level message a FORUM channel accepts. */
  async requireCanPostInForum(userId: string, channelId: string) {
    const channel = await this.channels.requireReadableForumChannel(userId, channelId);
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
      authorUsername: message.author.username,
      serverId: channel.serverId,
      channelId: channel.id,
      channelName: channel.name,
      content,
    });
    await this.postAutoModAlerts(autoModAlerts);

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
    const sticker = await resolveStickerAttachment(this.prisma, dto.stickerId, rootMessage.serverId);
    const attachments = [
      ...toAttachmentCreateData(dto.attachments ?? [], this.voiceMaxBytes),
      ...(sticker ? [sticker] : []),
    ];

    if (!content && attachments.length === 0) {
      throw new ForbiddenException('Message content cannot be empty without attachments');
    }
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
      authorUsername: message.author.username,
      serverId: rootMessage.serverId,
      channelId: rootMessage.channelId,
      channelName: rootMessage.channel.name,
      content,
    });
    await this.postAutoModAlerts(autoModAlerts);

    return { thread: threadSummary, rootMessage: formattedRoot, message: formattedMessage };
  }

  async updateMessage(userId: string, messageId: string, dto: UpdateMessageDto) {
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

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content,
        editedAt: new Date(),
      },
      include: messageInclude,
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

    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        deletedAt: new Date(),
      },
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

  async notifyMentionedUsers(input: {
    authorId: string;
    authorUsername: string;
    serverId: string;
    channelId: string;
    channelName: string;
    content: string;
  }) {
    const mentionedUsernames = [...new Set(parseMentions(input.content))];
    if (!mentionedUsernames.length) return;

    const mentionedUsers = await this.prisma.user.findMany({
      where: {
        username: { in: mentionedUsernames, mode: 'insensitive' },
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
        if (!canViewChannel) return;

        await this.push.sendMentionPush({
          toUserId: user.id,
          fromUserId: input.authorId,
          fromUsername: input.authorUsername,
          serverId: input.serverId,
          channelId: input.channelId,
          channelName: input.channelName,
          content: input.content,
        });
      }),
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

const threadSummaryInclude = {
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
  participants: {
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  },
  tags: { select: { tag: { select: { id: true, name: true, position: true } } } },
  _count: { select: { messages: true } },
} satisfies Prisma.ThreadInclude;

type ThreadWithSummary = Prisma.ThreadGetPayload<{ include: typeof threadSummaryInclude }>;
function parseMentions(content: string) {
  return [...content.matchAll(/@([a-zA-Z0-9_]+)/g)].map((match) => match[1]);
}

function errorStack(error: unknown) {
  return error instanceof Error ? error.stack : String(error);
}
