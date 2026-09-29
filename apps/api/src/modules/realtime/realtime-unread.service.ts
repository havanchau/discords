import { Injectable } from '@nestjs/common';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { parseMentionTokens } from '@/modules/messages/mentions';
import { countChannelUnread } from '@/modules/messages/unread-counts';
import { RealtimePublisher } from './realtime-publisher.service';

export interface UnreadRecipient {
  userId: string;
  mentions: number;
}

/** What one message's `@tokens` resolve to, computed once per message rather than per recipient. */
interface MentionTargets {
  everyone: boolean;
  here: boolean;
  roleNames: Set<string>;
  usernames: Set<string>;
}

function resolveMentionTargets(content: string, serverRoleNames: string[]): MentionTargets {
  const tokens = parseMentionTokens(content, serverRoleNames);
  return {
    everyone: tokens.some((token) => token.kind === 'everyone'),
    here: tokens.some((token) => token.kind === 'here'),
    roleNames: new Set(
      tokens.flatMap((token) => (token.kind === 'role' ? [token.name.toLowerCase()] : [])),
    ),
    usernames: new Set(
      tokens.flatMap((token) => (token.kind === 'user' ? [token.username.toLowerCase()] : [])),
    ),
  };
}

@Injectable()
export class RealtimeUnreadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly publisher: RealtimePublisher,
  ) {}

  /**
   * Emits `unread:updated` to every recipient's user room for one new message — the socket and REST
   * send paths share this so a REST send updates unread badges the same way (docs/features/qa-follow-ups-2026-09-18.md,
   * "REST send").
   */
  async emitUpdated(message: {
    authorId: string;
    channelId: string;
    serverId: string;
    content: string;
  }) {
    const recipients = await this.listUnreadRecipients(message);
    recipients.forEach((recipient) => {
      this.publisher.emitToRoom(this.publisher.userRoom(recipient.userId), 'unread:updated', {
        channelId: message.channelId,
        count: 1,
        mentions: recipient.mentions,
      });
    });
  }

  /** Who should see this new message count against their unread badge, and with how many mentions. */
  async listUnreadRecipients(message: {
    authorId: string;
    channelId: string;
    serverId: string;
    content: string;
  }): Promise<UnreadRecipient[]> {
    const [channel, members, serverRoles] = await Promise.all([
      this.prisma.channel.findUnique({
        where: { id: message.channelId },
        select: { id: true, isPrivate: true },
      }),
      this.prisma.serverMember.findMany({
        where: { serverId: message.serverId, userId: { not: message.authorId } },
        include: {
          // `status` is what separates `@here` from `@everyone`.
          user: { select: { username: true, status: true } },
          roles: { include: { role: true } },
        },
      }),
      // The server's full role list, not just the roles these members happen to hold — a role
      // mention must parse as a role even when nobody holds it yet.
      this.prisma.role.findMany({
        where: { serverId: message.serverId },
        select: { name: true },
      }),
    ]);
    if (!channel) return [];

    const targets = resolveMentionTargets(
      message.content,
      serverRoles.map((role) => role.name),
    );
    const viewers = await this.permissions.filterMembersWhoCanView(channel, members);
    return viewers.map((member) => ({
      userId: member.userId,
      // Still 0-or-1: the badge counts "this message mentions me", not how many ways it does.
      mentions:
        targets.everyone ||
        (targets.here && member.user.status === 'ONLINE') ||
        targets.usernames.has(member.user.username.toLowerCase()) ||
        member.roles.some(({ role }) => targets.roleNames.has(role.name.toLowerCase()))
          ? 1
          : 0,
    }));
  }

  async countByChannel(userId: string) {
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const serverIds = memberships.map((membership) => membership.serverId);
    if (!serverIds.length) return {};

    const channels = await this.prisma.channel.findMany({
      where: {
        serverId: { in: serverIds },
        type: { in: ['TEXT', 'ANNOUNCEMENT', 'FORUM', 'DECISION'] },
      },
      select: { id: true, serverId: true, isPrivate: true },
    });
    const viewableChannels = await this.permissions.filterViewableChannels(userId, channels);

    return countChannelUnread(
      this.prisma,
      userId,
      viewableChannels.map((channel) => channel.id),
    );
  }
}
