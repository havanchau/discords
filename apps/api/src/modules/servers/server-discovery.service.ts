import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  DISCOVERY_MAX_TAGS,
  DISCOVERY_MIN_MEMBERS,
  DISCOVERY_PAGE_SIZE,
  DISCOVERY_TAG_MAX_LENGTH,
  type DiscoveryServerCard,
  type DiscoveryServerPage,
  type ServerDiscoverySettings,
} from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { DISCOVERY_CURSOR_PATTERN, DiscoveryQueryDto } from './dto/discovery-query.dto';
import { ReportServerDto } from './dto/report-server.dto';
import { UpdateDiscoveryDto } from './dto/update-discovery.dto';
import { ServersService } from './servers.service';

// Letters and digits of any script, with inner spaces or hyphens.
const TAG_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N} -]*[\p{L}\p{N}])?$/u;
/** A reporter's repeat report on the same server inside this window is accepted but not stored. */
const REPORT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface DiscoveryRow {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  tags: string[] | null;
  memberCount: number;
}

/**
 * Slice B of docs/features/server-templates-and-discovery.md. What the directory exposes is limited to
 * `DiscoveryServerCard`; a server is visible only while listed, not deleted, and at the member floor.
 */
@Injectable()
export class ServerDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly servers: ServersService,
  ) {}

  async getSettings(userId: string, serverId: string): Promise<ServerDiscoverySettings> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    return this.readSettings(serverId);
  }

  async updateSettings(
    userId: string,
    serverId: string,
    dto: UpdateDiscoveryDto,
  ): Promise<ServerDiscoverySettings> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const tags = dto.tags === undefined ? undefined : normalizeTags(dto.tags);
    const description = dto.description === undefined ? undefined : dto.description.trim() || null;

    if (dto.listed) {
      const memberCount = await this.prisma.serverMember.count({
        where: listingMemberWhere(serverId),
      });
      if (memberCount < DISCOVERY_MIN_MEMBERS) {
        throw new BadRequestException('Server needs at least 2 members to be listed');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.server.update({
        where: { id: serverId },
        data: { listed: dto.listed, description, tags },
        select: { listed: true, tags: true },
      });
      if (updated.listed) await ensureDiscoveryInvite(tx, serverId);
      await tx.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'SERVER_DISCOVERY_UPDATE',
          targetId: serverId,
          metadata: { listed: updated.listed, tags: updated.tags },
        },
      });
    });
    return this.readSettings(serverId);
  }

  async search(dto: DiscoveryQueryDto): Promise<DiscoveryServerPage> {
    const query = dto.query?.trim();
    const tag = dto.tag === undefined ? '' : normalizeTag(dto.tag);
    const cursor = dto.cursor ? DISCOVERY_CURSOR_PATTERN.exec(dto.cursor) : null;
    const memberCount = Prisma.sql`COUNT(m."id")`;

    // Every value is a bound parameter; the LIKE wildcards in the user's text are escaped first.
    const pattern = query ? `%${query.replace(/[\\%_]/g, '\\$&')}%` : null;
    const rows = await this.prisma.$queryRaw<DiscoveryRow[]>`
      SELECT s."id", s."name", s."description", s."avatarUrl", s."tags",
             ${memberCount}::int AS "memberCount"
      FROM "Server" s
      JOIN "ServerMember" m ON m."serverId" = s."id" AND m."kind" <> 'BOT'
      WHERE s."listed" = true
        AND s."deletedAt" IS NULL
        ${pattern ? Prisma.sql`AND (s."name" ILIKE ${pattern} OR s."description" ILIKE ${pattern})` : Prisma.empty}
        ${tag ? Prisma.sql`AND ${tag} = ANY(s."tags")` : Prisma.empty}
      GROUP BY s."id"
      HAVING ${memberCount} >= ${DISCOVERY_MIN_MEMBERS}
        ${
          cursor
            ? Prisma.sql`AND (${memberCount} < ${Number(cursor[1])}
                OR (${memberCount} = ${Number(cursor[1])} AND s."id" > ${cursor[2]}))`
            : Prisma.empty
        }
      ORDER BY "memberCount" DESC, s."id" ASC
      LIMIT ${DISCOVERY_PAGE_SIZE + 1}
    `;

    const page = rows.slice(0, DISCOVERY_PAGE_SIZE);
    const last = page.at(-1);
    return {
      servers: page.map(toCard),
      nextCursor:
        rows.length > DISCOVERY_PAGE_SIZE && last ? `${last.memberCount}_${last.id}` : null,
    };
  }

  /**
   * Joins through the server's discovery invite and the ordinary invite join, so the ban check, the
   * `@everyone` grant and rules screening (which gates the new member until they accept) are the
   * same as for any invite.
   */
  async join(userId: string, serverId: string) {
    const code = await this.prisma.$transaction(async (tx) => {
      await requireListedServer(tx, serverId);
      return ensureDiscoveryInvite(tx, serverId);
    });
    const result = await this.servers.joinInvite(userId, code);
    return { serverId: result.serverId, channelId: result.channelId, joinedNow: result.joinedNow };
  }

  async report(userId: string, serverId: string, dto: ReportServerDto) {
    await requireListedServer(this.prisma, serverId);
    const recent = await this.prisma.serverReport.findFirst({
      where: {
        serverId,
        reporterId: userId,
        createdAt: { gt: new Date(Date.now() - REPORT_DEDUPE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (!recent) {
      await this.prisma.serverReport.create({
        data: {
          serverId,
          reporterId: userId,
          reason: dto.reason,
          details: dto.details?.trim() || null,
        },
      });
    }
    // The same answer either way, so a reporter cannot tell whether a repeat was stored.
    return { ok: true as const };
  }

  private async readSettings(serverId: string): Promise<ServerDiscoverySettings> {
    const [server, memberCount] = await Promise.all([
      this.prisma.server.findFirstOrThrow({
        where: { id: serverId, deletedAt: null },
        select: { listed: true, description: true, tags: true },
      }),
      this.prisma.serverMember.count({ where: listingMemberWhere(serverId) }),
    ]);
    return { ...server, memberCount, eligible: memberCount >= DISCOVERY_MIN_MEMBERS };
  }
}

type DiscoveryClient = Prisma.TransactionClient | PrismaService;

/** Bots do not count toward the listing floor or the shown member count, so they cannot pad either. */
function listingMemberWhere(serverId: string): Prisma.ServerMemberWhereInput {
  return { serverId, kind: { not: 'BOT' } };
}

/** Unlisted, deleted, and below-floor servers all read as not found, as they do in search. */
async function requireListedServer(client: DiscoveryClient, serverId: string) {
  const server = await client.server.findFirst({
    where: { id: serverId, listed: true, deletedAt: null },
    select: { id: true, _count: { select: { members: { where: { kind: { not: 'BOT' } } } } } },
  });
  if (!server || server._count.members < DISCOVERY_MIN_MEMBERS) {
    throw new NotFoundException('Server not found');
  }
}

/**
 * Returns the code of the server's discovery invite, creating it when it is missing or was revoked.
 * It has no use limit and no expiry, and is hidden from the invite list. The conditional update keeps
 * one invite per server when two requests race; the loser removes the invite it created.
 */
async function ensureDiscoveryInvite(tx: Prisma.TransactionClient, serverId: string) {
  const server = await tx.server.findUniqueOrThrow({
    where: { id: serverId },
    select: { ownerId: true, discoveryInviteId: true },
  });
  if (server.discoveryInviteId) {
    const current = await tx.invite.findFirst({
      where: { id: server.discoveryInviteId, serverId, revokedAt: null },
      select: { code: true },
    });
    if (current) return current.code;
  }

  const invite = await tx.invite.create({
    data: {
      code: randomBytes(8).toString('base64url'),
      serverId,
      creatorId: server.ownerId,
      maxUses: null,
      expiresAt: null,
    },
    select: { id: true, code: true },
  });
  const { count } = await tx.server.updateMany({
    where: { id: serverId, discoveryInviteId: server.discoveryInviteId },
    data: { discoveryInviteId: invite.id },
  });
  if (count === 1) return invite.code;

  await tx.invite.delete({ where: { id: invite.id } });
  const winner = await tx.server.findUniqueOrThrow({
    where: { id: serverId },
    select: { discoveryInviteId: true },
  });
  const winnerInvite = winner.discoveryInviteId
    ? await tx.invite.findUnique({
        where: { id: winner.discoveryInviteId },
        select: { code: true },
      })
    : null;
  if (!winnerInvite) throw new NotFoundException('Server not found');
  return winnerInvite.code;
}

function normalizeTag(value: string) {
  const tag = value.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!tag || tag.length > DISCOVERY_TAG_MAX_LENGTH || !TAG_PATTERN.test(tag)) {
    throw new BadRequestException('Invalid discovery tag');
  }
  return tag;
}

function normalizeTags(values: string[]) {
  return [...new Set(values.map(normalizeTag))].slice(0, DISCOVERY_MAX_TAGS);
}

function toCard(row: DiscoveryRow): DiscoveryServerCard {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatarUrl,
    tags: row.tags ?? [],
    memberCount: row.memberCount,
  };
}
