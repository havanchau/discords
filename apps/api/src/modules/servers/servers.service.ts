import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { slugifyChannelName } from '../../common/slugify';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditLogEntry, Invite, ServerDetail, ServerSummary } from '@discord-clone/shared';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { countChannelUnread } from '../messages/unread-counts';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdateNicknameDto } from './dto/update-nickname.dto';

const DEFAULT_MEMBER_PERMISSIONS = [
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'CREATE_INVITE',
  'CONNECT_VOICE',
  'SPEAK_VOICE',
  'UPLOAD_FILES',
];

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async createServer(userId: string, dto: CreateServerDto) {
    const server = await this.prisma.$transaction(async (tx) => {
      const created = await tx.server.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          ownerId: userId,
        },
      });

      const everyoneRole = await tx.role.create({
        data: {
          serverId: created.id,
          name: '@everyone',
          position: 0,
          permissions: DEFAULT_MEMBER_PERMISSIONS,
        },
      });

      const ownerMember = await tx.serverMember.create({
        data: {
          userId,
          serverId: created.id,
          kind: 'OWNER',
        },
      });

      await tx.memberRole.create({
        data: {
          memberId: ownerMember.id,
          roleId: everyoneRole.id,
        },
      });

      await tx.channel.create({
        data: {
          serverId: created.id,
          name: 'general',
          type: 'TEXT',
          position: 0,
        },
      });

      return created;
    });

    return this.getServerForUser(userId, server.id);
  }

  async listForUser(userId: string): Promise<{ servers: ServerSummary[] }> {
    const servers = await this.prisma.server.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } },
      },
      include: {
        channels: { orderBy: { position: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const viewableChannelIds = new Set(
      (
        await this.permissions.filterViewableChannels(
          userId,
          servers.flatMap((server) => server.channels),
        )
      ).map((channel) => channel.id),
    );
    const visibleServers = servers.map((server) => ({
      ...server,
      channels: server.channels.filter((channel) => viewableChannelIds.has(channel.id)),
    }));
    return { servers: visibleServers };
  }

  async getServerForUser(userId: string, serverId: string): Promise<{ server: ServerDetail }> {
    await this.requireMembership(userId, serverId);
    const server = await this.prisma.server.findFirstOrThrow({
      where: { id: serverId, deletedAt: null },
      include: {
        channels: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                status: true,
              },
            },
            roles: { include: { role: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
        roles: { orderBy: { position: 'asc' } },
        channelCategories: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    const viewableChannels = await this.permissions.filterViewableChannels(userId, server.channels);
    const categories = await this.filterVisibleCategories(
      userId,
      serverId,
      server.channelCategories,
      viewableChannels,
    );
    const unreadCounts = await countChannelUnread(
      this.prisma,
      userId,
      viewableChannels.map((channel) => channel.id),
    );
    const channels = viewableChannels.map((channel) => ({
      ...channel,
      unreadCount: unreadCounts[channel.id] ?? 0,
    }));
    const { channelCategories: _allCategories, ...serverFields } = server;
    return { server: { ...serverFields, channels, categories } };
  }

  /* Category names can reveal private areas, so members only see categories holding a channel they can view. */
  private async filterVisibleCategories<T extends { id: string }>(
    userId: string,
    serverId: string,
    categories: T[],
    viewableChannels: Array<{ categoryId: string | null }>,
  ) {
    if (await this.permissions.hasServerPermission(userId, serverId, Permission.ManageChannels)) {
      return categories;
    }
    const visibleCategoryIds = new Set(viewableChannels.map((channel) => channel.categoryId));
    return categories.filter((category) => visibleCategoryIds.has(category.id));
  }

  async updateServer(userId: string, serverId: string, dto: UpdateServerDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    await this.prisma.server.update({
      where: { id: serverId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
      },
    });
    await this.writeAuditLog(serverId, userId, 'SERVER_UPDATE', serverId, {
      name: dto.name?.trim(),
    });
    return this.getServerForUser(userId, serverId);
  }

  async listAuditLogs(userId: string, serverId: string): Promise<{ logs: AuditLogEntry[] }> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const logs = await this.prisma.auditLog.findMany({
      where: { serverId },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      logs: logs.map((log) => ({ ...log, metadata: toMetadataObject(log.metadata) })),
    };
  }

  async updateMyMembership(userId: string, serverId: string, dto: UpdateNicknameDto) {
    const member = await this.requireMembership(userId, serverId);
    // Only the fields the request carried are written, so updating the avatar cannot clear the
    // nickname that `/nick` set, and vice versa. An empty string still means "clear this field".
    const data: { nickname?: string | null; avatarUrl?: string | null } = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname?.trim() || null;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl?.trim() || null;

    const updated = await this.prisma.serverMember.update({
      where: { id: member.id },
      data,
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
        },
        roles: { include: { role: true } },
      },
    });

    if (data.nickname !== undefined) {
      await this.writeAuditLog(serverId, userId, 'MEMBER_NICKNAME_UPDATE', member.id, {
        nickname: data.nickname,
      });
    }
    if (data.avatarUrl !== undefined) {
      // The URL itself is not logged: it points at an uploaded file and adds nothing to the audit.
      await this.writeAuditLog(serverId, userId, 'MEMBER_PROFILE_UPDATE', member.id, {
        avatarUrl: Boolean(data.avatarUrl),
      });
    }

    // Only the fields this request changed are sent; the listener merges rather than replaces, so
    // an unrelated field such as `timeoutUntil` is not cleared by a nickname change.
    this.realtime.emitToRoom(this.realtime.serverRoom(serverId), 'server:member-updated', {
      serverId,
      memberId: updated.id,
      userId: updated.userId,
      ...(data.nickname !== undefined ? { nickname: updated.nickname } : {}),
      ...(data.avatarUrl !== undefined ? { avatarUrl: updated.avatarUrl } : {}),
    });

    return { member: updated };
  }

  async createInvite(userId: string, serverId: string, dto: CreateInviteDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.CreateInvite);
    if (dto.channelId) {
      const channel = await this.prisma.channel.findFirst({
        where: { id: dto.channelId, serverId },
      });
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }
    }

    const invite = await this.prisma.invite.create({
      data: {
        code: randomBytes(8).toString('base64url'),
        serverId,
        channelId: dto.channelId,
        creatorId: userId,
        maxUses: dto.maxUses ?? 100,
        expiresAt: dto.expiresAt
          ? new Date(dto.expiresAt)
          : new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    await this.writeAuditLog(serverId, userId, 'INVITE_CREATE', invite.id, {
      channelId: invite.channelId,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt,
    });
    return { invite };
  }

  async listInvites(userId: string, serverId: string): Promise<{ invites: Invite[] }> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.CreateInvite);
    const now = new Date();
    const invites = await this.prisma.invite.findMany({
      where: {
        serverId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { invites };
  }

  async revokeInvite(userId: string, serverId: string, inviteId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.CreateInvite);
    const invite = await this.prisma.invite.findFirst({ where: { id: inviteId, serverId } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    const revoked = await this.prisma.invite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
    await this.writeAuditLog(serverId, userId, 'INVITE_REVOKE', invite.id, { code: invite.code });
    return { invite: revoked };
  }

  async joinInvite(userId: string, code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { server: true },
    });

    if (!invite || invite.server.deletedAt) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.revokedAt) {
      throw new ForbiddenException('Invite revoked');
    }

    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      throw new ForbiddenException('Invite expired');
    }

    if (invite.maxUses && invite.usedCount >= invite.maxUses) {
      throw new ForbiddenException('Invite usage limit reached');
    }

    const ban = await this.prisma.serverBan.findUnique({
      where: { serverId_userId: { serverId: invite.serverId, userId } },
      select: { id: true },
    });
    if (ban) {
      throw new ForbiddenException('You are banned from this server');
    }

    const { member, joinedNow } = await this.prisma.$transaction(async (tx) => {
      const existingMember = await tx.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: invite.serverId } },
      });
      const member =
        existingMember ??
        (await tx.serverMember.create({
          data: {
            userId,
            serverId: invite.serverId,
            kind: 'MEMBER',
          },
        }));
      const everyoneRole = await tx.role.upsert({
        where: { serverId_name: { serverId: invite.serverId, name: '@everyone' } },
        create: {
          serverId: invite.serverId,
          name: '@everyone',
          position: 0,
          permissions: DEFAULT_MEMBER_PERMISSIONS,
        },
        update: {},
      });

      await tx.memberRole.upsert({
        where: { memberId_roleId: { memberId: member.id, roleId: everyoneRole.id } },
        create: { memberId: member.id, roleId: everyoneRole.id },
        update: {},
      });

      if (!existingMember) {
        await tx.invite.update({
          where: { id: invite.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      return { member, joinedNow: !existingMember };
    });

    return { serverId: invite.serverId, channelId: invite.channelId, member, joinedNow };
  }

  async requireMembership(userId: string, serverId: string) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this server');
    }

    return member;
  }

  normalizeChannelName(name: string) {
    const slug = slugifyChannelName(name);
    if (!slug) {
      throw new ForbiddenException('Invalid channel name');
    }
    return slug;
  }

  private async writeAuditLog(
    serverId: string,
    actorId: string,
    action: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { serverId, actorId, action, targetId, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}

/**
 * `metadata` is a JSON column, so the database can hand back a scalar or an array even though
 * `writeAuditLog` only ever stores an object. Narrowing here keeps the response honest instead of
 * asserting a shape the column does not guarantee.
 */
function toMetadataObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
