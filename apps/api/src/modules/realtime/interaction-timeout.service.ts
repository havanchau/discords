import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
  INTERACTION_TIMEOUT_MS,
  RealtimeEvents,
  type InteractionTimeoutPayload,
} from '@discord-clone/shared';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from './realtime-publisher.service';

const SWEEP_INTERVAL_MS = 5_000;
/** One batch per tick keeps a single slow tick from blocking the next one for long. */
const SWEEP_BATCH = 200;

/**
 * Flips any `PENDING` interaction past its `INTERACTION_TIMEOUT_MS` deadline to `TIMED_OUT` and tells
 * the invoker (`bot-gateway-and-slash-commands.md` → Changes → Invocation flow, step 7).
 *
 * Every API instance runs this timer, exactly like `ScheduledMessageSweepService`
 * (`scheduled-messages/scheduled-message-sweep.service.ts`): the conditional claim
 * (`PENDING` → `TIMED_OUT`, `WHERE status = 'PENDING'`) is the only place that decides the timeout,
 * so an interaction is only ever reported once across every instance, and a slow bot's callback
 * racing the sweep is decided by whichever `UPDATE` lands first — the callback route's own guard
 * (`Interaction already timed out`) covers the other order. No `@nestjs/schedule` and no Redis lock:
 * this repo's existing multi-instance-safe sweeps use `setInterval` plus this conditional update, not
 * a scheduling framework.
 */
@Injectable()
export class InteractionTimeoutService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(InteractionTimeoutService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.sweep();
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep() {
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      const deadline = new Date(Date.now() - INTERACTION_TIMEOUT_MS);
      const due = await this.prisma.interaction.findMany({
        where: { status: 'PENDING', createdAt: { lte: deadline } },
        orderBy: { createdAt: 'asc' },
        take: SWEEP_BATCH,
        select: { id: true, token: true, invokerUserId: true },
      });

      for (const row of due) {
        const { count } = await this.prisma.interaction.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: { status: 'TIMED_OUT' },
        });
        // Another instance claimed it, or the bot's callback answered it, in between.
        if (count === 0) continue;

        const payload: InteractionTimeoutPayload = { interactionToken: row.token };
        this.realtime.emitToRoom(
          this.realtime.userRoom(row.invokerUserId),
          RealtimeEvents.InteractionTimeout,
          payload,
        );
      }
    } catch (error) {
      this.logger.error(
        'Interaction timeout sweep failed',
        error instanceof Error ? error.stack : error,
      );
    } finally {
      this.isSweeping = false;
    }
  }
}
