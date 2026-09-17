import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';
import { RedisService } from '@/modules/redis/redis.service';
import { parseDmCallKey } from './dm-calls.service';
import { RealtimePublisher } from './realtime-publisher.service';

export interface CallParticipant {
  socketId: string;
  userId: string;
  username: string;
  displayName: string;
  mode: 'voice' | 'video' | 'screen';
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
}

export interface ActiveCallSummary {
  channelId: string;
  mode: 'voice' | 'video' | 'screen';
  participants: CallParticipant[];
  screenSharer?: CallParticipant;
}

/** Stored shape: the participant plus the heartbeat that proves their instance is still alive. */
interface StoredParticipant extends CallParticipant {
  lastSeen: number;
}

/**
 * Who is in which call, shared across instances through Redis. It has to be shared because
 * `assertPeer` authorizes WebRTC signalling between two sockets that may be connected to two
 * different instances, and because the participant list a client renders must be the same one
 * every instance sees.
 *
 * Entries carry a heartbeat and are pruned once it goes stale, so a killed instance cannot leave a
 * ghost participant in a call forever.
 */
@Injectable()
export class CallRegistryService {
  constructor(
    private readonly redis: RedisService,
    private readonly publisher: RealtimePublisher,
  ) {}

  callRoom(channelId: string) {
    return `call:${channelId}`;
  }

  /** Adds the participant and returns everyone who was already in the call. */
  async join(channelId: string, participant: CallParticipant) {
    const existingParticipants = (await this.listParticipants(channelId)).filter(
      (item) => item.socketId !== participant.socketId,
    );

    const stored: StoredParticipant = { ...participant, lastSeen: Date.now() };
    await this.redis.client
      .multi()
      .hset(this.participantsKey(channelId), participant.socketId, JSON.stringify(stored))
      .pexpire(this.participantsKey(channelId), this.entryTtlMs())
      .sadd(this.socketCallsKey(participant.socketId), channelId)
      .pexpire(this.socketCallsKey(participant.socketId), this.entryTtlMs())
      .exec();

    return existingParticipants;
  }

  async updateState(
    channelId: string,
    socketId: string,
    patch: Partial<Pick<CallParticipant, 'mode' | 'isMuted' | 'isCameraOff' | 'isSharingScreen'>>,
  ) {
    const raw = await this.redis.client.hget(this.participantsKey(channelId), socketId);
    const participant = this.parse(raw);
    if (!participant) return null;

    const nextParticipant: StoredParticipant = {
      ...participant,
      mode: patch.mode ?? participant.mode,
      isMuted: patch.isMuted ?? participant.isMuted,
      isCameraOff: patch.isCameraOff ?? participant.isCameraOff,
      isSharingScreen: patch.isSharingScreen ?? participant.isSharingScreen,
      lastSeen: Date.now(),
    };
    await this.redis.client.hset(
      this.participantsKey(channelId),
      socketId,
      JSON.stringify(nextParticipant),
    );
    return this.withoutHeartbeat(nextParticipant);
  }

  async leave(client: Socket, channelId: string) {
    const raw = await this.redis.client.hget(this.participantsKey(channelId), client.id);
    const participant = this.parse(raw);
    if (!participant) return;

    await this.redis.client
      .multi()
      .hdel(this.participantsKey(channelId), client.id)
      .srem(this.socketCallsKey(client.id), channelId)
      .exec();

    await client.leave(this.callRoom(channelId));
    client.to(this.callRoom(channelId)).emit('voice:user-left', {
      channelId,
      socketId: client.id,
      userId: participant.userId,
    });
    await this.emitActiveCall(channelId);
  }

  async leaveAll(client: Socket) {
    const channelIds = await this.redis.client.smembers(this.socketCallsKey(client.id));
    for (const channelId of channelIds) {
      await this.leave(client, channelId);
    }
    await this.redis.client.del(this.socketCallsKey(client.id));
  }

