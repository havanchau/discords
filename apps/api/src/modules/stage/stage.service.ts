import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  RealtimeEvents,
  type StageMember,
  type StageRole,
  type StageRoleChangedPayload,
  type StageRosterView,
  type StageSpeakRequestUpdatedPayload,
} from '@discord-clone/shared';
import { LivekitService } from '@/modules/livekit/livekit.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RemovedStageRows } from './stage-member-cleanup';

const stageUserSelect = { id: true, username: true, displayName: true, avatarUrl: true } as const;

/**
 * A STAGE channel's speaker roster and speak-request queue (`stage-channels.md`). Call membership
 * stays with `CallRegistryService`; this only decides who may publish, and tells LiveKit.
 */
@Injectable()
export class StageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly publisher: RealtimePublisher,
    private readonly livekit: LivekitService,
  ) {}

  async getRoster(userId: string, channelId: string): Promise<StageRosterView> {
    const channel = await this.requireStageChannel(userId, channelId);
    const [speakers, requests, canModerate] = await Promise.all([
      this.prisma.stageSpeaker.findMany({
        where: { channelId },
        select: { addedAt: true, user: { select: stageUserSelect } },
        orderBy: { addedAt: 'asc' },
      }),
      this.prisma.stageSpeakRequest.findMany({
        where: { channelId },
        select: { requestedAt: true, user: { select: stageUserSelect } },
        orderBy: { requestedAt: 'asc' },
      }),
      this.permissions.hasServerPermission(userId, channel.serverId, Permission.MuteMembers),
    ]);
    return {
      speakers: speakers.map((row) => toStageMember(row.user, row.addedAt)),
      requests: requests.map((row) => toStageMember(row.user, row.requestedAt)),
      canModerate,
    };
  }

  async requestToSpeak(userId: string, channelId: string) {
    await this.requireStageChannel(userId, channelId);
    if (await this.isSpeaker(channelId, userId)) {
      throw new BadRequestException('Already a stage speaker');
    }
    await this.prisma.stageSpeakRequest.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId },
      update: {},
    });
    this.emitRequestUpdated(channelId, userId, true);
    return { ok: true };
  }

  async withdrawRequest(userId: string, channelId: string) {
    await this.requireStageChannel(userId, channelId);
    const { count } = await this.prisma.stageSpeakRequest.deleteMany({
      where: { channelId, userId },
    });
    if (count) this.emitRequestUpdated(channelId, userId, false);
    return { ok: true };
  }

  async addSpeaker(actorId: string, channelId: string, targetUserId: string) {
    const channel = await this.requireStageChannel(actorId, channelId);
    await this.permissions.requireServerPermission(
      actorId,
      channel.serverId,
      Permission.MuteMembers,
    );
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId: channel.serverId } },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    const canSpeak = await this.permissions.hasChannelPermission(
      targetUserId,
      channelId,
      Permission.SpeakVoice,
    );
    if (!canSpeak) throw new BadRequestException('Member cannot speak in this channel');

    const hadRequest = await this.prisma.$transaction(async (tx) => {
      await tx.stageSpeaker.upsert({
        where: { channelId_userId: { channelId, userId: targetUserId } },
        create: { channelId, userId: targetUserId },
        update: {},
      });
      const { count } = await tx.stageSpeakRequest.deleteMany({
        where: { channelId, userId: targetUserId },
      });
      return count > 0;
    });
    // The grant is live before anyone is told about it.
    await this.livekit.setUserPublish(channelId, targetUserId, true);
    await this.writeAuditLog(channel.serverId, actorId, 'STAGE_SPEAKER_ADD', targetUserId, {
      channelId,
      userId: targetUserId,
    });
    this.emitRoleChanged(channelId, targetUserId, 'speaker');
    if (hadRequest) this.emitRequestUpdated(channelId, targetUserId, false);
    return { ok: true };
  }

  /** A moderator removes anyone; a speaker may always step down on their own. */
  async removeSpeaker(actorId: string, channelId: string, targetUserId: string) {
    const channel = await this.requireStageChannel(actorId, channelId);
    if (actorId !== targetUserId) {
      await this.permissions.requireServerPermission(
        actorId,
        channel.serverId,
        Permission.MuteMembers,
      );
    }
    if (!(await this.isSpeaker(channelId, targetUserId))) return { ok: true };

    // Revoke first: a failed revoke must not leave someone listed as audience but still publishing.
    await this.livekit.setUserPublish(channelId, targetUserId, false);
    await this.prisma.stageSpeaker.deleteMany({ where: { channelId, userId: targetUserId } });
    await this.writeAuditLog(channel.serverId, actorId, 'STAGE_SPEAKER_REMOVE', targetUserId, {
      channelId,
      userId: targetUserId,
    });
    this.emitRoleChanged(channelId, targetUserId, 'audience');
    return { ok: true };
  }

  /**
   * The joiner's stage role, or null when the call is not a STAGE channel. The server owner always
   * joins as a speaker and is added to the roster so every client lists them as one.
   */
  async resolveJoinRole(userId: string, callId: string): Promise<StageRole | null> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: callId },
      select: { type: true, server: { select: { ownerId: true } } },
    });
    if (channel?.type !== 'STAGE') return null;

    if (channel.server.ownerId === userId) {
      const existing = await this.isSpeaker(callId, userId);
      if (!existing) {
        await this.prisma.$transaction([
          this.prisma.stageSpeaker.create({ data: { channelId: callId, userId } }),
          this.prisma.stageSpeakRequest.deleteMany({ where: { channelId: callId, userId } }),
        ]);
        this.emitRoleChanged(callId, userId, 'speaker');
      }
      return 'speaker';
    }
    return (await this.isSpeaker(callId, userId)) ? 'speaker' : 'audience';
  }

  /**
   * After a kick or ban committed: tell open clients the removed member's rows are gone. Ending their
   * call connections (stage rooms included) is the moderation service's job.
   */
  afterMemberRemoved(userId: string, removed: RemovedStageRows) {
    for (const channelId of removed.speakerChannelIds) {
      this.emitRoleChanged(channelId, userId, 'audience');
    }
    for (const channelId of removed.requestChannelIds) {
      this.emitRequestUpdated(channelId, userId, false);
    }
  }

  private async requireStageChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, type: true, serverId: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ViewChannel);
    if (channel.type !== 'STAGE') throw new BadRequestException('Channel is not a stage channel');
    return channel;
  }

  private async isSpeaker(channelId: string, userId: string) {
    const row = await this.prisma.stageSpeaker.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { userId: true },
    });
    return Boolean(row);
  }

  private emitRoleChanged(channelId: string, userId: string, role: StageRole) {
    const payload: StageRoleChangedPayload = { channelId, userId, role };
    this.publisher.emitToRooms(
      this.rosterRooms(channelId),
      RealtimeEvents.StageRoleChanged,
      payload,
    );
  }

  private emitRequestUpdated(channelId: string, userId: string, requested: boolean) {
    const payload: StageSpeakRequestUpdatedPayload = { channelId, userId, requested };
    this.publisher.emitToRooms(
      this.rosterRooms(channelId),
      RealtimeEvents.StageSpeakRequestUpdated,
      payload,
    );
  }

  /**
   * The call's participants and whoever has the stage channel open (the channel room is joined only
   * after the view check), so a member about to join sees the current speakers.
   */
  private rosterRooms(channelId: string) {
    return [this.publisher.callRoom(channelId), this.publisher.channelRoom(channelId)];
  }

  private async writeAuditLog(
    serverId: string,
    actorId: string,
    action: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { serverId, actorId, action, targetId, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}

function toStageMember(
  user: { id: string; username: string; displayName: string; avatarUrl: string | null },
  since: Date,
): StageMember {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    since: since.toISOString(),
  };
}
