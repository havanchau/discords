import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { NotificationPreference, User, UserProfile } from '@discord-clone/shared';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { PROFILE_USER_SELECT, toProfileView, type CustomStatusView } from './user-profile';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly uploads: UploadsService,
  ) {}

  async getMe(userId: string): Promise<{ user: User }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ...PROFILE_USER_SELECT, email: true, locale: true, platformRole: true },
    });
    return { user: toProfileView(user) };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const setsStatus =
      dto.customStatusText !== undefined ||
      dto.customStatusEmoji !== undefined ||
      dto.customStatusExpiresAt !== undefined;
    const setsExpiresAt = dto.customStatusExpiresAt !== undefined;

    // No scheduled job clears an expired status, so a profile write is where the stale row is
    // dropped. Conditional on the stored expiry, so it never overwrites a status set concurrently.
    // Runs whenever the write does not itself set an expiry — including a write that sets only the
    // text or emoji, which used to skip this and leave the new text hidden behind an old past
    // expiry (docs/features/qa-follow-ups-2026-09-18.md, "Custom status").
    if (!setsExpiresAt) {
      await this.prisma.user.updateMany({
        where: { id: userId, customStatusExpiresAt: { lte: new Date() } },
        data: { customStatusText: null, customStatusEmoji: null, customStatusExpiresAt: null },
      });
    }

    // The regex on the DTO only checks the URL's shape; this is the real authorization check
    // (upload-ownership.md) — a URL not owned by this caller, including one nobody ever uploaded,
    // is refused before it can be written onto the account.
    if (dto.avatarUrl) await this.requireOwnedUpload(userId, dto.avatarUrl);
    if (dto.bannerUrl) await this.requireOwnedUpload(userId, dto.bannerUrl);

    const previous =
      dto.avatarUrl !== undefined || dto.bannerUrl !== undefined
        ? await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { avatarUrl: true, bannerUrl: true },
          })
        : null;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { ...PROFILE_USER_SELECT, email: true, locale: true, updatedAt: true },
    });
    const view = toProfileView(user);
    const customStatus = view.customStatus;

    // Presence already carries the status dot; the custom status rides the same event so open
    // clients update the member list without refetching.
    if (setsStatus) {
      await this.broadcastCustomStatus(userId, customStatus);
    }

    await this.deleteReplacedUploads(previous, dto);

    return { user: view };
  }

  private async requireOwnedUpload(userId: string, url: string) {
    const owned = await this.uploads.findOwnedUpload(userId, url);
    if (!owned) throw new BadRequestException('Upload not found or not owned by you');
  }

  /**
   * Runs after the update commits: an old avatar/banner is deleted only once it is no longer the
   * live value, and only if nothing else still references it (upload-ownership.md rule 5). A
   * legacy URL with no `Upload` row is left alone — `deleteUploadIfUnreferenced` no-ops for it.
   */
  private async deleteReplacedUploads(
    previous: { avatarUrl: string | null; bannerUrl: string | null } | null,
    dto: UpdateMeDto,
  ) {
    if (!previous) return;
    const changedUrls = [
      dto.avatarUrl !== undefined && previous.avatarUrl && previous.avatarUrl !== dto.avatarUrl
        ? previous.avatarUrl
        : null,
      dto.bannerUrl !== undefined && previous.bannerUrl && previous.bannerUrl !== dto.bannerUrl
        ? previous.bannerUrl
        : null,
    ].filter((url): url is string => url !== null);
    // De-duplicated: the same URL set as both fields is checked once, not attempted twice.
    for (const url of new Set(changedUrls)) {
      await this.uploads.deleteUploadIfUnreferenced(url);
    }
  }

  private async broadcastCustomStatus(userId: string, customStatus: CustomStatusView | null) {
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });
    memberships.forEach(({ serverId }) => {
      this.realtime.emitToRoom(this.realtime.serverRoom(serverId), 'presence:update', {
        userId,
        customStatus,
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
      select: PROFILE_USER_SELECT,
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
            roles: { select: { role: { select: { id: true, name: true, color: true } } } },
          },
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
              roles: membership.roles.map(({ role }) => role),
            }
          : null,
      },
    };
  }

  private async canViewProfile(viewerId: string, targetId: string) {
    if (viewerId === targetId) return true;

    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: targetId },
          { blockerId: targetId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    });
    if (block) return false;

    const sharedServer = await this.prisma.serverMember.findFirst({
      where: { userId: targetId, server: { members: { some: { userId: viewerId } } } },
      select: { id: true },
    });
    if (sharedServer) return true;

    const sharedConversation = await this.prisma.directConversationMember.findFirst({
      where: {
        userId: targetId,
        conversation: { members: { some: { userId: viewerId } } },
      },
      select: { conversationId: true },
    });
    return Boolean(sharedConversation);
  }

  async listNotificationPreferences(
    userId: string,
  ): Promise<{ preferences: NotificationPreference[] }> {
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
