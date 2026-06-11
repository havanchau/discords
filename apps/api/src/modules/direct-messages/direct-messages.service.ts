import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DirectMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
  ) {}

  async listConversations(userId: string) {
    const conversations = await this.prisma.directConversation.findMany({
      where: { members: { some: { userId } } },
      include: this.conversationInclude(userId),
      orderBy: { updatedAt: 'desc' },
    });

    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conversation) => ({
        ...conversation,
        unreadCount: await this.countUnreadMessages(userId, conversation.id),
      })),
    );

    return { conversations: conversationsWithUnread };
  }

  async listMessages(userId: string, conversationId: string, cursor?: string) {
    await this.requireConversationMember(userId, conversationId);
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      include: this.messageInclude(),
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const ordered = messages.reverse();
    const latestMessage = ordered[ordered.length - 1];
    if (!cursor && latestMessage) {
      await this.markRead(userId, conversationId, latestMessage.id, { emit: true });
    }
    return {
      messages: ordered,
      nextCursor: messages.length === 50 ? messages[messages.length - 1]?.id : null,
    };
  }

  async createMessage(userId: string, conversationId: string, dto: CreateDirectMessageDto) {
    await this.requireConversationMember(userId, conversationId);
    const content = dto.content.trim();
    if (!content) throw new ForbiddenException('Message content cannot be empty');

    const message = await this.prisma.directMessage.create({
      data: { conversationId, authorId: userId, content },
      include: this.messageInclude(),
    });
    await Promise.all([
      this.prisma.directConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
      this.markRead(userId, conversationId, message.id, { emit: false }),
    ]);

    const recipientIds = await this.getConversationRecipientIds(userId, conversationId);
    this.realtime.emitToRooms(
      [
        this.realtime.conversationRoom(conversationId),
        ...recipientIds.map((recipientId) => this.realtime.userRoom(recipientId)),
      ],
      'dm:created',
      message,
    );
    await this.emitDirectUnread(recipientIds, conversationId, message.id);
    await Promise.all(
      recipientIds.map((recipientId) =>
        this.notifications.create({
          userId: recipientId,
          actorId: userId,
          type: 'DIRECT_MESSAGE',
          title: `New DM from ${message.author.displayName}`,
          body: message.content.slice(0, 180),
          conversationId,
        }),
      ),
    );
    return { message };
  }

  async markConversationRead(userId: string, conversationId: string, messageId?: string) {
    await this.requireConversationMember(userId, conversationId);
    await this.markRead(userId, conversationId, messageId, { emit: true });
    return { ok: true };
  }

  private async requireConversationMember(userId: string, conversationId: string) {
    const membership = await this.prisma.directConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership) throw new NotFoundException('Conversation not found');
    return membership;
  }

  private async getConversationRecipientIds(authorId: string, conversationId: string) {
    const recipients = await this.prisma.directConversationMember.findMany({
      where: { conversationId, userId: { not: authorId } },
      select: { userId: true },
    });
    return recipients.map((recipient) => recipient.userId);
  }

  private async markRead(
    userId: string,
    conversationId: string,
    messageId: string | undefined,
    options: { emit: boolean },
  ) {
    const latestMessage = messageId
      ? await this.prisma.directMessage.findFirst({
          where: { id: messageId, conversationId },
          select: { id: true, createdAt: true },
        })
      : await this.prisma.directMessage.findFirst({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, createdAt: true },
        });

    await this.prisma.directReadState.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      update: {
        lastReadMessageId: latestMessage?.id,
        lastReadAt: latestMessage?.createdAt ?? new Date(),
      },
      create: {
        userId,
        conversationId,
        lastReadMessageId: latestMessage?.id,
        lastReadAt: latestMessage?.createdAt ?? new Date(),
      },
    });

    if (options.emit) {
      this.realtime.emitToRoom(this.realtime.userRoom(userId), 'dm:unread', {
        conversationId,
        count: 0,
      });
    }
  }

  private async emitDirectUnread(recipientIds: string[], conversationId: string, messageId: string) {
    await Promise.all(
      recipientIds.map(async (recipientId) => {
        const count = await this.countUnreadMessages(recipientId, conversationId);
        this.realtime.emitToRoom(this.realtime.userRoom(recipientId), 'dm:unread', {
          conversationId,
          messageId,
          count,
        });
      }),
    );
  }

  private async countUnreadMessages(userId: string, conversationId: string) {
    const readState = await this.prisma.directReadState.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { lastReadAt: true },
    });

    return this.prisma.directMessage.count({
      where: {
        conversationId,
        authorId: { not: userId },
        ...(readState ? { createdAt: { gt: readState.lastReadAt } } : {}),
      },
    });
  }

  private messageInclude() {
    return {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    };
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
      messages: {
        include: this.messageInclude(),
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
      readStates: { where: { userId }, take: 1 },
    };
  }
}
