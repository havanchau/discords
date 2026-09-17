import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { AccountDeletionService } from './account-deletion.service';
import { AccountExportService } from './account-export.service';
import { ACCOUNT_DELETION_SWEEP_BATCH, ACCOUNT_SWEEP_INTERVAL_MS } from './account-deletion.rules';

/**
 * Anonymizes accounts whose deletion grace period has passed and removes expired export files.
 *
 * Every API instance runs this timer. The conditional claim inside each anonymization transaction
 * is the only place that decides it runs, so an account is anonymized once across instances.
 */
@Injectable()
export class AccountSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AccountSweepService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deletion: AccountDeletionService,
    private readonly exports: AccountExportService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.sweep();
    }, ACCOUNT_SWEEP_INTERVAL_MS);
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
      const due = await this.prisma.user.findMany({
        // Only a person can request deletion; the kind filter keeps synthetic users out regardless.
        where: { kind: 'HUMAN', deletionScheduledAt: { lte: now }, deletionCompletedAt: null },
        orderBy: { deletionScheduledAt: 'asc' },
        take: ACCOUNT_DELETION_SWEEP_BATCH,
        select: { id: true },
      });
      for (const { id } of due) {
        try {
          await this.deletion.completeDeletion(id, now);
        } catch (error) {
          // Rolled back; the next tick retries this account.
          this.logger.error(`Account deletion failed for user ${id}`, errorDetail(error));
        }
      }
      await this.exports.expireDueExports(now);
    } catch (error) {
      this.logger.error('Account sweep failed', errorDetail(error));
    } finally {
      this.isSweeping = false;
    }
  }
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.stack : undefined;
}
