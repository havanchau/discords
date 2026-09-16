import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import {
  evaluateChannelPermission,
  Permission,
  PermissionChannel,
  PermissionMember,
  PermissionValue,
} from './channel-permission';

export { Permission };
export type { PermissionValue };

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMembership(userId: string, serverId: string) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      include: { roles: { include: { role: true } } },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this server');
    }

    return member;
  }

  async requireServerPermission(userId: string, serverId: string, permission: PermissionValue) {
    const member = await this.requireMembership(userId, serverId);

    if (member.kind === 'OWNER') {
      return member;
    }

    const allowed = member.roles.some(({ role }) => role.permissions.includes(permission));
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }

    return member;
  }

  async hasServerPermission(userId: string, serverId: string, permission: PermissionValue) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      include: { roles: { include: { role: true } } },
    });

    if (!member) {
      return false;
    }

    return (
      member.kind === 'OWNER' ||
      member.roles.some(({ role }) => role.permissions.includes(permission))
    );
  }

  /** Refuses members whose timeout has not expired yet; the owner can never be timed out. */
  async requireNotTimedOut(userId: string, serverId: string, now = new Date()) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { kind: true, timeoutUntil: true },
    });
    if (member && member.kind !== 'OWNER' && member.timeoutUntil && member.timeoutUntil > now) {
      throw new ForbiddenException(`You are timed out until ${member.timeoutUntil.toISOString()}`);
    }
  }

  async requireChannelPermission(userId: string, channelId: string, permission: PermissionValue) {
    const allowed = await this.hasChannelPermission(userId, channelId, permission);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  }

  async hasChannelPermission(userId: string, channelId: string, permission: PermissionValue) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true, isPrivate: true },
    });
    if (!channel) {
      return false;
    }

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } },
      include: { roles: { include: { role: true } } },
    });
    if (!member) {
      return false;
    }

    const overrides = await this.loadOverrides([channel.id]);
    return evaluateChannelPermission({ member, channel, overrides, permission });
  }

  /** Channels (across any servers) the user can view, evaluated with two queries in total. */
  async filterViewableChannels<T extends PermissionChannel & { serverId: string }>(
    userId: string,
    channels: T[],
  ): Promise<T[]> {
    if (!channels.length) return [];

    const serverIds = [...new Set(channels.map((channel) => channel.serverId))];
    const [members, overrides] = await Promise.all([
      this.prisma.serverMember.findMany({
        where: { userId, serverId: { in: serverIds } },
        include: { roles: { include: { role: true } } },
      }),
      this.loadOverrides(channels.map((channel) => channel.id)),
    ]);
    const memberByServer = new Map(members.map((member) => [member.serverId, member]));

    return channels.filter((channel) =>
      evaluateChannelPermission({
        member: memberByServer.get(channel.serverId),
        channel,
        overrides,
        permission: Permission.ViewChannel,
      }),
    );
  }

  /** Members (already loaded with roles) who can view one channel, with a single overrides query. */
  async filterMembersWhoCanView<T extends PermissionMember>(
    channel: PermissionChannel,
    members: T[],
  ) {
    if (!members.length) return [];

    const overrides = await this.loadOverrides([channel.id]);
    return members.filter((member) =>
      evaluateChannelPermission({
        member,
        channel,
        overrides,
        permission: Permission.ViewChannel,
      }),
    );
  }

  // Ordered so conflicting role overrides resolve the same way on every path.
  private loadOverrides(channelIds: string[]) {
    return this.prisma.channelPermissionOverride.findMany({
      where: { channelId: { in: channelIds } },
      select: { channelId: true, roleId: true, memberId: true, allow: true, deny: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
