import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ScheduledMessage, ScheduledMessageStatus } from '@prisma/client';
import type { ScheduledMessageView } from '@discord-clone/shared';
import { ChannelsService } from '@/modules/channels/channels.service';
import { requireConversationMembership } from '@/modules/direct-messages/direct-message.format';
import type { MessageAttachmentInputDto } from '@/modules/messages/dto/create-message.dto';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CreateScheduledMessageDto } from './dto/create-scheduled-message.dto';
import { UpdateScheduledMessageDto } from './dto/update-scheduled-message.dto';
import {
  isFailureReason,
  readStoredAttachments,
  SCHEDULED_PENDING_LIMIT_PER_DESTINATION,
  toStoredAttachments,
  validateSendAt,
} from './scheduled-message.rules';

/** Exactly one of the two is set. */
type Destination =
  | { channelId: string; conversationId: null }
  | { channelId: null; conversationId: string };

/** The states the author may still change; a claimed or sent row is out of their hands. */
const EDITABLE_STATUSES: ScheduledMessageStatus[] = ['PENDING', 'FAILED'];

/**
 * CRUD for the caller's own scheduled messages. Schedule time only checks that the destination is
 * reachable; timeout, slowmode and block are checked when the sweep sends (`scheduled-message-sweep`).
 */
@Injectable()
export class ScheduledMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly permissions: PermissionsService,
  ) {}

  async createForChannel(userId: string, channelId: string, dto: CreateScheduledMessageDto) {
    const channel = await this.channels.requireReadableChannel(userId, channelId);
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.SendMessages);
    return this.create(userId, { channelId, conversationId: null }, dto);
  }

  async createForConversation(
    userId: string,
    conversationId: string,
    dto: CreateScheduledMessageDto,
  ) {
    await requireConversationMembership(this.prisma, userId, conversationId);
    return this.create(userId, { channelId: null, conversationId }, dto);
  }

  async listForChannel(userId: string, channelId: string) {
    await this.channels.requireReadableChannel(userId, channelId);
    return this.list(userId, { channelId, conversationId: null });
  }

  async listForConversation(userId: string, conversationId: string) {
    await requireConversationMembership(this.prisma, userId, conversationId);
    return this.list(userId, { channelId: null, conversationId });
  }

  /** Edits a pending message, or reschedules a failed one back to pending. */
  async update(userId: string, scheduledMessageId: string, dto: UpdateScheduledMessageDto) {
    // Scoped to the author, so another user's id reads as not found rather than forbidden.
    const existing = await this.prisma.scheduledMessage.findFirst({
      where: { id: scheduledMessageId, authorId: userId, status: { in: EDITABLE_STATUSES } },
    });
    if (!existing) throw new NotFoundException('Scheduled message not found');

    const content = dto.content !== undefined ? dto.content.trim() : existing.content;
    const attachments = dto.attachments ?? readStoredAttachments(existing.attachments);
    requireSomethingToSend(content, attachments);

    const sendAt = dto.sendAt ? new Date(dto.sendAt) : existing.sendAt;
    // A failed message's old time is in the past, so rescheduling it always needs a valid new one.
    if (dto.sendAt || existing.status === 'FAILED') requireValidSendAt(sendAt);
    if (existing.status === 'FAILED') {
      await this.requireBelowPendingLimit(userId, destinationOf(existing));
    }

    // Conditional on the status read above, so a sweep claiming the row meanwhile wins.
    const { count } = await this.prisma.scheduledMessage.updateMany({
      where: { id: existing.id, authorId: userId, status: existing.status },
      data: {
        content,
        attachments: toStoredAttachments(attachments),
        sendAt,
        status: 'PENDING',
        failureReason: null,
      },
    });
    if (count === 0) throw new NotFoundException('Scheduled message not found');

    const updated = await this.prisma.scheduledMessage.findUniqueOrThrow({
      where: { id: existing.id },
    });
    return { scheduledMessage: toView(updated) };
  }

  /** Cancels a pending message or dismisses a failed one. */
  async remove(userId: string, scheduledMessageId: string) {
    const { count } = await this.prisma.scheduledMessage.deleteMany({
      where: { id: scheduledMessageId, authorId: userId, status: { in: EDITABLE_STATUSES } },
    });
    if (count === 0) throw new NotFoundException('Scheduled message not found');
    return { ok: true };
  }

  private async create(userId: string, destination: Destination, dto: CreateScheduledMessageDto) {
    const sendAt = new Date(dto.sendAt);
    requireValidSendAt(sendAt);
    const content = dto.content.trim();
    const attachments = dto.attachments ?? [];
    requireSomethingToSend(content, attachments);
    if (dto.replyToMessageId) await this.requireReplyTarget(destination, dto.replyToMessageId);
    await this.requireBelowPendingLimit(userId, destination);

    const created = await this.prisma.scheduledMessage.create({
      data: {
        authorId: userId,
        channelId: destination.channelId,
        conversationId: destination.conversationId,
        content,
        attachments: toStoredAttachments(attachments),
        replyToMessageId: dto.replyToMessageId ?? null,
        sendAt,
      },
    });
    return { scheduledMessage: toView(created) };
  }

  private async list(
    userId: string,
    destination: Destination,
  ): Promise<{ scheduledMessages: ScheduledMessageView[] }> {
    const rows = await this.prisma.scheduledMessage.findMany({
      where: { authorId: userId, ...destination, status: { in: EDITABLE_STATUSES } },
      orderBy: { sendAt: 'asc' },
      take: SCHEDULED_PENDING_LIMIT_PER_DESTINATION,
    });
    return { scheduledMessages: rows.map(toView) };
  }

  private async requireReplyTarget(destination: Destination, replyToMessageId: string) {
    const target =
      destination.conversationId === null
        ? await this.prisma.message.findFirst({
            where: { id: replyToMessageId, channelId: destination.channelId, deletedAt: null },
            select: { id: true },
          })
        : await this.prisma.directMessage.findFirst({
            where: { id: replyToMessageId, conversationId: destination.conversationId },
            select: { id: true },
          });
    if (!target) throw new NotFoundException('Reply target not found');
  }

  private async requireBelowPendingLimit(userId: string, destination: Destination) {
    const pending = await this.prisma.scheduledMessage.count({
      where: { authorId: userId, ...destination, status: 'PENDING' },
    });
    if (pending >= SCHEDULED_PENDING_LIMIT_PER_DESTINATION) {
      throw new BadRequestException('Too many scheduled messages');
    }
  }
}

function requireValidSendAt(sendAt: Date) {
  const error = validateSendAt(sendAt, new Date());
  if (error) throw new BadRequestException(error);
}

function requireSomethingToSend(content: string, attachments: MessageAttachmentInputDto[]) {
  if (!content && attachments.length === 0) {
    throw new BadRequestException('Message content cannot be empty without attachments');
  }
}

function destinationOf(row: ScheduledMessage): Destination {
  if (row.channelId) return { channelId: row.channelId, conversationId: null };
  if (row.conversationId) return { channelId: null, conversationId: row.conversationId };
  throw new Error(`Scheduled message ${row.id} has no destination`);
}

function toView(row: ScheduledMessage): ScheduledMessageView {
  return {
    id: row.id,
    channelId: row.channelId,
    conversationId: row.conversationId,
    content: row.content,
    attachments: readStoredAttachments(row.attachments),
    replyToMessageId: row.replyToMessageId,
    sendAt: row.sendAt,
    status: row.status,
    failureReason: isFailureReason(row.failureReason) ? row.failureReason : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
