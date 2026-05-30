import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService
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
    const content = dto.content.trim();

    if (!content) {
      throw new ForbiddenException('Message content cannot be empty without attachments');
    }

    const message = await this.prisma.message.create({
      data: {
        channelId,
        serverId: channel.serverId,
        authorId: userId,
        content,
        replyToMessageId: dto.replyToMessageId
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
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this message in the MVP');
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