  /** The socket's own participant entry, pruned of stale heartbeats like every other read. */
  async requireParticipant(client: Socket, channelId: string) {
    const participant = (await this.listParticipants(channelId)).find(
      (item) => item.socketId === client.id,
    );
    if (!participant) {
      throw new UnauthorizedException('Not in this call');
    }
    return participant;
  }

  async assertPeer(client: Socket, channelId: string, targetSocketId: string) {
    const socketIds = new Set(
      (await this.listParticipants(channelId)).map((participant) => participant.socketId),
    );
    if (!socketIds.has(client.id) || !socketIds.has(targetSocketId)) {
      throw new UnauthorizedException('Target is not in the call');
    }
  }

  async getActiveCallSummary(channelId: string): Promise<ActiveCallSummary | null> {
    const participants = await this.listParticipants(channelId);
    if (!participants.length) return null;

    const screenSharer = participants.find(
      (participant) => participant.isSharingScreen || participant.mode === 'screen',
    );
    const mode = screenSharer
      ? 'screen'
      : participants.some((participant) => participant.mode === 'video')
        ? 'video'
        : 'voice';
    return { channelId, mode, participants, screenSharer };
  }

  // Channel calls announce to the channel room; DM calls to the conversation room.
  async emitActiveCall(channelId: string) {
    const dmConversationId = parseDmCallKey(channelId);
    const room = dmConversationId
      ? this.publisher.conversationRoom(dmConversationId)
      : this.publisher.channelRoom(channelId);
    const activeCall = await this.getActiveCallSummary(channelId);

    if (activeCall) {
      this.publisher.emitToRoom(room, 'voice:active', activeCall);
      return;
    }
    this.publisher.emitToRoom(room, 'voice:ended', { channelId });
  }

  /** Keeps this instance's own participants from being pruned as if their instance had crashed. */
  async heartbeat(socketIds: string[]) {
    if (!socketIds.length) return;

    const now = Date.now();
    for (const socketId of socketIds) {
      const channelIds = await this.redis.client.smembers(this.socketCallsKey(socketId));
      if (!channelIds.length) continue;

      const pipeline = this.redis.client.pipeline();
      for (const channelId of channelIds) {
        const participant = this.parse(
          await this.redis.client.hget(this.participantsKey(channelId), socketId),
        );
        if (!participant) continue;
        pipeline.hset(
          this.participantsKey(channelId),
          socketId,
          JSON.stringify({ ...participant, lastSeen: now }),
        );
        pipeline.pexpire(this.participantsKey(channelId), this.entryTtlMs());
      }
      pipeline.pexpire(this.socketCallsKey(socketId), this.entryTtlMs());
      await pipeline.exec();
    }
  }

  /** Reads the call, dropping — and cleaning up — participants whose heartbeat went stale. */
  private async listParticipants(channelId: string): Promise<CallParticipant[]> {
    const entries = await this.redis.client.hgetall(this.participantsKey(channelId));
    const staleBefore = Date.now() - this.redis.config.heartbeatTtlMs;

    const live: CallParticipant[] = [];
    const staleSocketIds: string[] = [];
    for (const [socketId, raw] of Object.entries(entries)) {
      const participant = this.parse(raw);
      if (!participant || participant.lastSeen < staleBefore) {
        staleSocketIds.push(socketId);
        continue;
      }
      live.push(this.withoutHeartbeat(participant));
    }

    if (staleSocketIds.length) {
      await this.redis.client.hdel(this.participantsKey(channelId), ...staleSocketIds);
    }
    return live;
  }

  private parse(raw: string | null): StoredParticipant | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredParticipant;
    } catch {
      // A value this process cannot parse is treated as absent; the stale sweep removes it.
      return null;
    }
  }

  private withoutHeartbeat({ lastSeen: _lastSeen, ...participant }: StoredParticipant) {
    return participant;
  }

  private entryTtlMs() {
    return this.redis.config.heartbeatTtlMs * 2;
  }

  private participantsKey(channelId: string) {
    return this.redis.key('call', channelId, 'participants');
  }

  private socketCallsKey(socketId: string) {
    return this.redis.key('socket', socketId, 'calls');
  }
}
