import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ExportJob } from '@prisma/client';
import type { ExportJobView } from '@discord-clone/shared';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { TwoFactorService } from '@/modules/auth/two-factor.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { PrivateFileStorageService } from '@/modules/uploads/private-file-storage.service';
import { collectAccountExport } from './account-export-collector';
import {
  ACCOUNT_EXPORT_REQUEST_LIMIT,
  ACCOUNT_EXPORT_REQUEST_WINDOW_MS,
  ACCOUNT_EXPORT_STALE_MS,
  ACCOUNT_EXPORT_STORAGE_PREFIX,
  ACCOUNT_EXPORT_TTL_MS,
} from './account-deletion.rules';

const EXPIRY_SWEEP_BATCH = 50;

@Injectable()
export class AccountExportService {
  private readonly logger = new Logger(AccountExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactor: TwoFactorService,
    private readonly storage: PrivateFileStorageService,
    private readonly limiter: RedisFixedWindowLimiter,
  ) {}

  hitRequestLimit(userId: string) {
    return this.limiter.hit(
      `account-export:${userId}`,
      ACCOUNT_EXPORT_REQUEST_LIMIT,
      ACCOUNT_EXPORT_REQUEST_WINDOW_MS,
    );
  }

  /**
   * Password only: an export changes nothing (see the spec's trade-offs). Checked before the rate
   * limit is counted, so neither a mistyped password nor a job still running uses up the quota.
   */
  async assertCanStartExport(userId: string, password: string) {
    await this.twoFactor.verifyReauthentication(userId, password, undefined, {
      requireSecondFactor: false,
    });
    const now = Date.now();
    // A PENDING row this old belongs to a request that died mid-collection.
    await this.prisma.exportJob.updateMany({
      where: {
        userId,
        status: 'PENDING',
        createdAt: { lt: new Date(now - ACCOUNT_EXPORT_STALE_MS) },
      },
      data: { status: 'FAILED', errorMessage: 'INTERRUPTED', completedAt: new Date(now) },
    });
    const running = await this.prisma.exportJob.count({ where: { userId, status: 'PENDING' } });
    if (running > 0) throw new ConflictException('An export is already in progress');
  }

  /**
   * Collected inside the request (open question 18: synchronous first slice). A failure marks the
   * job `FAILED` and removes any file already written; the caller still gets the job id and reads
   * the outcome from the status route.
   */
  async runExport(userId: string): Promise<{ jobId: string }> {
    const job = await this.prisma.exportJob.create({ data: { userId }, select: { id: true } });
    let fileKey: string | null = null;
    try {
      const archive = await collectAccountExport(this.prisma, userId, new Date());
      fileKey = await this.storage.store(ACCOUNT_EXPORT_STORAGE_PREFIX, JSON.stringify(archive));
      const completedAt = new Date();
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'READY',
          fileKey,
          completedAt,
          expiresAt: new Date(completedAt.getTime() + ACCOUNT_EXPORT_TTL_MS),
        },
      });
    } catch (error) {
      this.logger.error(
        `Account export ${job.id} failed`,
        error instanceof Error ? error.stack : undefined,
      );
      if (fileKey) await this.storage.removeQuietly(fileKey);
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          fileKey: null,
          errorMessage: 'COLLECTION_FAILED',
          completedAt: new Date(),
        },
      });
    }
    return { jobId: job.id };
  }

  async latestJob(userId: string): Promise<{ job: ExportJobView | null }> {
    const job = await this.prisma.exportJob.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { job: job ? toExportJobView(job, new Date()) : null };
  }

  /** Another account's job id gets the same 404 as a missing one. */
  async getJob(userId: string, jobId: string): Promise<{ job: ExportJobView }> {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('Export not found');
    return { job: toExportJobView(job, new Date()) };
  }

  async readArchive(userId: string, jobId: string) {
    const job = await this.prisma.exportJob.findFirst({
      where: { id: jobId, userId },
      select: { fileKey: true, status: true, expiresAt: true, completedAt: true },
    });
    if (
      !job?.fileKey ||
      job.status !== 'READY' ||
      !job.expiresAt ||
      job.expiresAt <= new Date() ||
      !job.completedAt
    ) {
      throw new NotFoundException('Export not found');
    }
    return {
      content: await this.storage.read(job.fileKey),
      fileName: `discords-export-${job.completedAt.toISOString().slice(0, 10)}.json`,
    };
  }

  /** Clears the key first, then removes the file: a lost race never deletes a file twice. */
  async expireDueExports(now: Date) {
    const due = await this.prisma.exportJob.findMany({
      where: { status: 'READY', expiresAt: { lte: now }, fileKey: { not: null } },
      take: EXPIRY_SWEEP_BATCH,
      select: { id: true, fileKey: true },
    });
    for (const { id, fileKey } of due) {
      if (!fileKey) continue;
      const { count } = await this.prisma.exportJob.updateMany({
        where: { id, fileKey },
        data: { fileKey: null },
      });
      if (count > 0) await this.storage.removeQuietly(fileKey);
    }
  }
}

function toExportJobView(job: ExportJob, now: Date): ExportJobView {
  const downloadable =
    job.status === 'READY' && job.fileKey !== null && job.expiresAt !== null && job.expiresAt > now;
  return {
    id: job.id,
    status: job.status,
    downloadUrl: downloadable ? `/users/me/export/${job.id}/download` : null,
    expiresAt: job.expiresAt,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}
