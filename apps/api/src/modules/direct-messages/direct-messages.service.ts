import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type {
  DirectConversationMuteResult,
  DirectConversationWithMute,
} from '@discord-clone/shared';
import type { DirectMessage } from '@discord-clone/shared';
import { RealtimeEvents } from '@discord-clone/shared';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { UpdateDirectConversationMuteDto } from './dto/update-direct-conversation-mute.dto';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PushService } from '@/modules/push/push.service';
import { countDirectUnread } from '@/modules/messages/unread-counts';
import { findBlockBetween } from '@/modules/friends/user-blocks';
import { readVoiceMaxBytes, toAttachmentCreateData } from '@/modules/messages/message-attachments';
import type { StickerAttachmentData } from '@/modules/messages/message-stickers';
import type { ForwardSnapshot } from '@/common/forward-snapshot';
import { resolveMutedUntil } from '@/modules/users/notification-mute';
import {
  directConversationInclude,
  directMessageInclude,
  formatDirectMessages,
  loadDirectConversationMutes,
  requireConversationMembership,
} from './direct-message.format';

@Injectable()
export class DirectMessagesService {
  private readonly voiceMaxBytes: number;
  private readonly logger = new Logger(DirectMessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    config: ConfigService,
  ) {
    this.voiceMaxBytes = readVoiceMaxBytes(config);
  }

  async listConversations(
    userId: string,
  ): Promise<{ conversations: DirectConversationWithMute[] }> {
    const conversations = await this.prisma.directConversation.findMany({
      where: { members: { some: { userId } } },
      include: directConversationInclude(userId),
      orderBy: { updatedAt: 'desc' },
    });
    const conversationIds = conversations.map((conversation) => conversation.id);

    const [unreadCounts, mutes] = await Promise.all([
      countDirectUnread(this.prisma, userId, conversationIds),
      loadDirectConversationMutes(this.prisma, userId, conversationIds),
    ]);
    const conversationsWithUnread = conversations.map((conversation) => {
      const mute = mutes[conversation.id];
      return {
        ...conversation,
        unreadCount: unreadCounts[conversation.id] ?? 0,
        muted: mute?.muted ?? false,
        mutedUntil: mute?.mutedUntil?.toISOString() ?? null,
      };
    });

    return { conversations: conversationsWithUnread };
  }

