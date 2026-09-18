import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { syncBotGatewayOnRemoval } from '@/modules/bots/bot-gateway-sync';
import { LivekitService } from '@/modules/livekit/livekit.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { ServerBanEntry } from '@discord-clone/shared';
import { CallRegistryService } from '@/modules/realtime/call-registry.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { deleteMemberStageRows } from '@/modules/stage/stage-member-cleanup';
import { StageService } from '@/modules/stage/stage.service';
import { CreateBanDto } from './dto/create-ban.dto';
import { TimeoutMemberDto } from './dto/timeout-member.dto';
import { setMemberTimeout } from './member-timeout';

const moderationUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

type RemovalReason = 'KICK' | 'BAN';

@Injectable()
export class ServerModerationService {
  private readonly logger = new Logger(ServerModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
    private readonly stage: StageService,
    private readonly calls: CallRegistryService,
    private readonly livekit: LivekitService,
  ) {}

  async kick(userId: string, serverId: string, memberId: string) {
    const actor = await this.permissions.requireServerPermission(
      userId,
      serverId,
      Permission.KickMembers,
    );
    const target = await this.prisma.serverMember.findFirst({
      where: { id: memberId, serverId },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.kind === 'OWNER') throw new ForbiddenException('Cannot kick the server owner');
    if (target.id === actor.id) throw new ForbiddenException('Cannot kick yourself');

    const removedStageRows = await this.prisma.$transaction(async (tx) => {
      await tx.serverMember.delete({ where: { id: target.id } });
      return deleteMemberStageRows(tx, serverId, target.userId);
    });
    await this.writeAuditLog(serverId, userId, 'MEMBER_KICK', target.id, {
      userId: target.userId,
      username: target.user.username,
      displayName: target.user.displayName,
    });
    await this.announceRemoval(serverId, target.userId, 'KICK');
    this.stage.afterMemberRemoved(target.userId, removedStageRows);

    return { ok: true };
  }

  async timeout(userId: string, serverId: string, memberId: string, dto: TimeoutMemberDto) {
    const actor = await this.permissions.requireServerPermission(
      userId,
      serverId,
      Permission.KickMembers,
    );
    const target = await this.prisma.serverMember.findFirst({ where: { id: memberId, serverId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.kind === 'OWNER') throw new ForbiddenException('Cannot time out the server owner');
    if (target.id === actor.id) throw new ForbiddenException('Cannot time out yourself');

    const timeoutUntil = dto.durationMinutes
      ? new Date(Date.now() + dto.durationMinutes * 60_000)
      : null;
    const member = await setMemberTimeout(
      this.prisma,
      this.realtime,
      serverId,
      target.id,
      timeoutUntil,
    );

    await (timeoutUntil
      ? this.writeAuditLog(serverId, userId, 'MEMBER_TIMEOUT', target.id, {
          userId: target.userId,
          durationMinutes: dto.durationMinutes,
          timeoutUntil,
        })
      : this.writeAuditLog(serverId, userId, 'MEMBER_TIMEOUT_CLEAR', target.id, {
          userId: target.userId,
        }));
    return { member };
  }

  async listBans(userId: string, serverId: string): Promise<{ bans: ServerBanEntry[] }> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.BanMembers);
    const bans = await this.prisma.serverBan.findMany({
      where: { serverId },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        user: { select: moderationUserSelect },
        bannedBy: { select: moderationUserSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { bans };
  }

  async ban(userId: string, serverId: string, dto: CreateBanDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.BanMembers);
    if (dto.userId === userId) throw new ForbiddenException('Cannot ban yourself');

    const [target, server] = await Promise.all([
      // A bot is a member and can be banned, which also stops it being authorized again. A webhook's
      // synthetic user is not a member and cannot be banned; revoke the webhook instead.
      this.prisma.user.findFirst({
        where: { id: dto.userId, kind: { in: ['HUMAN', 'BOT'] } },
        select: moderationUserSelect,
      }),
      this.prisma.server.findUniqueOrThrow({ where: { id: serverId }, select: { ownerId: true } }),
    ]);
    if (!target) throw new NotFoundException('User not found');
    if (server.ownerId === target.id) throw new ForbiddenException('Cannot ban the server owner');

    const reason = dto.reason?.trim() || null;
    const { ban, created, removedStageRows } = await this.prisma.$transaction(async (tx) => {
      await tx.serverMember.deleteMany({ where: { serverId, userId: target.id } });
      const stageRows = await deleteMemberStageRows(tx, serverId, target.id);
      const existing = await tx.serverBan.findUnique({
        where: { serverId_userId: { serverId, userId: target.id } },
        select: { id: true },
      });
      const upserted = await tx.serverBan.upsert({
        where: { serverId_userId: { serverId, userId: target.id } },
        create: { serverId, userId: target.id, bannedById: userId, reason },
        update: { reason },
        select: {
          id: true,
          reason: true,
          createdAt: true,
          user: { select: moderationUserSelect },
          bannedBy: { select: moderationUserSelect },
        },
      });
      return { ban: upserted, created: !existing, removedStageRows: stageRows };
    });

    await this.writeAuditLog(serverId, userId, 'MEMBER_BAN', target.id, {
      userId: target.id,
      username: target.username,
      reason,
    });
    await this.announceRemoval(serverId, target.id, 'BAN');
    this.stage.afterMemberRemoved(target.id, removedStageRows);
    // 201 for a new ban, 200 when the user was already banned (member-bans.md).
    return { ban, created };
  }

  async unban(userId: string, serverId: string, targetUserId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.BanMembers);
    const { count } = await this.prisma.serverBan.deleteMany({
      where: { serverId, userId: targetUserId },
    });
    if (!count) throw new NotFoundException('Ban not found');

    await this.writeAuditLog(serverId, userId, 'MEMBER_UNBAN', targetUserId, {
      userId: targetUserId,
    });
    return { ok: true };
  }

  /*
   * Persist first, emit second: the removed user's client drops the server, other members drop the
   * member, and the user's sockets stop receiving the server's channel events.
   */
  private async announceRemoval(serverId: string, removedUserId: string, reason: RemovalReason) {
    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true },
    });
    const payload = { serverId, userId: removedUserId, reason };
    this.realtime.emitToRooms(
      [this.realtime.serverRoom(serverId), this.realtime.userRoom(removedUserId)],
      'server:member-removed',
      payload,
    );
    this.realtime.removeUsersFromRooms(
      [removedUserId],
      [
        this.realtime.serverRoom(serverId),
        ...channels.map((channel) => this.realtime.channelRoom(channel.id)),
      ],
    );
    // `removeUsersFromRooms` above targets `userRoom(removedUserId)`, which a bot socket never
    // joins — a bot's own gateway socket (if any) is kept in sync separately.
    void syncBotGatewayOnRemoval(this.prisma, this.realtime, removedUserId, serverId);
    await this.endCalls(
      removedUserId,
      channels.map((channel) => channel.id),
    );
  }

  /**
   * A removed member must not keep listening or talking in the server's calls (`member-bans.md`).
   * The registry drop hangs up their client; the LiveKit removal stops media even if it does not.
   */
  private async endCalls(userId: string, channelIds: string[]) {
    await this.calls.removeUser(userId, channelIds);
    if (this.livekit.transport !== 'livekit') return;
    try {
      await this.livekit.removeUserFromRooms(channelIds, userId);
    } catch (error) {
      // The member row is already gone and their next join is refused; log so an operator can act.
      this.logger.error(
        `Could not disconnect removed member ${userId} from LiveKit: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
