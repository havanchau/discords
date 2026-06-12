import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { slugifyChannelName } from '../../common/slugify';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
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

  async listForUser(userId: string) {
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
    const visibleServers = [];
    for (const server of servers) {
      const channels = [];
      for (const channel of server.channels) {
        if (
          await this.permissions.hasChannelPermission(userId, channel.id, Permission.ViewChannel)
        ) {
          channels.push(channel);
        }
      }
      visibleServers.push({ ...server, channels });
    }
    return { servers: visibleServers };
  }

  async getServerForUser(userId: string, serverId: string) {
    await this.requireMembership(userId, serverId);
    const server = await this.prisma.server.findFirstOrThrow({
      where: { id: serverId, deletedAt: null },
      include: {
        channels: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: {
            readStates: { where: { userId }, take: 1 },
          },
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
      },
    });
    const channels = [];
    for (const channel of server.channels) {
      if (
        !(await this.permissions.hasChannelPermission(userId, channel.id, Permission.ViewChannel))
      ) {
        continue;
      }
      const readState = channel.readStates[0];
      const unreadCount = await this.prisma.message.count({
        where: {
          channelId: channel.id,
          deletedAt: null,
          authorId: { not: userId },
          ...(readState ? { createdAt: { gt: readState.lastReadAt } } : {}),
        },
      });
      const { readStates: _readStates, ...rest } = channel;
      channels.push({ ...rest, unreadCount });
    }
    return { server: { ...server, channels } };
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

  async listAuditLogs(userId: string, serverId: string) {
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
    return { logs };
  }

  async updateMyMembership(userId: string, serverId: string, dto: UpdateNicknameDto) {
    const member = await this.requireMembership(userId, serverId);
    const nickname = dto.nickname?.trim() || null;
    const updated = await this.prisma.serverMember.update({
      where: { id: member.id },
      data: { nickname },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
        },
        roles: { include: { role: true } },
      },
    });
    await this.writeAuditLog(serverId, userId, 'MEMBER_NICKNAME_UPDATE', member.id, { nickname });
    return { member: updated };
  }

  async removeMember(userId: string, serverId: string, memberId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.KickMembers);
    const [actor, target] = await Promise.all([
      this.requireMembership(userId, serverId),
      this.prisma.serverMember.findFirst({
        where: { id: memberId, serverId },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      }),
    ]);
    if (!target) throw new NotFoundException('Member not found');
    if (target.kind === 'OWNER') throw new ForbiddenException('Cannot kick the server owner');
    if (target.id === actor.id) throw new ForbiddenException('Cannot kick yourself');

    await this.prisma.serverMember.delete({ where: { id: target.id } });
    await this.writeAuditLog(serverId, userId, 'MEMBER_KICK', target.id, {
      userId: target.userId,
      username: target.user.username,
      displayName: target.user.displayName,
    });

    return { ok: true };
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

  async listInvites(userId: string, serverId: string) {
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
