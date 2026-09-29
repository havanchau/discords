import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PlatformAuditAction, PlatformAuditTargetType } from '@discord-clone/shared';
import { PrismaService } from '@/modules/prisma/prisma.service';

export interface RecordPlatformAuditInput {
  actorId?: string;
  actorUsername?: string;
  actorDisplayName?: string;
  targetType: PlatformAuditTargetType;
  targetId: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes `PlatformAuditLog` rows for the handful of platform-level events that must survive the
 * deletion of the thing they describe (docs/features/platform-audit-log.md). A thin wrapper over
 * `prisma.platformAuditLog.create` so the five call sites share one place that decides the shape.
 *
 * Accepts an optional `tx` so a caller already inside a transaction (transfer, dismiss, delist)
 * writes this row in the same transaction as its existing `AuditLog` write — a failure here rolls
 * back the whole action, same as any other write in that transaction.
 */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    action: PlatformAuditAction,
    input: RecordPlatformAuditInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.platformAuditLog.create({
      data: {
        action,
        actorId: input.actorId ?? null,
        actorUsername: input.actorUsername ?? null,
        actorDisplayName: input.actorDisplayName ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        targetName: input.targetName ?? null,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
      },
    });
  }
}
