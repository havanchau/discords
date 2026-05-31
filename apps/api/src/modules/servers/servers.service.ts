import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { slugifyChannelName } from '../../common/slugify';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';

const DEFAULT_MEMBER_PERMISSIONS = [
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'CREATE_INVITE',
  'CONNECT_VOICE',
  'SPEAK_VOICE',
  'UPLOAD_FILES'
];

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  async createServer(userId: string, dto: CreateServerDto) {
    const server = await this.prisma.$transaction(async (tx) => {
      const created = await tx.server.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          ownerId: userId
        }
      });

      const everyoneRole = await tx.role.create({
        data: {
          serverId: created.id,
          name: '@everyone',
          position: 0,
          permissions: DEFAULT_MEMBER_PERMISSIONS
        }
      });

      const ownerMember = await tx.serverMember.create({
        data: {
          userId,
          serverId: created.id,
          kind: 'OWNER'
        }
      });

      await tx.memberRole.create({
        data: {
          memberId: ownerMember.id,
          roleId: everyoneRole.id
        }
      });

      await tx.channel.create({
        data: {
          serverId: created.id,
          name: 'general',
          type: 'TEXT',
          position: 0
        }
      });

      return created;
    });

    return this.getServerForUser(userId, server.id);
  }

  async listForUser(userId: string) {
    const servers = await this.prisma.server.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } }
      },
      include: {
        channels: { orderBy: { position: 'asc' } }
      },
      orderBy: { updatedAt: 'desc' }
    });
    return { servers };
  }

  async getServerForUser(userId: string, serverId: string) {
    await this.requireMembership(userId, serverId);
    const server = await this.prisma.server.findFirstOrThrow({
      where: { id: serverId, deletedAt: null },
      include: {
        channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                status: true
              }
            },
            roles: { include: { role: true } }
          },
          orderBy: { joinedAt: 'asc' }
        },
        roles: { orderBy: { position: 'asc' } }
      }
    });
    return { server };
  }

  async updateServer(userId: string, serverId: string, dto: UpdateServerDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    await this.prisma.server.update({
      where: { id: serverId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim()
      }
    });
    return this.getServerForUser(userId, serverId);
  }

  async createInvite(userId: string, serverId: string, dto: CreateInviteDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.CreateInvite);
    if (dto.channelId) {
      const channel = await this.prisma.channel.findFirst({
        where: { id: dto.channelId, serverId }
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
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
      }
    });
    return { invite };
  }

  async joinInvite(userId: string, code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { server: true }
    });

    if (!invite || invite.server.deletedAt) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      throw new ForbiddenException('Invite expired');
    }

    if (invite.maxUses && invite.usedCount >= invite.maxUses) {
      throw new ForbiddenException('Invite usage limit reached');
    }

    const { member, joinedNow } = await this.prisma.$transaction(async (tx) => {
      const existingMember = await tx.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: invite.serverId } }
      });
      const member =
        existingMember ??
        (await tx.serverMember.create({
          data: {
            userId,
            serverId: invite.serverId,
            kind: 'MEMBER'
          }
        }));
      const everyoneRole = await tx.role.upsert({
        where: { serverId_name: { serverId: invite.serverId, name: '@everyone' } },
        create: {
          serverId: invite.serverId,
          name: '@everyone',
          position: 0,
          permissions: DEFAULT_MEMBER_PERMISSIONS
        },
        update: {}
      });

      await tx.memberRole.upsert({
        where: { memberId_roleId: { memberId: member.id, roleId: everyoneRole.id } },
        create: { memberId: member.id, roleId: everyoneRole.id },
        update: {}
      });

      if (!existingMember) {
        await tx.invite.update({
          where: { id: invite.id },
          data: { usedCount: { increment: 1 } }
        });
      }

      return { member, joinedNow: !existingMember };
    });

    return { serverId: invite.serverId, channelId: invite.channelId, member, joinedNow };
  }

  async requireMembership(userId: string, serverId: string) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } }
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
}
