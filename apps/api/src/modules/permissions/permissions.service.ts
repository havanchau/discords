import { ForbiddenException, Injectable } from '@nestjs/common';
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
}
