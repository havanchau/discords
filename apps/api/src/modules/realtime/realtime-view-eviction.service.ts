import { Injectable } from '@nestjs/common';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import type { PermissionMember } from '@/modules/permissions/channel-permission';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from './realtime-publisher.service';

/** Enough of `ServerMember` to route an eviction: humans leave via `userId`, bots via their `Bot.id`. */
interface EvictableMember {
  userId: string;
  kind: string;
}

/**
 * Reused by every write path that can remove a member's `VIEW_CHANNEL` — channel privacy/overrides,
 * role permission/deletion, member role add/remove (docs/features/channel-view-eviction.md). Recomputes
 * viewability with the existing `PermissionsService` batch helpers (no new permission-evaluation logic)
 * and evicts everyone who no longer qualifies from the affected channel room(s), so a socket already
 * sitting in a room stops receiving its live events the moment REST access is revoked.
 */
@Injectable()
export class RealtimeViewEvictionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  /** After a write that can change who can view one channel (`isPrivate` flip, override replacement). */
  async evictChannel(channelId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true, isPrivate: true },
    });
    if (!channel) return;

    const members = await this.loadServerMembers(channel.serverId);
    if (!members.length) return;

    const evicted = await this.membersLosingView(channel, members);
    await this.evictMembersFromRooms(evicted, [this.realtime.channelRoom(channel.id)]);
  }

  /** After a role's `permissions` changed or the role was deleted: recheck only its holders, per channel. */
  async evictServerForRole(serverId: string, roleId: string): Promise<void> {
    const [channels, holders] = await Promise.all([
      this.loadServerChannels(serverId),
      this.loadRoleHolders(serverId, roleId),
    ]);
    if (!channels.length || !holders.length) return;

    for (const channel of channels) {
      const evicted = await this.membersLosingView(channel, holders);
      await this.evictMembersFromRooms(evicted, [this.realtime.channelRoom(channel.id)]);
    }
  }

  /** After a role was added to or removed from one member: recheck every channel of the server for them. */
  async evictMember(serverId: string, userId: string): Promise<void> {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { userId: true, kind: true },
    });
    if (!member) return;

    const channels = await this.loadServerChannels(serverId);
    if (!channels.length) return;

    const viewable = await this.permissions.filterViewableChannels(userId, channels);
    const viewableIds = new Set(viewable.map((channel) => channel.id));
    const evictedChannels = channels.filter((channel) => !viewableIds.has(channel.id));
    if (!evictedChannels.length) return;

    await this.evictMembersFromRooms(
      [member],
      evictedChannels.map((channel) => this.realtime.channelRoom(channel.id)),
    );
  }

  private async membersLosingView<T extends EvictableMember & PermissionMember>(
    channel: { id: string; isPrivate: boolean },
    members: T[],
  ) {
    const viewers = await this.permissions.filterMembersWhoCanView(channel, members);
    const viewerIds = new Set(viewers.map((member) => member.id));
    return members.filter((member) => !viewerIds.has(member.id));
  }

  private loadServerMembers(serverId: string) {
    return this.prisma.serverMember.findMany({
      where: { serverId },
      include: { roles: { include: { role: true } } },
    });
  }

  private loadServerChannels(serverId: string) {
    return this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true, serverId: true, isPrivate: true },
    });
  }

  private loadRoleHolders(serverId: string, roleId: string) {
    return this.prisma.serverMember.findMany({
      where: { serverId, roles: { some: { roleId } } },
      include: { roles: { include: { role: true } } },
    });
  }

  /** Human members leave via `userRoom`; a bot member never joins it (`bot-gateway-sync.ts`), so it
   * leaves via `botRoom`, resolved from `Bot.botUserId`. */
  private async evictMembersFromRooms(members: EvictableMember[], rooms: string[]) {
    if (!members.length || !rooms.length) return;

    const humanUserIds = members
      .filter((member) => member.kind !== 'BOT')
      .map((member) => member.userId);
    this.realtime.removeUsersFromRooms(humanUserIds, rooms);

    const botUserIds = members
      .filter((member) => member.kind === 'BOT')
      .map((member) => member.userId);
    if (!botUserIds.length) return;

    const bots = await this.prisma.bot.findMany({
      where: { botUserId: { in: botUserIds } },
      select: { id: true },
    });
    bots.forEach((bot) => this.realtime.removeBotFromRooms(bot.id, rooms));
  }
}
