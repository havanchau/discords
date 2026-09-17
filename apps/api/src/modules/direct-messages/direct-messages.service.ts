import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { DirectConversation } from '@discord-clone/shared';
import type { DirectMessage } from '@discord-clone/shared';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { countDirectUnread } from '@/modules/messages/unread-counts';
import { findBlockBetween } from '@/modules/friends/user-blocks';
import { readVoiceMaxBytes, toAttachmentCreateData } from '@/modules/messages/message-attachments';
import type { ForwardSnapshot } from '@/common/forward-snapshot';
import {
  directConversationInclude,
  directMessageInclude,
  formatDirectMessages,
  requireConversationMembership,
} from './direct-message.format';

@Injectable()
export class DirectMessagesService {
  private readonly voiceMaxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.voiceMaxBytes = readVoiceMaxBytes(config);
  }

  async listConversations(userId: string): Promise<{ conversations: DirectConversation[] }> {
    const conversations = await this.prisma.directConversation.findMany({
      where: { members: { some: { userId } } },
      include: directConversationInclude(userId),
      orderBy: { updatedAt: 'desc' },
    });

    const unreadCounts = await countDirectUnread(
      this.prisma,
      userId,
      conversations.map((conversation) => conversation.id),
    );
    const conversationsWithUnread = conversations.map((conversation) => ({
      ...conversation,
      unreadCount: unreadCounts[conversation.id] ?? 0,
    }));

    return { conversations: conversationsWithUnread };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
  ): Promise<{ messages: DirectMessage[]; nextCursor: string | null }> {
    await this.requireConversationMember(userId, conversationId);
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      include: directMessageInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const ordered = [...messages].reverse();
    const latestMessage = ordered[ordered.length - 1];
    if (!cursor && latestMessage) {
      await this.markRead(userId, conversationId, latestMessage.id, { emit: true });
    }
    return {
      messages: await formatDirectMessages(this.prisma, ordered, userId),
      nextCursor: messages.length === 50 ? messages[messages.length - 1]?.id : null,
    };
  }

  /** `forward` is set only by the forwarding module; a forward may have no text of its own. */
  async createMessage(
    userId: string,
    conversationId: string,
    dto: CreateDirectMessageDto,
    forward?: ForwardSnapshot,
  ) {
    await this.requireConversationMember(userId, conversationId);
    const content = dto.content.trim();
    const attachments = dto.attachments ?? [];
    if (!content && !attachments.length && !forward) {
      throw new ForbiddenException('Message content cannot be empty');
    }
    const conversation = await this.prisma.directConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { isGroup: true, name: true },
    });
    const recipientIds = await this.getConversationRecipientIds(userId, conversationId);
    // Blocks only apply to 1-1 conversations; group membership is managed separately.
    if (
      !conversation.isGroup &&
      recipientIds.length === 1 &&
      (await findBlockBetween(this.prisma, userId, recipientIds[0]))
    ) {
      throw new ForbiddenException('You cannot message this user');
    }

    if (dto.replyToMessageId) {
      const replyTarget = await this.prisma.directMessage.findFirst({
        where: { id: dto.replyToMessageId, conversationId },
        select: { id: true },
      });
      if (!replyTarget) throw new NotFoundException('Reply target not found');
    }

    const created = await this.prisma.directMessage.create({
      data: {
        conversationId,
        authorId: userId,
        content,
        replyToMessageId: dto.replyToMessageId,
        ...forward,
        attachments: attachments.length
          ? { create: toAttachmentCreateData(attachments, this.voiceMaxBytes) }
          : undefined,
      },
      include: directMessageInclude,
    });
    const [message] = await formatDirectMessages(this.prisma, [created]);
    await Promise.all([
      this.prisma.directConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
      this.markRead(userId, conversationId, message.id, { emit: false }),
    ]);

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
          title: directMessageNotificationTitle(conversation, message.author.displayName),
          body: (message.content || message.forwardOrigin?.content || '').slice(0, 180),
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

  private requireConversationMember(userId: string, conversationId: string) {
    return requireConversationMembership(this.prisma, userId, conversationId);
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

  private async emitDirectUnread(
    recipientIds: string[],
    conversationId: string,
    messageId: string,
  ) {
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
}

function directMessageNotificationTitle(
  conversation: { isGroup: boolean; name: string | null },
  authorName: string,
) {
  if (!conversation.isGroup) return `New DM from ${authorName}`;
  return conversation.name
    ? `New message in ${conversation.name}`
    : `New group message from ${authorName}`;
}
