import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageReportStatus, MessageReportTargetType, Prisma } from '@prisma/client';
import type { MessageHistoryResult, MessageReportView } from '@discord-clone/shared';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { listMessageRevisions } from '@/modules/messages/message-revisions';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

const LIST_LIMIT = 100;
const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 10 * 60_000;

const reportSelect = {
  id: true,
  targetType: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  reporter: { select: { id: true, displayName: true, avatarUrl: true } },
  message: {
    select: { id: true, content: true, channelId: true, authorId: true, deletedAt: true },
  },
  targetUser: { select: { id: true, displayName: true } },
  resolvedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.MessageReportSelect;

type ReportRow = Prisma.MessageReportGetPayload<{ select: typeof reportSelect }>;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly limiter: RedisFixedWindowLimiter,
  ) {}

  /** Per reporter per server, counted in Redis so the ceiling holds across API instances. */
  hitCreateLimit(userId: string, serverId: string) {
    return this.limiter.hit(`message-report:${serverId}:${userId}`, CREATE_LIMIT, CREATE_WINDOW_MS);
  }

  async create(userId: string, serverId: string, dto: CreateReportDto) {
    await this.permissions.requireMembership(userId, serverId);

    const message = dto.messageId
      ? await this.requireReadableMessage(userId, serverId, dto.messageId)
      : null;
    let targetUserId: string;
    if (dto.targetType === 'MESSAGE') {
      if (!message) throw new NotFoundException('Message not found');
      if (message.authorId === userId) {
        throw new BadRequestException('Cannot report your own message');
      }
      targetUserId = message.authorId;
    } else {
      targetUserId = dto.targetUserId ?? '';
      if (targetUserId === userId) throw new BadRequestException('Cannot report yourself');
      const member = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: targetUserId, serverId } },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('Member not found');
    }

    // One open report per reporter and target; a new one can be filed once that one is closed.
    // Two concurrent first reports can both pass this check (no partial unique index), which only
    // costs a duplicate queue row.
    const existing = await this.prisma.messageReport.findFirst({
      where: {
        serverId,
        reporterId: userId,
        targetType: dto.targetType,
        status: MessageReportStatus.OPEN,
        ...(dto.targetType === 'MESSAGE' ? { messageId: message?.id } : { targetUserId }),
      },
      select: reportSelect,
    });
    // The reporter could already view the message (requireReadableMessage checked it above).
    if (existing) return { created: false, report: toView(existing, true) };

    const details = dto.details?.trim() || null;
    const report = await this.prisma.$transaction(async (tx) => {
      const created = await tx.messageReport.create({
        data: {
          serverId,
          reporterId: userId,
          targetType: dto.targetType,
          messageId: message?.id ?? null,
          targetUserId,
          reason: dto.reason,
          details,
        },
        select: reportSelect,
      });
      await tx.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'MESSAGE_REPORT_CREATE',
          targetId: created.id,
          metadata: {
            reportId: created.id,
            targetType: created.targetType,
            reason: created.reason,
          },
        },
      });
      return created;
    });
    // The reporter could already view the message (requireReadableMessage checked it above).
    return { created: true, report: toView(report, true) };
  }

  async list(
    userId: string,
    serverId: string,
    status?: MessageReportStatus,
  ): Promise<{ reports: MessageReportView[] }> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageMessages);
    const reports = await this.prisma.messageReport.findMany({
      where: { serverId, ...(status ? { status } : {}) },
      select: reportSelect,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    const viewableByChannel = await this.viewableChannelMap(userId, reports);
    return {
      reports: reports.map((report) =>
        toView(
          report,
          report.message ? (viewableByChannel.get(report.message.channelId) ?? false) : true,
        ),
      ),
    };
  }

  /**
   * One permission check per distinct channel referenced by the page of reports, not one per report
   * — a moderator's queue commonly has several reports on the same channel.
   */
  private async viewableChannelMap(userId: string, reports: ReportRow[]) {
    const channelIds = [
      ...new Set(reports.map((r) => r.message?.channelId).filter((id): id is string => !!id)),
    ];
    const entries = await Promise.all(
      channelIds.map(
        async (channelId) =>
          [
            channelId,
            await this.permissions.hasChannelPermission(userId, channelId, Permission.ViewChannel),
          ] as const,
      ),
    );
    return new Map(entries);
  }

  async updateStatus(userId: string, serverId: string, reportId: string, dto: UpdateReportDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageMessages);

    const report = await this.prisma.$transaction(async (tx) => {
      // Conditional on OPEN so two moderators closing the same report cannot both succeed.
      const { count } = await tx.messageReport.updateMany({
        where: { id: reportId, serverId, status: MessageReportStatus.OPEN },
        data: { status: dto.status, resolvedById: userId, resolvedAt: new Date() },
      });
      if (!count) {
        const current = await tx.messageReport.findFirst({
          where: { id: reportId, serverId },
          select: { status: true },
        });
        if (!current) throw new NotFoundException('Report not found');
        throw new ConflictException(
          current.status === MessageReportStatus.RESOLVED
            ? 'Report is already resolved'
            : 'Report is already dismissed',
        );
      }
      await tx.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action:
            dto.status === MessageReportStatus.RESOLVED
              ? 'MESSAGE_REPORT_RESOLVE'
              : 'MESSAGE_REPORT_DISMISS',
          targetId: reportId,
          metadata: { reportId },
        },
      });
      return tx.messageReport.findUniqueOrThrow({ where: { id: reportId }, select: reportSelect });
    });
    const canView = report.message
      ? await this.permissions.hasChannelPermission(
          userId,
          report.message.channelId,
          Permission.ViewChannel,
        )
      : true;
    return { report: toView(report, canView) };
  }

  /**
   * Past versions of the reported message, so a moderator sees what it said before any edit made
   * after the report. Tied to a filed report: a moderator cannot browse a member's history without
   * one. Redacted like `list()` when the moderator cannot view the message's channel.
   */
  async getMessageHistory(
    userId: string,
    serverId: string,
    reportId: string,
  ): Promise<MessageHistoryResult> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageMessages);
    const report = await this.prisma.messageReport.findFirst({
      where: { id: reportId, serverId },
      select: {
        targetType: true,
        message: { select: { id: true, channelId: true, deletedAt: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    const { message } = report;
    if (report.targetType !== MessageReportTargetType.MESSAGE || !message || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }
    const canView = await this.permissions.hasChannelPermission(
      userId,
      message.channelId,
      Permission.ViewChannel,
    );
    return { revisions: await listMessageRevisions(this.prisma, message.id, canView) };
  }

  /**
   * The message must be a live message of this server in a channel the reporter can view. Every
   * miss answers 404, so the endpoint does not reveal messages in channels the reporter cannot see.
   */
  private async requireReadableMessage(userId: string, serverId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, serverId: true, channelId: true, authorId: true, deletedAt: true },
    });
    if (!message || message.serverId !== serverId || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }
    const canView = await this.permissions.hasChannelPermission(
      userId,
      message.channelId,
      Permission.ViewChannel,
    );
    if (!canView) throw new NotFoundException('Message not found');
    return message;
  }
}

/**
 * `canViewChannel` is the moderator's `VIEW_CHANNEL` permission on the message's channel — false
 * redacts `content` to `''` and sets `contentHidden: true`, so a moderator without channel access
 * cannot read the reported text (docs/features/qa-follow-ups-2026-09-18.md, "Report queue").
 */
function toView(report: ReportRow, canViewChannel: boolean): MessageReportView {
  const { message } = report;
  return {
    id: report.id,
    targetType: report.targetType,
    reason: report.reason,
    details: report.details,
    status: report.status,
    createdAt: report.createdAt,
    reporter: report.reporter,
    message:
      message && !message.deletedAt
        ? {
            id: message.id,
            content: canViewChannel ? message.content : '',
            channelId: message.channelId,
            authorId: message.authorId,
            contentHidden: !canViewChannel,
          }
        : null,
    targetUser: report.targetUser,
    resolvedBy: report.resolvedBy,
    resolvedAt: report.resolvedAt,
  };
}
