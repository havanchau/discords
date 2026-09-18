import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PLATFORM_REPORTS_PAGE_SIZE,
  type PlatformReportDetail,
  type PlatformReportPage,
  type PlatformReportResolution,
  type PlatformServerReportView,
  type PlatformServerSummary,
} from '@discord-clone/shared';
import { PrismaService } from '@/modules/prisma/prisma.service';
import {
  PLATFORM_REPORTS_CURSOR_PATTERN,
  ListPlatformReportsQueryDto,
} from './dto/list-platform-reports-query.dto';
import { ResolvePlatformReportDto } from './dto/resolve-platform-report.dto';

const reportSelect = {
  id: true,
  serverId: true,
  reason: true,
  details: true,
  createdAt: true,
  resolvedAt: true,
  resolution: true,
  resolutionNote: true,
  reporter: { select: { id: true, displayName: true } },
  resolvedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.ServerReportSelect;

type ReportRow = Prisma.ServerReportGetPayload<{ select: typeof reportSelect }>;

@Injectable()
export class PlatformReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPlatformReportsQueryDto): Promise<PlatformReportPage> {
    const cursor = query.cursor ? PLATFORM_REPORTS_CURSOR_PATTERN.exec(query.cursor) : null;
    const cursorDate = cursor ? new Date(Number(cursor[1])) : null;

    const where: Prisma.ServerReportWhereInput = {
      ...(query.serverId ? { serverId: query.serverId } : {}),
      ...(query.status === 'OPEN'
        ? { resolvedAt: null }
        : query.status
          ? { resolution: query.status }
          : {}),
      ...(cursorDate && cursor
        ? {
            OR: [
              { createdAt: { lt: cursorDate } },
              { createdAt: cursorDate, id: { lt: cursor[2] } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.serverReport.findMany({
      where,
      select: reportSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PLATFORM_REPORTS_PAGE_SIZE + 1,
    });

    const page = rows.slice(0, PLATFORM_REPORTS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      reports: page.map(toView),
      nextCursor:
        rows.length > PLATFORM_REPORTS_PAGE_SIZE && last
          ? `${last.createdAt.getTime()}_${last.id}`
          : null,
    };
  }

  async detail(reportId: string): Promise<PlatformReportDetail> {
    const report = await this.prisma.serverReport.findUnique({
      where: { id: reportId },
      select: reportSelect,
    });
    if (!report) throw new NotFoundException('Report not found');

    const server = await this.prisma.server.findUnique({
      where: { id: report.serverId },
      select: {
        id: true,
        name: true,
        description: true,
        tags: true,
        listed: true,
        ownerId: true,
        createdAt: true,
        owner: { select: { displayName: true } },
        _count: { select: { members: true } },
      },
    });
    // The report's `server` relation is `onDelete: Cascade` (discovery.prisma), so the report row
    // is gone with its server — this branch documents that the case cannot occur, not a real gap.
    if (!server) throw new NotFoundException('Report not found');

    const summary: PlatformServerSummary = {
      id: server.id,
      name: server.name,
      description: server.description,
      tags: server.tags,
      memberCount: server._count.members,
      listed: server.listed,
      ownerId: server.ownerId,
      ownerDisplayName: server.owner.displayName,
      createdAt: server.createdAt,
    };
    return { report: toView(report), server: summary };
  }

  async resolve(
    adminId: string,
    reportId: string,
    resolution: PlatformReportResolution,
    dto: ResolvePlatformReportDto,
  ): Promise<{ report: PlatformServerReportView }> {
    const resolutionNote = dto.note?.trim() || null;
    const report = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.serverReport.findUnique({
        where: { id: reportId },
        select: { id: true, serverId: true },
      });
      if (!existing) throw new NotFoundException('Report not found');

      // Conditional on `resolvedAt IS NULL` so two admins resolving the same report cannot both
      // succeed.
      const { count } = await tx.serverReport.updateMany({
        where: { id: reportId, resolvedAt: null },
        data: {
          resolvedAt: new Date(),
          resolvedById: adminId,
          resolution,
          resolutionNote,
        },
      });
      if (count === 0) throw new ConflictException('Report is already resolved');

      if (resolution === 'SERVER_DELISTED') {
        // Idempotent on the `Server` side: an already-unlisted server stays unlisted.
        await tx.server.update({ where: { id: existing.serverId }, data: { listed: false } });
      }

      await tx.auditLog.create({
        data: {
          serverId: existing.serverId,
          actorId: adminId,
          action: resolution === 'DISMISSED' ? 'PLATFORM_REPORT_DISMISS' : 'PLATFORM_REPORT_DELIST',
          targetId: reportId,
          metadata: { reportId },
        },
      });

      return tx.serverReport.findUniqueOrThrow({ where: { id: reportId }, select: reportSelect });
    });
    return { report: toView(report) };
  }
}

function toView(report: ReportRow): PlatformServerReportView {
  return {
    id: report.id,
    serverId: report.serverId,
    reason: report.reason,
    details: report.details,
    createdAt: report.createdAt,
    reporter: report.reporter,
    status: report.resolvedAt ? (report.resolution ?? 'DISMISSED') : 'OPEN',
    resolvedAt: report.resolvedAt,
    resolvedBy: report.resolvedBy,
    resolutionNote: report.resolutionNote,
  };
}
