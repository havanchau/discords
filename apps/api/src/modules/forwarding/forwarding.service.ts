import { Injectable, NotFoundException } from '@nestjs/common';
import {
  carriedForwardSnapshot,
  forwardColumnsSelect,
  ForwardSnapshot,
} from '@/common/forward-snapshot';
import { ChannelsService } from '@/modules/channels/channels.service';
import { requireConversationMembership } from '@/modules/direct-messages/direct-message.format';
import { DirectMessagesService } from '@/modules/direct-messages/direct-messages.service';
import {
  StoredAttachment,
  storedAttachmentSelect,
  toAttachmentInput,
} from '@/modules/messages/message-attachments';
import { carriedStickerAttachment, isStickerAttachment } from '@/modules/messages/message-stickers';
import { MessagesService } from '@/modules/messages/messages.service';
import { withoutViewerVotes } from '@/modules/polls/poll.format';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { ForwardMessageDto } from './dto/forward-message.dto';

const attachmentSelect = {
  select: storedAttachmentSelect,
  orderBy: { createdAt: 'asc' as const },
};

/**
 * Copies a channel or direct message into a channel or conversation. Every call re-checks read access
 * to the source, then hands the write to the destination's own send method, so permission, timeout,
 * slowmode and block checks are exactly those of a normal send.
 */
@Injectable()
export class ForwardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
    private readonly directMessages: DirectMessagesService,
    private readonly unread: RealtimeUnreadService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async forwardChannelMessage(userId: string, messageId: string, dto: ForwardMessageDto) {
    const source = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        channelId: true,
        content: true,
        deletedAt: true,
        authorNameOverride: true,
        author: { select: { displayName: true } },
        channel: { select: { name: true } },
        attachments: attachmentSelect,
        ...forwardColumnsSelect,
      },
    });
    if (!source) throw new NotFoundException('Message not found');
    await this.channels.requireReadableChannel(userId, source.channelId);
    if (source.deletedAt) throw new NotFoundException('Message not found');

    // A poll message's content is its question, so a poll is forwarded as that text only: the poll,
    // its options and its votes are never copied.
    const snapshot = carriedForwardSnapshot(source) ?? {
      forwardedFromMessageId: messageId,
      forwardedFromDirectMessageId: null,
      // A webhook post is credited to the name it was posted with.
      forwardOriginAuthorName: source.authorNameOverride ?? source.author.displayName,
      forwardOriginContent: source.content,
      forwardOriginLabel: source.channel.name,
    };
    return this.deliver(userId, dto, snapshot, source.attachments);
  }

  async forwardDirectMessage(userId: string, messageId: string, dto: ForwardMessageDto) {
    const source = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
      select: {
        conversationId: true,
        content: true,
        deletedAt: true,
        author: { select: { displayName: true } },
        attachments: attachmentSelect,
        ...forwardColumnsSelect,
      },
    });
    if (!source) throw new NotFoundException('Message not found');
    await requireConversationMembership(this.prisma, userId, source.conversationId);
    if (source.deletedAt) throw new NotFoundException('Message not found');

    const snapshot = carriedForwardSnapshot(source) ?? {
      forwardedFromMessageId: null,
      forwardedFromDirectMessageId: messageId,
      forwardOriginAuthorName: source.author.displayName,
      forwardOriginContent: source.content,
      forwardOriginLabel: null,
    };
    return this.deliver(userId, dto, snapshot, source.attachments);
  }

  private async deliver(
    userId: string,
    dto: ForwardMessageDto,
    snapshot: ForwardSnapshot,
    attachments: StoredAttachment[],
  ) {
    // Voice metadata is carried, and re-validated by the destination's send path like any send. A
    // sticker is carried as a snapshot row outside the request attachments, which refuse that kind.
    const input = {
      content: dto.comment ?? '',
      attachments: attachments
        .filter((attachment) => !isStickerAttachment(attachment))
        .map(toAttachmentInput),
    };
    const stickers = attachments.filter(isStickerAttachment).map(carriedStickerAttachment);
    if (dto.destinationType === 'conversation') {
      // The direct-message send path persists, then emits `dm:created` and unread counts itself.
      return this.directMessages.createMessage(
        userId,
        dto.destinationId,
        input,
        snapshot,
        stickers,
      );
    }

    const result = await this.messages.createMessage(
      userId,
      dto.destinationId,
      input,
      snapshot,
      stickers,
    );
    // Persist first, emit second. `createMessage` does not broadcast (the socket gateway does for a
    // normal send), so a REST forward emits the same events here.
    const message = result.message;
    this.realtime.emitToRoom(
      this.realtime.channelRoom(message.channelId),
      'message:created',
      withoutViewerVotes(message),
    );
    const recipients = await this.unread.listUnreadRecipients(message);
    recipients.forEach((recipient) => {
      this.realtime.emitToRoom(this.realtime.userRoom(recipient.userId), 'unread:updated', {
        channelId: message.channelId,
        count: 1,
        mentions: recipient.mentions,
      });
    });
    return result;
  }
}
