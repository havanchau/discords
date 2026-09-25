import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RealtimeEvents,
  type DecisionDetailResult,
  type DecisionListResult,
  type DecisionView,
} from '@discord-clone/shared';
import { ChannelsService } from '@/modules/channels/channels.service';
import { readVoiceMaxBytes, toAttachmentCreateData } from '@/modules/messages/message-attachments';
import { notificationAuthorName } from '@/modules/messages/message.format';
import { MessagesService } from '@/modules/messages/messages.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { buildPollCreateData, withoutViewerVotes } from '@/modules/polls/poll.format';
import { validatePollExpiry } from '@/modules/polls/poll-status';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { ServersService } from '@/modules/servers/servers.service';
import { decisionInclude, formatDecision } from './decision.format';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { ListDecisionsQueryDto, ListServerDecisionsQueryDto } from './dto/list-decisions-query.dto';
import { ResolveDecisionDto } from './dto/resolve-decision.dto';
import { SupersedeDecisionDto } from './dto/supersede-decision.dto';

const DECISION_PAGE_SIZE = 25;

/**
 * Decision proposals (docs/features/decision-channels.md): a titled `Thread` (reused from forum
 * posts) with an Accept/Reject `Poll` (reused unchanged, via `buildPollCreateData`), and a status
 * lifecycle applied only through conditional `UPDATE`s. The deadline sweep
 * (`DecisionSweepService`) is the only other writer of `Decision.status`/`expiredAt`.
 */
