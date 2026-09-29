import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { RealtimeEvents } from '@discord-clone/shared';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { decisionInclude, formatDecision } from './decision.format';

/** A decision deadline has none of scheduled-messages' "post it now" urgency. */
const DECISION_SWEEP_INTERVAL_MS = 30_000;
/** Upper bound on decisions resolved/expired per tick, so one tick cannot run into the next. */
const DECISION_SWEEP_BATCH = 50;

/**
 * Resolves (or expires) decisions whose voting deadline has passed
 * (docs/features/decision-channels.md → Deadline resolution). Follows `ReminderSweepService`
 * exactly: every API instance runs this timer; the conditional `updateMany` (`status: 'PROPOSED'`)
 * is the only place that decides an outcome, so two instances racing the same due decision cannot
 * both resolve it.
 */
@Injectable()
export class DecisionSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DecisionSweepService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.sweep();
    }, DECISION_SWEEP_INTERVAL_MS);
    // Un-refed, like ReminderSweepService, so the timer never keeps the process alive alone.
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep() {
    // A slow tick must not overlap the next one on the same instance.
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      const now = new Date();
      const due = await this.prisma.decision.findMany({
        where: { status: 'PROPOSED', expiredAt: null, votingDeadlineAt: { lte: now } },
        orderBy: { votingDeadlineAt: 'asc' },
        take: DECISION_SWEEP_BATCH,
        select: { id: true, channelId: true, quorumCount: true },
      });

      for (const decision of due) {
        await this.resolveOne(decision, now);
      }
    } catch (error) {
      this.logger.error('Decision deadline sweep failed', errorStack(error));
    } finally {
      this.isSweeping = false;
    }
  }

  private async resolveOne(
    decision: { id: string; channelId: string; quorumCount: number | null },
    now: Date,
  ) {
    try {
      const { acceptCount, rejectCount } = await this.voteCounts(decision.id);
      const totalVotes = acceptCount + rejectCount;

      if (decision.quorumCount !== null && totalVotes < decision.quorumCount) {
        // Below quorum: stays PROPOSED, marked expired-and-waiting-for-manual-resolve. Never
        // auto-REJECTED (docs/features/decision-channels.md → Voting → Quorum, decided).
        const { count } = await this.prisma.decision.updateMany({
          where: { id: decision.id, status: 'PROPOSED', expiredAt: null },
          data: { expiredAt: now },
        });
        // 0 rows: another instance's tick, or a manual resolve, already claimed it. Skip, no error.
        if (count === 0) return;
        await this.emitUpdated(decision.id, decision.channelId);
        return;
      }

      // Quorum met or none required: acceptCount > rejectCount wins; a tie (including 0-0 when no
      // quorum is set) is REJECTED — no majority to act on (decided, Voting → Accept/reject rule).
      const status = acceptCount > rejectCount ? 'ACCEPTED' : 'REJECTED';
      const { count } = await this.prisma.decision.updateMany({
        where: { id: decision.id, status: 'PROPOSED' },
        data: { status, decidedAt: now },
      });
      // 0 rows: a manual resolve raced this tick and won. Skip, no error.
      if (count === 0) return;
      await this.emitUpdated(decision.id, decision.channelId);
    } catch (error) {
      this.logger.error(`Decision sweep failed for ${decision.id}`, errorStack(error));
    }
  }

  private async voteCounts(decisionId: string) {
    const decision = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      select: {
        thread: {
          select: {
            rootMessage: {
              select: {
                poll: {
                  select: {
                    options: { select: { label: true, _count: { select: { votes: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const options = decision?.thread.rootMessage.poll?.options ?? [];
    const acceptCount = options.find((option) => option.label === 'Accept')?._count.votes ?? 0;
    const rejectCount = options.find((option) => option.label === 'Reject')?._count.votes ?? 0;
    return { acceptCount, rejectCount };
  }

  private async emitUpdated(decisionId: string, channelId: string) {
    const row = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
    if (!row) return;
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) return;
    // Same two emits as the manual path (`DecisionsService.emitUpdated`): the full view only to the
    // channel room, whose members already passed the channel's view check, and an id-only event to
    // the server room so the server-wide index refetches and re-applies its own visibility filter.
    this.realtime.emitToRoom(
      this.realtime.channelRoom(channelId),
      RealtimeEvents.DecisionUpdated,
      formatDecision(row, null),
    );
    this.realtime.emitToRoom(
      this.realtime.serverRoom(channel.serverId),
      RealtimeEvents.DecisionIndexUpdated,
      {
        serverId: channel.serverId,
        channelId,
        decisionId: row.id,
      },
    );
  }
}

function errorStack(error: unknown) {
  return error instanceof Error ? error.stack : error;
}
