import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type {
  NotificationPreference,
  User,
  UserNoteResult,
  UserProfile,
} from '@discord-clone/shared';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpsertUserNoteDto } from './dto/upsert-user-note.dto';
import {
  NOTIFICATION_PREFERENCE_SELECT,
  resolveMutedUntil,
  toNotificationPreferenceView,
} from './notification-mute';
import { PROFILE_USER_SELECT, toProfileView, type CustomStatusView } from './user-profile';

const USER_NOTE_SELECT = { targetId: true, content: true, updatedAt: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly uploads: UploadsService,
    private readonly permissions: PermissionsService,
  ) {}

  async getMe(userId: string): Promise<{ user: User }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        ...PROFILE_USER_SELECT,
        email: true,
        locale: true,
        platformRole: true,
        ageConfirmedAt: true,
      },
    });
    return { user: toProfileView(user) };
  }

  /**
   * Records the self-attested 18+ confirmation (docs/features/age-restricted-channels.md). Conditional
   * on the stored value, so a repeat call keeps the original timestamp instead of moving it.
   */
  async confirmAge(userId: string): Promise<{ user: User }> {
    await this.prisma.user.updateMany({
      where: { id: userId, ageConfirmedAt: null },
      data: { ageConfirmedAt: new Date() },
    });
    return this.getMe(userId);
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
            // `position` and `iconUrl` are what the profile card needs to pick and render the
            // member's highest-position role icon (docs/features/role-hoist-and-icon.md).
            roles: {
              select: {
                role: {
                  select: { id: true, name: true, color: true, position: true, iconUrl: true },
                },
              },
            },
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

  /**
   * The caller's own note about `targetId`. Looked up by `(authorId: callerId)`, so no path returns
   * a note someone else wrote. Gated like `getProfile`, so a hidden user's note is a 404 as well.
   */
  async getNote(callerId: string, targetId: string): Promise<UserNoteResult> {
    await this.requireNotableUser(callerId, targetId);
    const note = await this.prisma.userNote.findUnique({
      where: { authorId_targetId: { authorId: callerId, targetId } },
      select: USER_NOTE_SELECT,
    });
    return { note };
  }

  /** Saves the caller's note about `targetId`; content that trims to empty deletes it instead. */
  async upsertNote(
    callerId: string,
    targetId: string,
    dto: UpsertUserNoteDto,
  ): Promise<UserNoteResult> {
    await this.requireNotableUser(callerId, targetId);
    const content = dto.content.trim();

    if (!content) {
      // deleteMany so clearing a note that was never written is a no-op rather than a 404.
      await this.prisma.userNote.deleteMany({ where: { authorId: callerId, targetId } });
      return { note: null };
    }

    const note = await this.prisma.userNote.upsert({
      where: { authorId_targetId: { authorId: callerId, targetId } },
      create: { authorId: callerId, targetId, content },
      update: { content },
      select: USER_NOTE_SELECT,
    });
    return { note };
  }

  private async requireNotableUser(callerId: string, targetId: string) {
    if (callerId === targetId) {
      throw new BadRequestException('Cannot write a note about yourself');
    }
    if (!(await this.canViewProfile(callerId, targetId))) {
      throw new NotFoundException('User not found');
    }
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
      select: NOTIFICATION_PREFERENCE_SELECT,
    });
    return { preferences: preferences.map(toNotificationPreferenceView) };
  }

  /**
   * Partial merge: a field missing from the body keeps the stored value
   * (docs/features/timed-notification-mute.md, Rules item 4). A scoped row needs the caller to be in
   * that server / able to view that channel; otherwise 404, so existence is not leaked.
   */
  async updateNotificationPreference(
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<{ preference: NotificationPreference }> {
    if (dto.muteDuration !== undefined && dto.muted !== true) {
      throw new BadRequestException('Mute duration requires muted to be true');
    }
    await this.requireNotificationScope(userId, dto.serverId, dto.channelId);

    const existing = await this.prisma.notificationPreference.findFirst({
      where: {
        userId,
        serverId: dto.serverId ?? null,
        channelId: dto.channelId ?? null,
      },
      select: NOTIFICATION_PREFERENCE_SELECT,
    });

    const now = new Date();
    const mutedUntil =
      dto.muted === true
        ? resolveMutedUntil(dto.muteDuration ?? 'forever', now)
        : dto.muted === false
          ? null
          : (existing?.mutedUntil ?? null);
    const data = {
      muted: dto.muted ?? existing?.muted ?? false,
      mutedUntil,
      mentionOnly: dto.mentionOnly ?? existing?.mentionOnly ?? false,
      desktopEnabled: dto.desktopEnabled ?? existing?.desktopEnabled ?? false,
    };

    const preference = existing
      ? await this.prisma.notificationPreference.update({
          where: { id: existing.id },
          data,
          select: NOTIFICATION_PREFERENCE_SELECT,
        })
      : await this.prisma.notificationPreference.create({
          data: { ...data, userId, serverId: dto.serverId, channelId: dto.channelId },
          select: NOTIFICATION_PREFERENCE_SELECT,
        });

    return { preference: toNotificationPreferenceView(preference) };
  }

  private async requireNotificationScope(userId: string, serverId?: string, channelId?: string) {
    if (serverId) {
      const member = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
        select: { userId: true },
      });
      if (!member) throw new NotFoundException('Server not found');
    }
    if (channelId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true },
      });
      // A channel row named under a different server would never be matched by push resolution.
      const canView =
        channel !== null &&
        (!serverId || channel.serverId === serverId) &&
        (await this.permissions.hasChannelPermission(userId, channelId, Permission.ViewChannel));
      if (!canView) throw new NotFoundException('Channel not found');
    }
  }
}