  /**
   * The one write path for a conversation's DM push mute (docs/features/dm-conversation-mute.md).
   * Upserts on `(userId, conversationId)`, mirroring `UsersService.updateNotificationPreference`'s
   * mute rules exactly: `muted: false` always clears `mutedUntil`, `muteDuration` without
   * `muted: true` is a 400, and re-muting overwrites `mutedUntil` from `now` (no merge with any
   * remaining time).
   */
  async muteConversation(
    userId: string,
    conversationId: string,
    dto: UpdateDirectConversationMuteDto,
  ): Promise<DirectConversationMuteResult> {
    if (dto.muteDuration !== undefined && dto.muted !== true) {
      throw new BadRequestException('Mute duration requires muted to be true');
    }
    await this.requireConversationMember(userId, conversationId);

    const mutedUntil = dto.muted
      ? resolveMutedUntil(dto.muteDuration ?? 'forever', new Date())
      : null;
    await this.prisma.directConversationMute.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      update: { muted: dto.muted, mutedUntil },
      create: { userId, conversationId, muted: dto.muted, mutedUntil },
    });

    // Own preference only: no other member's client needs to react to it, so this goes to the
    // caller's own room, never the conversation room (RealtimeEvents.DmConversationUpdated already
    // has a client listener that refetches the conversation list, no payload read).
    this.realtime.emitToRoom(this.realtime.userRoom(userId), RealtimeEvents.DmConversationUpdated, {
      conversationId,
    });

    return {
      conversationId,
      muted: dto.muted,
      mutedUntil: mutedUntil?.toISOString() ?? null,
    };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
  ): Promise<{
    messages: DirectMessage[];
    nextCursor: string | null;
    lastReadMessageId?: string | null;
    lastReadAt?: Date | null;
  }> {
    await this.requireConversationMember(userId, conversationId);
    const readState = await this.prisma.directReadState.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      include: directMessageInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const ordered = [...messages].reverse();
    return {
      messages: await formatDirectMessages(this.prisma, ordered, userId),
      nextCursor: messages.length === 50 ? messages[messages.length - 1]?.id : null,
      lastReadMessageId: readState?.lastReadMessageId ?? null,
      lastReadAt: readState?.lastReadAt ?? null,
    };
  }

  /**
   * `forward` and `carriedStickers` are set only by the forwarding module; a forward may have no text
   * of its own. Stickers are never sent directly in a DM, only carried by a forward.
   */
  async createMessage(
    userId: string,
    conversationId: string,
    dto: CreateDirectMessageDto,
    forward?: ForwardSnapshot,
    carriedStickers: StickerAttachmentData[] = [],
  ) {
    await this.requireConversationMember(userId, conversationId);
    const content = dto.content.trim();
    const attachments = [
      ...toAttachmentCreateData(dto.attachments ?? [], this.voiceMaxBytes),
      ...carriedStickers,
    ];
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
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: directMessageInclude,
    });
    const [message] = await formatDirectMessages(this.prisma, [created]);
    await this.prisma.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    await this.announceCreatedMessage(userId, conversationId, conversation, recipientIds, message);
    return { message };
  }

  /**
   * Everything after a direct message is stored: the author's read state, the live message, the
   * recipients' unread badges and notifications. Direct polls call it too, so a poll arrives exactly
   * like a message.
   */
  async announceCreatedMessage(
    authorId: string,
    conversationId: string,
    conversation: { isGroup: boolean; name: string | null },
    recipientIds: string[],
    message: FormattedDirectMessage,
  ) {
    await this.markRead(authorId, conversationId, message.id, { emit: false });
    this.realtime.emitToRooms(
      [
        this.realtime.conversationRoom(conversationId),
        ...recipientIds.map((recipientId) => this.realtime.userRoom(recipientId)),
      ],
      'dm:created',
      message,
    );
    await this.emitDirectUnread(recipientIds, conversationId, message.id);
    const title = directMessageNotificationTitle(conversation, message.author.displayName);
    const body = message.content || message.forwardOrigin?.content || '';
    await Promise.all(
      recipientIds.map((recipientId) =>
        this.notifications.create({
          userId: recipientId,
          actorId: authorId,
          type: 'DIRECT_MESSAGE',
          title,
          body: body.slice(0, 180),
          conversationId,
        }),
      ),
    );
    // Push is a non-DB side effect: the message, in-app notifications, and unread state above are
    // already committed, so a push failure must never fail the DM-create request (rules/failure-and-state.md).
    await this.sendDirectMessagePushes(authorId, conversationId, recipientIds, title, body);
  }

  private async sendDirectMessagePushes(
    authorId: string,
    conversationId: string,
    recipientIds: string[],
    title: string,
    body: string,
  ) {
    // Read here rather than threaded through `announceCreatedMessage`, whose other caller (direct
    // polls) passes its own conversation select.
    const { isEncrypted } = await this.prisma.directConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { isEncrypted: true },
    });
    await Promise.all(
      recipientIds.map(async (recipientId) => {
        try {
          await this.push.sendDirectMessagePush({
            toUserId: recipientId,
            fromUserId: authorId,
            conversationId,
            title,
            body,
            isEncrypted,
          });
        } catch (err) {
          this.logger.warn(
            `Direct message push failed for recipient ${recipientId} on conversation ${conversationId}: ${String(err)}`,
          );
        }
      }),
    );
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

type FormattedDirectMessage = Awaited<ReturnType<typeof formatDirectMessages>>[number];

function directMessageNotificationTitle(
  conversation: { isGroup: boolean; name: string | null },
  authorName: string,
) {
  if (!conversation.isGroup) return `New DM from ${authorName}`;
  return conversation.name
    ? `New message in ${conversation.name}`
    : `New group message from ${authorName}`;
}