@Injectable()
export class DecisionsService {
  private readonly voiceMaxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
    private readonly permissions: PermissionsService,
    private readonly servers: ServersService,
    private readonly realtime: RealtimePublisher,
    private readonly unread: RealtimeUnreadService,
    config: ConfigService,
  ) {
    this.voiceMaxBytes = readVoiceMaxBytes(config);
  }

  async createProposal(
    userId: string,
    channelId: string,
    dto: CreateDecisionDto,
  ): Promise<DecisionDetailResult> {
    // View, send permission, timeout, rules screening and slowmode, exactly as a channel send.
    const channel = await this.messages.requireCanPostInDecision(userId, channelId);
    const title = dto.title.trim();
    const content = dto.content.trim();
    const attachments = dto.attachments ?? [];
    if (!title) {
      throw new BadRequestException('Decision title is required');
    }
    if (!content && attachments.length === 0) {
      throw new ForbiddenException('Message content cannot be empty without attachments');
    }
    const votingDeadlineAt = new Date(dto.votingDeadlineAt);
    // The vote *is* the underlying poll's own expiry: the same bound, no separate one
    // (docs/features/decision-channels.md → Rules / Flow, `open-questions.md` #61).
    const expiryError = validatePollExpiry(votingDeadlineAt, new Date());
    if (expiryError) throw new BadRequestException(expiryError);

    // The title is screened with the body, so a rule cannot be dodged by writing it in the title.
    const autoModAlerts = await this.messages.enforceAutoMod({
      userId,
      serverId: channel.serverId,
      channelId,
      texts: [title, content],
    });

    const decisionId = await this.prisma.$transaction(async (tx) => {
      const root = await tx.message.create({
        data: {
          channelId,
          serverId: channel.serverId,
          authorId: userId,
          content,
          attachments: attachments.length
            ? { create: toAttachmentCreateData(attachments, this.voiceMaxBytes) }
            : undefined,
          // Accept/Reject, in this fixed order; showVoters true (organizational decisions need an
          // auditable "who voted which way"), expiresAt = the proposal's own voting deadline.
          poll: {
            create: buildPollCreateData(userId, {
              question: title,
              options: ['Accept', 'Reject'],
              allowMultiple: false,
              showVoters: true,
              expiresAt: votingDeadlineAt,
            }),
          },
        },
        select: { id: true },
      });
      const thread = await tx.thread.create({
        data: {
          channelId,
          serverId: channel.serverId,
          rootMessageId: root.id,
          createdById: userId,
          title,
          participants: { create: { userId } },
        },
        select: { id: true },
      });
      const decision = await tx.decision.create({
        data: {
          channelId,
          threadId: thread.id,
          proposerId: userId,
          votingDeadlineAt,
          quorumCount: dto.quorumCount ?? null,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          serverId: channel.serverId,
          actorId: userId,
          action: 'DECISION_CREATE',
          targetId: decision.id,
          metadata: {
            channelId,
            decisionId: decision.id,
            votingDeadlineAt: votingDeadlineAt.toISOString(),
            quorumCount: dto.quorumCount ?? null,
          },
        },
      });
      return decision.id;
    });

    const result = await this.loadDetail(decisionId, userId);

    // Persist first, emit second.
    this.realtime.emitToRoom(this.realtime.channelRoom(channelId), RealtimeEvents.DecisionCreated, {
      decision: withoutViewerVotes(result.decision),
      thread: result.thread,
      rootMessage: withoutViewerVotes(result.rootMessage),
    });
    const recipients = await this.unread.listUnreadRecipients(result.rootMessage);
    recipients.forEach((recipient) => {
      this.realtime.emitToRoom(this.realtime.userRoom(recipient.userId), 'unread:updated', {
        channelId,
        count: 1,
        mentions: recipient.mentions,
      });
    });
    await this.messages.notifyMentionedUsers({
      authorId: userId,
      authorUsername: notificationAuthorName(result.rootMessage.author),
      serverId: channel.serverId,
      channelId,
      channelName: channel.name,
      isAgeRestricted: channel.isAgeRestricted,
      content,
    });
    await this.messages.postAutoModAlerts(autoModAlerts);
    return result;
  }

  async listChannelDecisions(
    userId: string,
    channelId: string,
    query: ListDecisionsQueryDto,
  ): Promise<DecisionListResult> {
    await this.channels.requireReadableDecisionChannel(userId, channelId);
    const decisions = await this.prisma.decision.findMany({
      where: { channelId, ...(query.status ? { status: query.status } : {}) },
      include: decisionInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: DECISION_PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = decisions.slice(0, DECISION_PAGE_SIZE);
    return {
      decisions: page.map((decision) => formatDecision(decision, userId)),
      nextCursor: decisions.length > DECISION_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * The server-wide index: every decision that has left PROPOSED, across every DECISION channel the
   * caller can view (docs/features/decision-channels.md → Acceptance criteria). The date range
   * filters `decidedAt` — the moment recorded on the index's own "what did we decide, and when"
   * framing; not specified by the doc beyond that, so this is this implementation's choice.
   */
  async listServerDecisions(
    userId: string,
    serverId: string,
    query: ListServerDecisionsQueryDto,
  ): Promise<DecisionListResult> {
    await this.servers.requireMembership(userId, serverId);

    const channels = await this.prisma.channel.findMany({
      where: {
        serverId,
        type: 'DECISION',
        ...(query.channelId ? { id: query.channelId } : {}),
      },
      select: { id: true },
    });
    const visibleChannelIds: string[] = [];
    for (const channel of channels) {
      if (await this.permissions.hasChannelPermission(userId, channel.id, Permission.ViewChannel)) {
        visibleChannelIds.push(channel.id);
      }
    }
    if (!visibleChannelIds.length) {
      return { decisions: [], nextCursor: null };
    }

    const decisions = await this.prisma.decision.findMany({
      where: {
        channelId: { in: visibleChannelIds },
        status: query.status ? query.status : { not: 'PROPOSED' },
        ...(query.from || query.to
          ? {
              decidedAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: decisionInclude,
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
      take: DECISION_PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = decisions.slice(0, DECISION_PAGE_SIZE);
    return {
      decisions: page.map((decision) => formatDecision(decision, userId)),
      nextCursor: decisions.length > DECISION_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getDecision(userId: string, decisionId: string): Promise<DecisionDetailResult> {
    const decisionRow = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      select: { channelId: true },
    });
    if (!decisionRow) throw new NotFoundException('Decision not found');
    // 404, not 403, for an unreadable channel — matches `requireReadableChannel`'s convention.
    await this.channels.requireReadableChannel(userId, decisionRow.channelId);
    return this.loadDetail(decisionId, userId);
  }

  /** Resolve early, or (with no distinguishable caller) from the deadline sweep. Moderator-only via
   * the controller; the sweep calls the shared conditional-update helper directly instead. */
  async resolve(
    userId: string,
    decisionId: string,
    dto: ResolveDecisionDto,
  ): Promise<{ decision: DecisionView }> {
    const existing = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      select: { channelId: true },
    });
    if (!existing) throw new NotFoundException('Decision not found');
    const channel = await this.channels.requireReadableChannel(userId, existing.channelId);
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ManageMessages);

    const { count } = await this.prisma.decision.updateMany({
      where: { id: decisionId, status: 'PROPOSED' },
      data: { status: dto.status, decidedAt: new Date(), decidedById: userId },
    });
    if (count === 0) throw new ConflictException('Decision already resolved');

    await this.prisma.auditLog.create({
      data: {
        serverId: channel.serverId,
        actorId: userId,
        action: 'DECISION_RESOLVE',
        targetId: decisionId,
        metadata: { decisionId, status: dto.status },
      },
    });

    const decision = await this.formatById(decisionId, userId);
    this.emitUpdated(channel.serverId, channel.id, decision);
    return { decision };
  }

  async supersede(
    userId: string,
    decisionId: string,
    dto: SupersedeDecisionDto,
  ): Promise<{ decision: DecisionView }> {
    if (decisionId === dto.supersededByDecisionId) {
      throw new BadRequestException('A decision cannot supersede itself');
    }
    const existing = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      select: { channelId: true },
    });
    if (!existing) throw new NotFoundException('Decision not found');
    const channel = await this.channels.requireReadableChannel(userId, existing.channelId);
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ManageMessages);

    const successor = await this.prisma.decision.findUnique({
      where: { id: dto.supersededByDecisionId },
      select: { id: true },
    });
    if (!successor) throw new NotFoundException('Decision not found');

    const { count } = await this.prisma.decision.updateMany({
      where: { id: decisionId, status: 'ACCEPTED' },
      data: { status: 'SUPERSEDED', supersededByDecisionId: dto.supersededByDecisionId },
    });
    if (count === 0) throw new ConflictException('Decision is not an accepted decision');

    await this.prisma.auditLog.create({
      data: {
        serverId: channel.serverId,
        actorId: userId,
        action: 'DECISION_SUPERSEDE',
        targetId: decisionId,
        metadata: { decisionId, supersededByDecisionId: dto.supersededByDecisionId },
      },
    });

    const decision = await this.formatById(decisionId, userId);
    this.emitUpdated(channel.serverId, channel.id, decision);
    return { decision };
  }

  /** `decision:updated` on any status transition: the channel plus the live server index. */
  private emitUpdated(serverId: string, channelId: string, decision: DecisionView) {
    // Full view only to the channel room: everyone in it already passed the channel's view check.
    this.realtime.emitToRoom(
      this.realtime.channelRoom(channelId),
      RealtimeEvents.DecisionUpdated,
      withoutViewerVotes(decision),
    );
    // The server-wide index gets ids only, like `channel:updated`: the server room is not scoped per
    // channel, so a full payload would leak a private decision channel's title and status to members
    // who cannot view it. The refetch it triggers re-applies the channel visibility filter.
    this.realtime.emitToRoom(this.realtime.serverRoom(serverId), RealtimeEvents.DecisionIndexUpdated, {
      serverId,
      channelId,
      decisionId: decision.id,
    });
  }

  private async loadDetail(decisionId: string, viewerId: string): Promise<DecisionDetailResult> {
    const row = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
    if (!row) throw new NotFoundException('Decision not found');
    const decision = formatDecision(row, viewerId);
    const [post] = await this.messages.listThreadRoots(viewerId, [row.thread.rootMessageId]);
    if (!post || !post.thread) throw new NotFoundException('Thread root message not found');
    return { decision, thread: post.thread, rootMessage: post };
  }

  private async formatById(decisionId: string, viewerId: string | null): Promise<DecisionView> {
    const decision = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
    if (!decision) throw new NotFoundException('Decision not found');
    return formatDecision(decision, viewerId);
  }
}
