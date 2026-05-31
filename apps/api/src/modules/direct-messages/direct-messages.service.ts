import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';

@Injectable()
export class DirectMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(userId: string) {
    const conversations = await this.prisma.directConversation.findMany({
      where: { members: { some: { userId } } },
      include: this.conversationInclude(userId),
      orderBy: { updatedAt: 'desc' },
    });
    return { conversations };
  }

  async listMessages(userId: string, conversationId: string, cursor?: string) {
    await this.requireConversationMember(userId, conversationId);
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      messages: messages.reverse(),
      nextCursor: messages.length === 50 ? messages[messages.length - 1]?.id : null,
    };
  }

  async createMessage(userId: string, conversationId: string, dto: CreateDirectMessageDto) {
    await this.requireConversationMember(userId, conversationId);
    const content = dto.content.trim();
    if (!content) throw new ForbiddenException('Message content cannot be empty');

    const message = await this.prisma.directMessage.create({
      data: { conversationId, authorId: userId, content },
    });
    await this.prisma.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return { message };
  }

  private async requireConversationMember(userId: string, conversationId: string) {
    const membership = await this.prisma.directConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership) throw new NotFoundException('Conversation not found');
    return membership;
  }

  private conversationInclude(userId: string) {
    return {
      members: {
        where: { userId: { not: userId } },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              status: true,
            },
          },
        },
      },
      messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
    };
  }
}
