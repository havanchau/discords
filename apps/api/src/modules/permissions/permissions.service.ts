import { ForbiddenException, Injectable } from '@nestjs/common';
import { Channel, ServerMember } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const Permission = {
  ViewChannel: 'VIEW_CHANNEL',
  SendMessages: 'SEND_MESSAGES',
  ManageMessages: 'MANAGE_MESSAGES',
  ManageChannels: 'MANAGE_CHANNELS',
  ManageServer: 'MANAGE_SERVER',
  ManageRoles: 'MANAGE_ROLES',
  KickMembers: 'KICK_MEMBERS',
  BanMembers: 'BAN_MEMBERS',
  CreateInvite: 'CREATE_INVITE',
  ConnectVoice: 'CONNECT_VOICE',
  SpeakVoice: 'SPEAK_VOICE',
  UploadFiles: 'UPLOAD_FILES'
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMembership(userId: string, serverId: string) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      include: { roles: { include: { role: true } } }
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
      include: { roles: { include: { role: true } } }
    });

    if (!member) {
      return false;
    }

    return member.kind === 'OWNER' || member.roles.some(({ role }) => role.permissions.includes(permission));
  }

  async requireChannelPermission(userId: string, channelId: string, permission: PermissionValue) {
    const allowed = await this.hasChannelPermission(userId, channelId, permission);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  }

  async hasChannelPermission(userId: string, channelId: string, permission: PermissionValue) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
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

    if (member.kind === 'OWNER') {
      return true;
    }

    if (permission === Permission.ViewChannel && channel.isPrivate) {
      const canManageChannels = await this.hasServerPermission(
        userId,
        channel.serverId,
        Permission.ManageChannels,
      );
      if (canManageChannels) {
        return true;
      }
      return this.applyChannelOverrides(channel, member, permission, false);
    }

    const baseAllowed = member.roles.some(({ role }) => role.permissions.includes(permission));
    return this.applyChannelOverrides(channel, member, permission, baseAllowed);
  }

  private async applyChannelOverrides(
    channel: Channel,
    member: ServerMemberWithRoles,
    permission: PermissionValue,
    baseAllowed: boolean,
  ) {
    const roleIds = member.roles.map(({ roleId }) => roleId);
    const overrides = await this.prisma.channelPermissionOverride.findMany({
      where: {
        channelId: channel.id,
        OR: [{ roleId: { in: roleIds } }, { memberId: member.id }],
      },
    });

    let allowed = baseAllowed;
    for (const override of overrides.filter((item) => item.roleId)) {
      if (override.deny.includes(permission)) allowed = false;
      if (override.allow.includes(permission)) allowed = true;
    }

    const memberOverride = overrides.find((item) => item.memberId === member.id);
    if (memberOverride?.deny.includes(permission)) allowed = false;
    if (memberOverride?.allow.includes(permission)) allowed = true;

    return allowed;
  }
}

type ServerMemberWithRoles = ServerMember & {
  roles: Array<{ roleId: string; role: { permissions: string[] } }>;
};
