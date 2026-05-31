import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServersService } from '../servers/servers.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelOverridesDto } from './dto/channel-overrides.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
    private readonly permissions: PermissionsService,
  ) {}

  async createChannel(userId: string, serverId: string, dto: CreateChannelDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageChannels);
    const name = this.servers.normalizeChannelName(dto.name);
    const channelCount = await this.prisma.channel.count({ where: { serverId } });

    const channel = await this.prisma.channel.create({
      data: {
        serverId,
        name,
        type: dto.type || 'TEXT',
        topic: dto.topic,
        position: channelCount,
      },
    });
    await this.writeAuditLog(channel.serverId, userId, 'CHANNEL_CREATE', channel.id, {
      name: channel.name,
      type: channel.type,
    });
    return { channel };
  }

  async listChannels(userId: string, serverId: string) {
    await this.servers.requireMembership(userId, serverId);
    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const visibleChannels = [];
    for (const channel of channels) {
      if (await this.permissions.hasChannelPermission(userId, channel.id, Permission.ViewChannel)) {
        visibleChannels.push(channel);
      }
    }
    return { channels: visibleChannels };
  }

  async getChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.servers.requireMembership(userId, channel.serverId);
    await this.permissions.requireChannelPermission(
      userId,
      channel.id,
      Permission.ViewChannel,
    );
    return { channel };
  }

  async updateChannel(userId: string, channelId: string, dto: UpdateChannelDto) {
    const existing = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!existing) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageChannels,
    );
    const channel = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        name: dto.name ? this.servers.normalizeChannelName(dto.name) : undefined,
        topic: dto.topic,
        avatarUrl: dto.avatarUrl,
        isPrivate: dto.isPrivate,
        position: dto.position,
      },
    });
    await this.writeAuditLog(channel.serverId, userId, 'CHANNEL_UPDATE', channel.id, {
      name: channel.name,
      isPrivate: channel.isPrivate,
      position: channel.position,
    });
    return { channel };
  }

  async listPermissionOverrides(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { permissionOverrides: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireServerPermission(
      userId,
      channel.serverId,
      Permission.ManageChannels,
    );
    return { overrides: channel.permissionOverrides };
  }

  async updatePermissionOverrides(
    userId: string,
    channelId: string,
    dto: UpdateChannelOverridesDto,
  ) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireServerPermission(
      userId,
      channel.serverId,
      Permission.ManageChannels,
    );

    const overrides = dto.overrides.filter((override) => override.roleId || override.memberId);
    await this.prisma.$transaction([
      this.prisma.channelPermissionOverride.deleteMany({ where: { channelId } }),
      ...overrides.map((override) =>
        this.prisma.channelPermissionOverride.create({
          data: {
            channelId,
            roleId: override.roleId,
            memberId: override.memberId,
            allow: override.allow,
            deny: override.deny,
          },
        }),
      ),
    ]);
    await this.writeAuditLog(channel.serverId, userId, 'CHANNEL_OVERRIDES_UPDATE', channel.id, {
      count: overrides.length,
    });
    return this.listPermissionOverrides(userId, channelId);
  }

  async requireReadableChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireChannelPermission(
      userId,
      channel.id,
      Permission.ViewChannel,
    );
    return channel;
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
