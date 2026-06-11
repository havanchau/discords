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
        AND: buildMessageSearchWhere(filters),
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

    return {
      messages: messages
        .reverse()
        .map((message) =>
          this.formatMessage(message, userId, replyMap.get(message.replyToMessageId ?? '')),
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
      'message:updated',
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
      'message:deleted',
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

  private formatMessage(message: MessageWithDetails, userId: string, replyToMessage?: unknown) {
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

type MessageWithDetails = Prisma.MessageGetPayload<{
  include: {
    author: {
      select: {
        id: true;
        username: true;
        displayName: true;
        avatarUrl: true;
      };
    };
    attachments: true;
    reactions: true;
  };
}>;

function parseMentions(content: string) {
  return [...content.matchAll(/@([a-zA-Z0-9_]+)/g)].map((match) => match[1]);
}
