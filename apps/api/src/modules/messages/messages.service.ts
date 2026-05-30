import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly permissions: PermissionsService
  ) {}

  async listMessages(userId: string, channelId: string, cursor?: string) {
    await this.channels.requireReadableChannel(userId, channelId);
    const messages = await this.prisma.message.findMany({
      where: { channelId },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        attachments: true,
        reactions: true
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {})
    });

    return {
      messages: messages.reverse(),
      nextCursor: messages.length === 50 ? messages[messages.length - 1]?.id : null
    };
  }

  async createMessage(userId: string, channelId: string, dto: CreateMessageDto) {
    const channel = await this.channels.requireReadableChannel(userId, channelId);
    await this.permissions.requireServerPermission(userId, channel.serverId, Permission.SendMessages);
    const content = dto.content.trim();
    const attachments = dto.attachments ?? [];

    if (!content && attachments.length === 0) {
      throw new ForbiddenException('Message content cannot be empty without attachments');
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
                url: attachment.url
              }))
            }
          : undefined
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        attachments: true,
        reactions: true
      }
    });

    return { message };
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
        editedAt: new Date()
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        attachments: true,
        reactions: true
      }
    });
    return { message: updated };
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
      Permission.ManageMessages
    );
    if (message.authorId !== userId && !canModerate) {
      throw new ForbiddenException('Only the author or message manager can delete this message');
    }

    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        deletedAt: new Date()
      }
    });
    return { message: deleted };
  }
}
