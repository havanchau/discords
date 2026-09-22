import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ChannelType,
  InsightsDailyCount,
  InsightsRange,
  InsightsSeries,
  InsightsTopChannel,
  ServerInsights,
} from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';

const RANGE_DAYS: Record<InsightsRange, number> = { '7d': 7, '30d': 30 };
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_CHANNEL_LIMIT = 5;
/** Leaving, kicking and banning delete the ServerMember row, so removals are read from AuditLog. */
const MEMBER_REMOVAL_ACTIONS = ['MEMBER_LEAVE', 'MEMBER_KICK', 'MEMBER_BAN'] as const;
type MemberRemovalAction = (typeof MEMBER_REMOVAL_ACTIONS)[number];

type DayCountRow = { date: string; count: number };
type ActionDayCountRow = DayCountRow & { action: MemberRemovalAction };
type ChannelCountRow = {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  isPrivate: boolean;
  messageCount: number;
};

@Injectable()
export class ServerInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Live counts over UTC calendar days, today included: nothing is pre-aggregated, so a join or a
   * message from a second ago is already counted (docs/features/server-insights.md).
   */
  async getInsights(
    userId: string,
    serverId: string,
    range: InsightsRange = '7d',
  ): Promise<ServerInsights> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);

    const now = new Date();
    const today = startOfUtcDay(now);
    const rangeStart = new Date(today.getTime() - (RANGE_DAYS[range] - 1) * DAY_MS);
    // "createdAt" columns are `timestamp` without zone holding UTC; a zone-less literal compares
    // against them without the session time zone getting involved.
    const since = Prisma.sql`${toUtcTimestampLiteral(rangeStart)}::timestamp`;

    const [server, joinRows, removalRows, messageRows, channelRows] = await Promise.all([
      this.prisma.server.findUnique({ where: { id: serverId }, select: { createdAt: true } }),
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT to_char(date_trunc('day', "joinedAt"), 'YYYY-MM-DD') AS "date", COUNT(*)::int AS "count"
        FROM "ServerMember"
        WHERE "serverId" = ${serverId} AND "joinedAt" >= ${since}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<ActionDayCountRow[]>`
        SELECT "action", to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "date",
          COUNT(*)::int AS "count"
        FROM "AuditLog"
        WHERE "serverId" = ${serverId}
          AND "createdAt" >= ${since}
          AND "action" IN (${Prisma.join([...MEMBER_REMOVAL_ACTIONS])})
        GROUP BY 1, 2
      `,
      // Soft-deleted messages are not activity; served by Message(serverId, createdAt).
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "date", COUNT(*)::int AS "count"
        FROM "Message"
        WHERE "serverId" = ${serverId} AND "deletedAt" IS NULL AND "createdAt" >= ${since}
        GROUP BY 1
      `,
      // Every text/announcement/forum channel with activity (bounded by the server's channel count),
      // not just five: the viewability filter below may drop some, and the next busiest must fill in.
      this.prisma.$queryRaw<ChannelCountRow[]>`
        SELECT c."id", c."serverId", c."name", c."type"::text AS "type", c."isPrivate",
          COUNT(*)::int AS "messageCount"
        FROM "Message" m
        JOIN "Channel" c ON c."id" = m."channelId"
        WHERE m."serverId" = ${serverId}
          AND m."deletedAt" IS NULL
          AND m."createdAt" >= ${since}
          AND c."type" IN ('TEXT', 'ANNOUNCEMENT', 'FORUM')
        GROUP BY c."id"
        ORDER BY "messageCount" DESC, c."id" ASC
      `,
    ]);
    if (!server) throw new NotFoundException('Server not found');

    // A server younger than the range has no days before its creation day in any series.
    const serverDay = startOfUtcDay(server.createdAt);
    const days = listUtcDays(serverDay > rangeStart ? serverDay : rangeStart, today);

    return {
      range,
      generatedAt: now,
      membersJoined: toSeries(days, joinRows),
      membersLeft: toSeries(days, rowsForAction(removalRows, 'MEMBER_LEAVE')),
      membersKicked: toSeries(days, rowsForAction(removalRows, 'MEMBER_KICK')),
      membersBanned: toSeries(days, rowsForAction(removalRows, 'MEMBER_BAN')),
      messagesPerDay: toSeries(days, messageRows),
      topChannels: await this.viewableTopChannels(userId, channelRows),
    };
  }

  /**
   * MANAGE_SERVER does not imply channel visibility, so a channel the viewer cannot open is never
   * named or counted here — its name and activity would otherwise leak.
   */
  private async viewableTopChannels(
    userId: string,
    rows: ChannelCountRow[],
  ): Promise<InsightsTopChannel[]> {
    const viewable = await this.permissions.filterViewableChannels(userId, rows);
    return viewable.slice(0, TOP_CHANNEL_LIMIT).map((row) => ({
      channelId: row.id,
      name: row.name,
      type: row.type,
      messageCount: row.messageCount,
    }));
  }
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** `YYYY-MM-DD HH:mm:ss.sss` in UTC, without a zone suffix. */
function toUtcTimestampLiteral(date: Date) {
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

/** `YYYY-MM-DD` keys for every UTC day from `first` to `last`, both included. */
function listUtcDays(first: Date, last: Date) {
  const days: string[] = [];
  for (let time = first.getTime(); time <= last.getTime(); time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

function rowsForAction(rows: ActionDayCountRow[], action: MemberRemovalAction) {
  return rows.filter((row) => row.action === action);
}

/** Zero-fills the days without rows; the total is the sum of the returned days. */
function toSeries(days: string[], rows: DayCountRow[]): InsightsSeries {
  const counts = new Map(rows.map((row) => [row.date, row.count]));
  const series: InsightsDailyCount[] = days.map((date) => ({ date, count: counts.get(date) ?? 0 }));
  return { series, total: series.reduce((sum, day) => sum + day.count, 0) };
}
