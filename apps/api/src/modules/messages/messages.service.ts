import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChannelsService } from '../channels/channels.service';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReactionDto } from './dto/reaction.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import {
  buildMessageSearchWhere,
  MessageSearchFilters,
  normalizeMessageSearchFilters,
} from './messages.search';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly permissions: PermissionsService,
    private readonly push: PushService,
    private readonly realtime: RealtimePublisher,
  ) {}

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
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            attachments: true,
            reactions: true,
          },
        })
      : [];
    const replyMap = new Map(
      replyMessages.map((message) => [message.id, this.formatMessage(message, userId)]),
    );
    const threadMap = await this.getThreadSummariesForRoots(
      userId,
      messages.map((message) => message.id),
    );

    return {
      messages: messages
        .reverse()
        .map((message) =>
          this.formatMessage(
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
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            attachments: true,
            reactions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      messages: pins
        .map((pin) => pin.message)
        .filter((message) => !message.deletedAt)
        .map((message) => this.formatMessage(message, userId)),
    };
  }

  async createMessage(userId: string, channelId: string, dto: CreateMessageDto) {
    const channel = await this.channels.requireReadableChannel(userId, channelId);
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.SendMessages);
    const content = dto.content.trim();
    const attachments = dto.attachments ?? [];

    if (!content && attachments.length === 0) {
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

    const message = await this.prisma.message.create({
      data: {
        channelId,
        serverId: channel.serverId,
        authorId: userId,
        content,
        replyToMessageId: dto.replyToMessageId,
        attachments: attachments.length
          ? {
              create: attachments.map((attachment) => ({
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                byteSize: attachment.byteSize,
                url: attachment.url,
              })),
            }
          : undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
        reactions: true,
      },
    });

    const replyToMessage = dto.replyToMessageId
      ? await this.prisma.message.findUnique({
          where: { id: dto.replyToMessageId },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            attachments: true,
            reactions: true,
          },
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

    return {
      message: this.formatMessage(
        message,
        userId,
        replyToMessage ? this.formatMessage(replyToMessage, userId) : undefined,
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
      rootMessage: this.formatMessage(rootMessage, userId, undefined, threadSummary ?? undefined),
      thread: threadSummary,
      messages: messages.map((message) => this.formatMessage(message, userId)),
    };
  }

  async createThreadMessage(userId: string, rootMessageId: string, dto: CreateMessageDto) {
    const rootMessage = await this.requireThreadRoot(userId, rootMessageId);
    await this.permissions.requireChannelPermission(
      userId,
      rootMessage.channelId,
      Permission.SendMessages,
    );
    const content = dto.content.trim();
    const attachments = dto.attachments ?? [];

    if (!content && attachments.length === 0) {
      throw new ForbiddenException('Message content cannot be empty without attachments');
    }

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
        attachments: attachments.length
          ? {
              create: attachments.map((attachment) => ({
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                byteSize: attachment.byteSize,
                url: attachment.url,
              })),
            }
          : undefined,
      },
      include: messageInclude,
    });

    await this.prisma.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    const threadSummary = await this.getThreadSummary(userId, thread.id);
    const formattedMessage = this.formatMessage(
      message,
      userId,
      this.formatMessage(rootMessage, userId),
    );
    const formattedRoot = this.formatMessage(rootMessage, userId, undefined, threadSummary);

    this.realtime.emitToRoom(
      this.realtime.channelRoom(rootMessage.channelId),
      'thread:message:created',
      {
        thread: threadSummary,
        rootMessage: formattedRoot,
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

    return { thread: threadSummary, rootMessage: formattedRoot, message: formattedMessage };
  }

  async updateMessage(userId: string, messageId: string, dto: UpdateMessageDto) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    await this.channels.requireReadableChannel(userId, message.channelId);
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: dto.content.trim(),
        editedAt: new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
        reactions: true,
      },
    });
    const formatted = this.formatMessage(updated, userId);
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
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
        reactions: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    await this.channels.requireReadableChannel(userId, message.channelId);
    const replyToMessage = message.replyToMessageId
      ? await this.prisma.message.findUnique({
          where: { id: message.replyToMessageId },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            attachments: true,
            reactions: true,
          },
        })
      : null;

    return this.formatMessage(
      message,
      userId,
      replyToMessage ? this.formatMessage(replyToMessage, userId) : undefined,
    );
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
      replyCount: thread._count.messages,
      lastReplyAt: lastReply?.createdAt ?? thread.updatedAt,
      participants: thread.participants.map((participant) => ({
        user: participant.user,
        lastReadAt:
          participant.userId === userId ? (participant.lastReadAt?.toISOString() ?? null) : null,
      })),
    };
  }

  private async notifyMentionedUsers(input: {
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

  private formatMessage(
    message: MessageWithDetails,
    userId: string,
    replyToMessage?: unknown,
    thread?: ThreadSummary | null,
  ) {
    const reactionMap = new Map<string, { emoji: string; count: number; me: boolean }>();

    message.reactions.forEach((reaction) => {
      const current = reactionMap.get(reaction.emoji) ?? {
        emoji: reaction.emoji,
        count: 0,
        me: false,
      };
      reactionMap.set(reaction.emoji, {
        ...current,
        count: current.count + 1,
        me: current.me || reaction.userId === userId,
      });
    });

    return {
      ...message,
      reactions: [...reactionMap.values()],
      replyToMessage,
      threadId: message.threadId,
      thread: thread ?? null,
    };
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

const messageInclude = {
  author: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  attachments: true,
  reactions: true,
} satisfies Prisma.MessageInclude;

type MessageWithDetails = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

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
  _count: { select: { messages: true } },
} satisfies Prisma.ThreadInclude;

type ThreadWithSummary = Prisma.ThreadGetPayload<{ include: typeof threadSummaryInclude }>;
type ThreadSummary = {
  id: string;
  rootMessageId: string;
  channelId: string;
  replyCount: number;
  lastReplyAt: Date;
  participants: Array<{
    user: { id: string; username: string; displayName: string; avatarUrl: string | null };
    lastReadAt: string | null;
  }>;
};

function parseMentions(content: string) {
  return [...content.matchAll(/@([a-zA-Z0-9_]+)/g)].map((match) => match[1]);
}
