import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationPreference, User, UserProfile } from '@discord-clone/shared';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { PROFILE_USER_SELECT, toProfileView, type CustomStatusView } from './user-profile';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async getMe(userId: string): Promise<{ user: User }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ...PROFILE_USER_SELECT, email: true, locale: true }
    });
    return { user: toProfileView(user) };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const setsStatus =
      dto.customStatusText !== undefined ||
      dto.customStatusEmoji !== undefined ||
      dto.customStatusExpiresAt !== undefined;

    // No scheduled job clears an expired status, so a profile write is where the stale row is
    // dropped. Conditional on the stored expiry, so it never overwrites a status set concurrently.
    if (!setsStatus) {
      await this.prisma.user.updateMany({
        where: { id: userId, customStatusExpiresAt: { lte: new Date() } },
        data: { customStatusText: null, customStatusEmoji: null, customStatusExpiresAt: null }
      });
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { ...PROFILE_USER_SELECT, email: true, locale: true, updatedAt: true }
    });
    const view = toProfileView(user);
    const customStatus = view.customStatus;

    // Presence already carries the status dot; the custom status rides the same event so open
    // clients update the member list without refetching.
    if (setsStatus) {
      await this.broadcastCustomStatus(userId, customStatus);
    }

    return { user: view };
  }

  private async broadcastCustomStatus(userId: string, customStatus: CustomStatusView | null) {
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true }
    });
    memberships.forEach(({ serverId }) => {
      this.realtime.emitToRoom(this.realtime.serverRoom(serverId), 'presence:update', {
        userId,
        customStatus
      });
    });
  }

  /**
   * Readable by anyone who shares a server or a conversation with the target. Everything else is a
   * 404, including a block in either direction, so the endpoint cannot confirm that an account
   * exists for a guessed id.
   */
  async getProfile(
    viewerId: string,
    targetId: string,
    serverId?: string,
  ): Promise<{ profile: UserProfile }> {
    if (!(await this.canViewProfile(viewerId, targetId))) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: PROFILE_USER_SELECT
    });
    if (!user) throw new NotFoundException('User not found');

    const membership = serverId
      ? await this.prisma.serverMember.findFirst({
          where: { userId: targetId, serverId },
          select: {
            serverId: true,
            nickname: true,
            avatarUrl: true,
            joinedAt: true,
            roles: { select: { role: { select: { id: true, name: true, color: true } } } }
          }
        })
      : null;

    return {
      profile: {
        ...toProfileView(user),
        server: membership
          ? {
              serverId: membership.serverId,
              nickname: membership.nickname,
              avatarUrl: membership.avatarUrl,
              joinedAt: membership.joinedAt,
              roles: membership.roles.map(({ role }) => role)
            }
          : null
      }
    };
  }

  private async canViewProfile(viewerId: string, targetId: string) {
    if (viewerId === targetId) return true;

    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: targetId },
          { blockerId: targetId, blockedId: viewerId }
        ]
      },
      select: { blockerId: true }
    });
    if (block) return false;

    const sharedServer = await this.prisma.serverMember.findFirst({
      where: { userId: targetId, server: { members: { some: { userId: viewerId } } } },
      select: { id: true }
    });
    if (sharedServer) return true;

    const sharedConversation = await this.prisma.directConversationMember.findFirst({
      where: {
        userId: targetId,
        conversation: { members: { some: { userId: viewerId } } }
      },
      select: { conversationId: true }
    });
    return Boolean(sharedConversation);
  }

  async listNotificationPreferences(userId: string): Promise<{ preferences: NotificationPreference[] }> {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return { preferences };
  }

  async updateNotificationPreference(userId: string, dto: UpdateNotificationPreferenceDto) {
    const existing = await this.prisma.notificationPreference.findFirst({
      where: {
        userId,
        serverId: dto.serverId ?? null,
        channelId: dto.channelId ?? null,
      },
    });

    const data = {
      userId,
      serverId: dto.serverId,
      channelId: dto.channelId,
      muted: dto.muted ?? false,
      mentionOnly: dto.mentionOnly ?? false,
      desktopEnabled: dto.desktopEnabled ?? false,
    };

    const preference = existing
      ? await this.prisma.notificationPreference.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.notificationPreference.create({ data });

    return { preference };
  }
}
