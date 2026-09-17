import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelsService } from '@/modules/channels/channels.service';
import {
  findFormattedDirectMessage,
  requireConversationMembership,
} from '@/modules/direct-messages/direct-message.format';
import { findBlockBetween } from '@/modules/friends/user-blocks';
import { MessagesService } from '@/modules/messages/messages.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import {
  formatPoll,
  pollInclude,
  pollUpdatedPayload,
  PollWithDetails,
  withoutViewerVotes,
} from './poll.format';
import { normalizePollText, pollStatus, validatePollExpiry } from './poll-status';

/** Where a poll lives: exactly one of `channelId` (with its server) or `conversationId` is set. */
interface PollContext {
  poll: PollWithDetails;
  channelId: string | null;
  serverId: string | null;
  conversationId: string | null;
}

@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async createChannelPoll(userId: string, channelId: string, dto: CreatePollDto) {
    // The same gates as sending a message: view, send, timeout, rules screening, slowmode.
    const channel = await this.messages.requireCanPostInChannel(userId, channelId);
    const input = this.normalizeInput(dto);
    const autoModAlerts = await this.messages.enforceAutoMod({
      userId,
      serverId: channel.serverId,
      channelId: channel.id,
      texts: [input.question, ...input.options],
    });

    const messageId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          channelId: channel.id,
          serverId: channel.serverId,
          authorId: userId,
          // The question doubles as the message text, so previews, search and replies read naturally.
          content: input.question,
          poll: { create: this.pollCreateData(userId, input) },
        },
        select: { id: true, poll: { select: { id: true } } },
      });
      await tx.auditLog.create({
        data: {
          serverId: channel.serverId,
          actorId: userId,
          action: 'POLL_CREATE',
          targetId: created.poll?.id,
          metadata: { pollId: created.poll?.id ?? null, question: input.question },
        },
      });
      return created.id;
    });

    const message = await this.messages.findMessageForUser(userId, messageId);
    this.realtime.emitToRoom(
      this.realtime.channelRoom(channel.id),
      'message:created',
      withoutViewerVotes(message),
    );
    await this.messages.postAutoModAlerts(autoModAlerts);
    return { message };
  }

  async createDirectPoll(userId: string, conversationId: string, dto: CreatePollDto) {
    await requireConversationMembership(this.prisma, userId, conversationId);
    const input = this.normalizeInput(dto);
    const conversation = await this.prisma.directConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { isGroup: true },
    });
    const recipientIds = await this.conversationRecipientIds(conversationId, userId);
    // Same rule as direct messages: blocks only apply to 1-1 conversations.
    if (
      !conversation.isGroup &&
      recipientIds.length === 1 &&
      (await findBlockBetween(this.prisma, userId, recipientIds[0]))
    ) {
      throw new ForbiddenException('You cannot message this user');
    }

    const messageId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.directMessage.create({
        data: {
          conversationId,
          authorId: userId,
          content: input.question,
          poll: { create: this.pollCreateData(userId, input) },
        },
        select: { id: true },
      });
      await tx.directConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return created.id;
    });

    const message = await findFormattedDirectMessage(this.prisma, messageId);
    this.realtime.emitToRooms(
      [
        this.realtime.conversationRoom(conversationId),
        ...recipientIds.map((recipientId) => this.realtime.userRoom(recipientId)),
      ],
      'dm:created',
      message,
    );
    return { message };
  }

  /** Read on demand by clients that want fresh voter names; realtime updates carry counts only. */
  async getPoll(userId: string, pollId: string) {
    const context = await this.requirePollContext(userId, pollId);
    return { poll: formatPoll(context.poll, userId) };
  }

  async vote(userId: string, pollId: string, dto: VotePollDto) {
    const context = await this.requirePollContext(userId, pollId);
    if (context.serverId) {
      await this.permissions.requireNotTimedOut(userId, context.serverId);
      await this.permissions.requireOnboardingAccepted(userId, context.serverId);
    }

    const optionIds = [...new Set(dto.optionIds)];
    if (!context.poll.allowMultiple && optionIds.length !== 1) {
      throw new BadRequestException('Choose exactly one option');
    }
    const pollOptionIds = new Set(context.poll.options.map((option) => option.id));
    if (optionIds.some((optionId) => !pollOptionIds.has(optionId))) {
      throw new BadRequestException('Unknown poll option');
    }

    await this.prisma.$transaction(async (tx) => {
      // Locking the poll row serializes a user's retried requests (so a replace never leaves the
      // union of two selections) and a vote racing a close.
      const [current] = await tx.$queryRaw<
        Array<{ expiresAt: Date | null; closedAt: Date | null }>
      >`
        SELECT "expiresAt", "closedAt" FROM "Poll" WHERE "id" = ${pollId} FOR UPDATE
      `;
      if (!current) throw new NotFoundException('Poll not found');
      if (pollStatus(current, new Date()) === 'CLOSED') {
        throw new ForbiddenException('This poll is closed');
      }
      await tx.pollVote.deleteMany({ where: { pollId, userId } });
      await tx.pollVote.createMany({
        data: optionIds.map((optionId) => ({ pollId, optionId, userId })),
      });
    });

    const poll = await this.loadPoll(pollId);
    await this.emitUpdated(poll, context, userId);
    return { poll: formatPoll(poll, userId) };
  }

  async close(userId: string, pollId: string) {
    const context = await this.requirePollContext(userId, pollId);
    if (context.poll.creatorId !== userId) {
      // DMs have no moderation roles, so only the creator can close a DM poll.
      const canModerate = context.channelId
        ? await this.permissions.hasChannelPermission(
            userId,
            context.channelId,
            Permission.ManageMessages,
          )
        : false;
      if (!canModerate) {
        throw new ForbiddenException(
          context.channelId
            ? 'Only the poll creator or message managers can close this poll'
            : 'Only the poll creator can close this poll',
        );
      }
    }

    const now = new Date();
    // Closing is irreversible and idempotent: an already closed or expired poll is returned as is.
    if (pollStatus(context.poll, now) === 'OPEN') {
      const closed = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.poll.updateMany({
          where: { id: pollId, closedAt: null },
          data: { closedAt: now },
        });
        if (count > 0 && context.serverId) {
          await tx.auditLog.create({
            data: {
              serverId: context.serverId,
              actorId: userId,
              action: 'POLL_CLOSE',
              targetId: pollId,
              metadata: { pollId },
            },
          });
        }
        return count > 0;
      });
      if (closed) {
        const poll = await this.loadPoll(pollId);
        await this.emitUpdated(poll, context, userId);
        return { poll: formatPoll(poll, userId) };
      }
    }
    return { poll: formatPoll(await this.loadPoll(pollId), userId) };
  }

  private normalizeInput(dto: CreatePollDto) {
    const text = normalizePollText(dto.question, dto.options);
    if ('error' in text) throw new BadRequestException(text.error);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt) {
      const message = validatePollExpiry(expiresAt, new Date());
      if (message) throw new BadRequestException(message);
    }
    return {
      ...text,
      allowMultiple: dto.allowMultiple ?? false,
      showVoters: dto.showVoters ?? false,
      expiresAt,
    };
  }

  private pollCreateData(userId: string, input: ReturnType<PollsService['normalizeInput']>) {
    return {
      creatorId: userId,
      question: input.question,
      allowMultiple: input.allowMultiple,
      showVoters: input.showVoters,
      expiresAt: input.expiresAt,
      options: {
        create: input.options.map((label, position) => ({ label, position })),
      },
    };
  }

  /** Voting and reading a poll need the same access as reading its message. */
  private async requirePollContext(userId: string, pollId: string): Promise<PollContext> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        ...pollInclude,
        message: { select: { channelId: true, serverId: true, deletedAt: true } },
        directMessage: { select: { conversationId: true, deletedAt: true } },
      },
    });
    if (poll?.message && !poll.message.deletedAt) {
      await this.channels.requireReadableChannel(userId, poll.message.channelId);
      return {
        poll,
        channelId: poll.message.channelId,
        serverId: poll.message.serverId,
        conversationId: null,
      };
    }
    if (poll?.directMessage && !poll.directMessage.deletedAt) {
      await requireConversationMembership(this.prisma, userId, poll.directMessage.conversationId);
      return {
        poll,
        channelId: null,
        serverId: null,
        conversationId: poll.directMessage.conversationId,
      };
    }
    throw new NotFoundException('Poll not found');
  }

  private loadPoll(pollId: string) {
    return this.prisma.poll.findUniqueOrThrow({ where: { id: pollId }, include: pollInclude });
  }

  private async emitUpdated(poll: PollWithDetails, context: PollContext, actorId: string) {
    const payload = pollUpdatedPayload(poll, context);
    if (context.channelId) {
      this.realtime.emitToRoom(
        this.realtime.channelRoom(context.channelId),
        'poll:updated',
        payload,
      );
      return;
    }
    if (!context.conversationId) return;
    const recipientIds = await this.conversationRecipientIds(context.conversationId, actorId);
    this.realtime.emitToRooms(
      [
        this.realtime.conversationRoom(context.conversationId),
        ...recipientIds.map((recipientId) => this.realtime.userRoom(recipientId)),
      ],
      'poll:updated',
      payload,
    );
  }

  private async conversationRecipientIds(conversationId: string, excludeUserId: string) {
    const members = await this.prisma.directConversationMember.findMany({
      where: { conversationId, userId: { not: excludeUserId } },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }
}
