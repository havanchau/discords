import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import {
  directMessageInclude,
  findFormattedDirectMessage,
  formatDirectMessages,
  requireConversationMembership,
} from './direct-message.format';
import { DirectMessageReactionDto } from './dto/direct-message-reaction.dto';
import { UpdateDirectMessageDto } from './dto/update-direct-message.dto';

const MAX_PINS_PER_CONVERSATION = 50;

@Injectable()
export class DirectMessageActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async listPins(userId: string, conversationId: string) {
    await requireConversationMembership(this.prisma, userId, conversationId);
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId, pinnedAt: { not: null }, deletedAt: null },
      include: directMessageInclude,
      orderBy: { pinnedAt: 'desc' },
      take: MAX_PINS_PER_CONVERSATION,
    });
    return { messages: await formatDirectMessages(this.prisma, messages) };
  }

  async updateMessage(userId: string, messageId: string, dto: UpdateDirectMessageDto) {
    const message = await this.requireActiveMessage(userId, messageId);
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }
    // The text of a poll message is its question, which is immutable.
    const poll = await this.prisma.poll.findUnique({
      where: { directMessageId: messageId },
      select: { id: true },
    });
    if (poll) throw new ForbiddenException('Poll messages cannot be edited');
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Message content cannot be empty');

    await this.prisma.directMessage.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
    });
    return this.emitAndReturn(message.conversationId, messageId, 'dm:updated');
  }

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.requireMessage(userId, messageId);
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this message');
    }
    if (!message.deletedAt) {
      await this.prisma.directMessage.update({
        where: { id: messageId },
        data: { content: '', deletedAt: new Date(), pinnedAt: null, pinnedById: null },
      });
    }
    return this.emitAndReturn(message.conversationId, messageId, 'dm:deleted');
  }

  async toggleReaction(userId: string, messageId: string, dto: DirectMessageReactionDto) {
    const message = await this.requireActiveMessage(userId, messageId);
    const where = { messageId_userId_emoji: { messageId, userId, emoji: dto.emoji } };
    const existing = await this.prisma.directMessageReaction.findUnique({ where });
    // deleteMany / skipDuplicates keep concurrent toggles (double clicks) from failing on races.
    if (existing) {
      await this.prisma.directMessageReaction.deleteMany({ where: where.messageId_userId_emoji });
    } else {
      await this.prisma.directMessageReaction.createMany({
        data: [{ messageId, userId, emoji: dto.emoji }],
        skipDuplicates: true,
      });
    }
    return this.emitAndReturn(message.conversationId, messageId, 'dm:reaction-updated');
  }

  async togglePin(userId: string, messageId: string) {
    const message = await this.requireActiveMessage(userId, messageId);
    const pinned = !message.pinnedAt;
    if (pinned) {
      const pinCount = await this.prisma.directMessage.count({
        where: { conversationId: message.conversationId, pinnedAt: { not: null } },
      });
      if (pinCount >= MAX_PINS_PER_CONVERSATION) {
        throw new BadRequestException('Pin limit reached');
      }
    }

    await this.prisma.directMessage.update({
      where: { id: messageId },
      data: pinned
        ? { pinnedAt: new Date(), pinnedById: userId }
        : { pinnedAt: null, pinnedById: null },
    });
    const result = await this.emitAndReturn(message.conversationId, messageId, 'dm:updated');
    return { pinned, ...result };
  }

  private async requireMessage(userId: string, messageId: string) {
    const message = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    await requireConversationMembership(this.prisma, userId, message.conversationId);
    return message;
  }

  private async requireActiveMessage(userId: string, messageId: string) {
    const message = await this.requireMessage(userId, messageId);
    if (message.deletedAt) throw new NotFoundException('Message not found');
    return message;
  }

  // Persist first, emit second: callers only reach this after their write has committed.
  private async emitAndReturn(conversationId: string, messageId: string, event: string) {
    const message = await findFormattedDirectMessage(this.prisma, messageId);
    this.realtime.emitToRoom(this.realtime.conversationRoom(conversationId), event, message);
    return { message };
  }
}
