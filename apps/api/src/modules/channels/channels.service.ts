import { Injectable, NotFoundException } from '@nestjs/common';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServersService } from '../servers/servers.service';
import { CreateChannelDto } from './dto/create-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
    private readonly permissions: PermissionsService
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
        position: channelCount
      }
    });
    return { channel };
  }

  async listChannels(userId: string, serverId: string) {
    await this.servers.requireMembership(userId, serverId);
    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
    });
    return { channels };
  }

  async getChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.servers.requireMembership(userId, channel.serverId);
    await this.permissions.requireServerPermission(userId, channel.serverId, Permission.ViewChannel);
    return { channel };
  }

  async requireReadableChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireServerPermission(userId, channel.serverId, Permission.ViewChannel);
    return channel;
  }
}
