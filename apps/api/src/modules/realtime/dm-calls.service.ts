import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { findBlockBetween } from '../friends/user-blocks';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DmCallMode, DmCallRing, DmCallRings } from './dm-call-rings';
import { RealtimePublisher } from './realtime-publisher.service';

const DM_CALL_KEY_PREFIX = 'dm:';

export function toDmCallKey(conversationId: string) {
  return `${DM_CALL_KEY_PREFIX}${conversationId}`;
}

/** The conversation id of a DM call key, or null for a channel call id. */
export function parseDmCallKey(callKey: string) {
  return callKey.startsWith(DM_CALL_KEY_PREFIX) ? callKey.slice(DM_CALL_KEY_PREFIX.length) : null;
}

type RingStopReason = 'answered' | 'declined' | 'cancelled' | 'missed';

@Injectable()
export class DmCallsService {
  private readonly logger = new Logger(DmCallsService.name);
  private readonly rings = new DmCallRings((ring) => this.handleExpired(ring));

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
  ) {}

  /** Membership, plus no block in either direction for 1-1 conversations. */
  async authorizeCall(userId: string, conversationId: string) {
    const conversation = await this.prisma.directConversation.findFirst({
      where: { id: conversationId, members: { some: { userId } } },
      select: { isGroup: true, members: { select: { userId: true } } },
    });
    if (!conversation) throw new UnauthorizedException('Not a conversation member');

    const memberUserIds = conversation.members.map((member) => member.userId);
    const otherUserIds = memberUserIds.filter((memberId) => memberId !== userId);
    if (
      !conversation.isGroup &&
      otherUserIds.length === 1 &&
      (await findBlockBetween(this.prisma, userId, otherUserIds[0]))
    ) {
      throw new UnauthorizedException('You cannot call this user');
    }
    return { isGroup: conversation.isGroup, memberUserIds };
  }

  async ring(userId: string, conversationId: string, mode: DmCallMode) {
    const { isGroup, memberUserIds } = await this.authorizeCall(userId, conversationId);
    const caller = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, displayName: true, avatarUrl: true },
    });

    this.rings.start({ conversationId, callerUserId: userId, mode, isGroup, memberUserIds });
    this.realtime.emitToRooms(
      memberUserIds
        .filter((memberId) => memberId !== userId)
        .map((memberId) => this.realtime.userRoom(memberId)),
      'dm:call:incoming',
      { conversationId, mode, caller },
    );
    return { ok: true };
  }

  decline(userId: string, conversationId: string) {
    const ring = this.rings.get(conversationId);
    if (!ring || ring.callerUserId === userId || !ring.memberUserIds.includes(userId)) {
      return { ok: false };
    }

    this.realtime.emitToRoom(this.realtime.userRoom(ring.callerUserId), 'dm:call:declined', {
      conversationId,
      userId,
    });
    if (ring.isGroup) {
      // Others may still answer a group call; only the decliner's devices stop ringing.
      this.realtime.emitToRoom(this.realtime.userRoom(userId), 'dm:call:ring-stopped', {
        conversationId,
        reason: 'declined',
        userId,
      });
      return { ok: true };
    }

    this.rings.clear(conversationId);
    this.emitRingStopped(ring, 'declined', userId);
    return { ok: true };
  }

  async cancel(userId: string, conversationId: string) {
    const ring = this.rings.get(conversationId);
    if (!ring || ring.callerUserId !== userId) return { ok: false };

    this.rings.clear(conversationId);
    this.emitRingStopped(ring, 'cancelled');
    await this.notifyMissedCall(ring);
    return { ok: true };
  }

  /** Called after a member joins the DM call: answering stops ringing on every device. */
  participantJoined(conversationId: string, userId: string) {
    const ring = this.rings.get(conversationId);
    if (!ring || ring.callerUserId === userId) return;
    this.rings.clear(conversationId);
    this.emitRingStopped(ring, 'answered', userId);
  }

  private handleExpired(ring: DmCallRing) {
    this.emitRingStopped(ring, 'missed');
    this.notifyMissedCall(ring).catch((error: unknown) => {
      this.logger.error(
        'Cannot create missed call notifications',
        error instanceof Error ? error.stack : error,
      );
    });
  }

  private emitRingStopped(ring: DmCallRing, reason: RingStopReason, userId?: string) {
    this.realtime.emitToRooms(
      ring.memberUserIds.map((memberId) => this.realtime.userRoom(memberId)),
      'dm:call:ring-stopped',
      { conversationId: ring.conversationId, reason, ...(userId ? { userId } : {}) },
    );
  }

  private async notifyMissedCall(ring: DmCallRing) {
    const caller = await this.prisma.user.findUnique({
      where: { id: ring.callerUserId },
      select: { displayName: true },
    });
    await Promise.all(
      ring.memberUserIds
        .filter((memberId) => memberId !== ring.callerUserId)
        .map((memberId) =>
          this.notifications.create({
            userId: memberId,
            actorId: ring.callerUserId,
            type: 'DM_MISSED_CALL',
            title: `Missed ${ring.mode} call from ${caller?.displayName ?? 'someone'}`,
            conversationId: ring.conversationId,
          }),
        ),
    );
  }
}
