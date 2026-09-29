import { Injectable } from '@nestjs/common';
import { Prisma, type PlatformAuditLog } from '@prisma/client';
import {
  PLATFORM_AUDIT_LOGS_PAGE_SIZE,
  type PlatformAuditLogPage,
  type PlatformAuditLogView,
} from '@discord-clone/shared';
import { PrismaService } from '@/modules/prisma/prisma.service';
import {
  ListPlatformAuditLogsQueryDto,
  PLATFORM_AUDIT_LOGS_CURSOR_PATTERN,
} from './dto/list-platform-audit-logs-query.dto';

@Injectable()
export class PlatformAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Read side of `PlatformAuditLog` for `GET /platform/audit-logs`, mirroring `PlatformReportsService.list`. */
  async list(query: ListPlatformAuditLogsQueryDto): Promise<PlatformAuditLogPage> {
    const cursor = query.cursor ? PLATFORM_AUDIT_LOGS_CURSOR_PATTERN.exec(query.cursor) : null;
    const cursorDate = cursor ? new Date(Number(cursor[1])) : null;

    const where: Prisma.PlatformAuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(cursorDate && cursor
        ? {
            OR: [
              { createdAt: { lt: cursorDate } },
              { createdAt: cursorDate, id: { lt: cursor[2] } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.platformAuditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PLATFORM_AUDIT_LOGS_PAGE_SIZE + 1,
    });

    const page = rows.slice(0, PLATFORM_AUDIT_LOGS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      logs: page.map(toView),
      nextCursor:
        rows.length > PLATFORM_AUDIT_LOGS_PAGE_SIZE && last
          ? `${last.createdAt.getTime()}_${last.id}`
          : null,
    };
  }
}

function toView(row: PlatformAuditLog): PlatformAuditLogView {
  return {
    id: row.id,
    action: row.action,
    actorId: row.actorId,
    actorUsername: row.actorUsername,
    actorDisplayName: row.actorDisplayName,
    targetType: row.targetType,
    targetId: row.targetId,
    targetName: row.targetName,
    metadata: toMetadataObject(row.metadata),
    createdAt: row.createdAt,
  };
}

/**
 * `metadata` is a JSON column, so the database can hand back a scalar or an array even though every
 * writer here only ever stores a plain object — narrowed defensively rather than asserting a shape
 * the column does not guarantee (same helper as `servers.service.ts`'s own `toMetadataObject`).
 */
function toMetadataObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
