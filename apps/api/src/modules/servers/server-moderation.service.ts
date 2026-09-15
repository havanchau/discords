import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { CreateBanDto } from './dto/create-ban.dto';
import { TimeoutMemberDto } from './dto/timeout-member.dto';

const moderationUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

type RemovalReason = 'KICK' | 'BAN';

@Injectable()
export class ServerModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
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

    await this.prisma.serverMember.delete({ where: { id: target.id } });
    await this.writeAuditLog(serverId, userId, 'MEMBER_KICK', target.id, {
      userId: target.userId,
      username: target.user.username,
      displayName: target.user.displayName,
    });
    await this.announceRemoval(serverId, target.userId, 'KICK');

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
    const member = await this.prisma.serverMember.update({
      where: { id: target.id },
      data: { timeoutUntil },
      select: { id: true, userId: true, timeoutUntil: true },
    });

    await (timeoutUntil
      ? this.writeAuditLog(serverId, userId, 'MEMBER_TIMEOUT', target.id, {
          userId: target.userId,
          durationMinutes: dto.durationMinutes,
          timeoutUntil,
        })
      : this.writeAuditLog(serverId, userId, 'MEMBER_TIMEOUT_CLEAR', target.id, {
          userId: target.userId,
        }));
    this.realtime.emitToRoom(this.realtime.serverRoom(serverId), 'server:member-updated', {
      serverId,
      memberId: member.id,
      userId: member.userId,
      timeoutUntil: member.timeoutUntil,
    });
    return { member };
  }

  async listBans(userId: string, serverId: string) {
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
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: moderationUserSelect }),
      this.prisma.server.findUniqueOrThrow({ where: { id: serverId }, select: { ownerId: true } }),
    ]);
    if (!target) throw new NotFoundException('User not found');
    if (server.ownerId === target.id) throw new ForbiddenException('Cannot ban the server owner');

    const reason = dto.reason?.trim() || null;
    const ban = await this.prisma.$transaction(async (tx) => {
      await tx.serverMember.deleteMany({ where: { serverId, userId: target.id } });
      return tx.serverBan.upsert({
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
    });

    await this.writeAuditLog(serverId, userId, 'MEMBER_BAN', target.id, {
      userId: target.id,
      username: target.username,
      reason,
    });
    await this.announceRemoval(serverId, target.id, 'BAN');
    return { ban };
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
