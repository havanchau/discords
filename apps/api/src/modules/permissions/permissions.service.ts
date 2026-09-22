import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import {
  evaluateChannelPermission,
  Permission,
  PermissionChannel,
  PermissionMember,
  PermissionValue,
} from './channel-permission';
import { AGE_CONFIRMATION_REQUIRED_MESSAGE, channelNeedsAgeConfirmation } from './age-gate';
import { memberNeedsOnboarding, RULES_NOT_ACCEPTED_MESSAGE } from './onboarding-gate';

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

  /**
   * Refuses members that rules screening still blocks. Sits beside `requireNotTimedOut` on every
   * participation path: sends (via `MessagesService.requireCanPostInChannel`), thread replies, edits,
   * reactions, poll votes and voice joins.
   */
  async requireOnboardingAccepted(userId: string, serverId: string) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: {
        kind: true,
        onboardingAcceptedAt: true,
        server: { select: { onboardingEnabled: true } },
        roles: { select: { role: { select: { permissions: true } } } },
      },
    });
    // Membership itself is checked by the caller's access check, as for `requireNotTimedOut`.
    if (member && memberNeedsOnboarding(member.server, member)) {
      throw new ForbiddenException(RULES_NOT_ACCEPTED_MESSAGE);
    }
  }

  /**
   * Refuses an unconfirmed user on an age-restricted channel. Called after the `ViewChannel` check by
   * both content choke points — `ChannelsService.requireReadableChannel` (REST) and
   * `RealtimeAccessService.requireViewableChannel` (`channel:join`) — so they cannot drift apart.
   * Bots are exempt, as for rules screening (docs/features/age-restricted-channels.md).
   */
  async requireAgeConfirmed(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true, isAgeRestricted: true },
    });
    // Existence and membership are checked by the caller's `ViewChannel` check.
    if (!channel?.isAgeRestricted) return;

    const [user, member] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { ageConfirmedAt: true } }),
      this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: channel.serverId } },
        select: { kind: true },
      }),
    ]);
    if (member?.kind === 'BOT') return;
    if (channelNeedsAgeConfirmation(channel, { ageConfirmedAt: user?.ageConfirmedAt ?? null })) {
      throw new ForbiddenException(AGE_CONFIRMATION_REQUIRED_MESSAGE);
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
