import { Injectable } from '@nestjs/common';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { countChannelUnread } from '@/modules/messages/unread-counts';
import { RealtimePublisher } from './realtime-publisher.service';

export interface UnreadRecipient {
  userId: string;
  mentions: number;
}

function messageMentionsUsername(content: string, username: string) {
  return [...content.matchAll(/@([a-zA-Z0-9_]+)/g)].some(
    (match) => match[1].toLowerCase() === username.toLowerCase(),
  );
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
    const [channel, members] = await Promise.all([
      this.prisma.channel.findUnique({
        where: { id: message.channelId },
        select: { id: true, isPrivate: true },
      }),
      this.prisma.serverMember.findMany({
        where: { serverId: message.serverId, userId: { not: message.authorId } },
        include: {
          user: { select: { username: true } },
          roles: { include: { role: true } },
        },
      }),
    ]);
    if (!channel) return [];

    const viewers = await this.permissions.filterMembersWhoCanView(channel, members);
    return viewers.map((member) => ({
      userId: member.userId,
      mentions: messageMentionsUsername(message.content, member.user.username) ? 1 : 0,
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
      where: { serverId: { in: serverIds }, type: { in: ['TEXT', 'ANNOUNCEMENT', 'FORUM'] } },
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
