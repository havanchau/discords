import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';
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

/**
 * Who is in which call. This is process-local state: it belongs to the sockets this instance holds
 * and is rebuilt from scratch on restart, which is also why the API runs as a single instance.
 */
@Injectable()
export class CallRegistryService {
  private readonly callParticipants = new Map<string, Map<string, CallParticipant>>();
  private readonly socketCalls = new Map<string, Set<string>>();

  constructor(private readonly publisher: RealtimePublisher) {}

  callRoom(channelId: string) {
    return `call:${channelId}`;
  }

  /** Adds the participant and returns everyone who was already in the call. */
  join(channelId: string, participant: CallParticipant) {
    const participants = this.getParticipants(channelId);
    const existingParticipants = [...participants.values()].filter(
      (item) => item.socketId !== participant.socketId,
    );

    participants.set(participant.socketId, participant);
    const calls = this.socketCalls.get(participant.socketId) ?? new Set<string>();
    calls.add(channelId);
    this.socketCalls.set(participant.socketId, calls);

    return existingParticipants;
  }

  updateState(
    channelId: string,
    socketId: string,
    patch: Partial<Pick<CallParticipant, 'mode' | 'isMuted' | 'isCameraOff' | 'isSharingScreen'>>,
  ) {
    const participant = this.callParticipants.get(channelId)?.get(socketId);
    if (!participant) return null;

    const nextParticipant: CallParticipant = {
      ...participant,
      mode: patch.mode ?? participant.mode,
      isMuted: patch.isMuted ?? participant.isMuted,
      isCameraOff: patch.isCameraOff ?? participant.isCameraOff,
      isSharingScreen: patch.isSharingScreen ?? participant.isSharingScreen,
    };
    this.callParticipants.get(channelId)?.set(socketId, nextParticipant);
    return nextParticipant;
  }

  leave(client: Socket, channelId: string) {
    const participants = this.callParticipants.get(channelId);
    const participant = participants?.get(client.id);
    if (!participants || !participant) return;

    participants.delete(client.id);
    if (participants.size === 0) {
      this.callParticipants.delete(channelId);
    }

    const calls = this.socketCalls.get(client.id);
    calls?.delete(channelId);
    if (calls && calls.size === 0) {
      this.socketCalls.delete(client.id);
    }

    client.leave(this.callRoom(channelId));
    client.to(this.callRoom(channelId)).emit('voice:user-left', {
      channelId,
      socketId: client.id,
      userId: participant.userId,
    });
    this.emitActiveCall(channelId);
  }

  leaveAll(client: Socket) {
    const channelIds = [...(this.socketCalls.get(client.id) ?? [])];
    channelIds.forEach((channelId) => this.leave(client, channelId));
  }

  assertPeer(client: Socket, channelId: string, targetSocketId: string) {
    const participants = this.callParticipants.get(channelId);
    if (!participants?.has(client.id) || !participants.has(targetSocketId)) {
      throw new UnauthorizedException('Target is not in the call');
    }
  }

  getActiveCallSummary(channelId: string): ActiveCallSummary | null {
    const participants = [...(this.callParticipants.get(channelId)?.values() ?? [])];
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
  emitActiveCall(channelId: string) {
    const dmConversationId = parseDmCallKey(channelId);
    const room = dmConversationId
      ? this.publisher.conversationRoom(dmConversationId)
      : this.publisher.channelRoom(channelId);
    const activeCall = this.getActiveCallSummary(channelId);

    if (activeCall) {
      this.publisher.emitToRoom(room, 'voice:active', activeCall);
      return;
    }
    this.publisher.emitToRoom(room, 'voice:ended', { channelId });
  }

  private getParticipants(channelId: string) {
    const participants = this.callParticipants.get(channelId) ?? new Map<string, CallParticipant>();
    this.callParticipants.set(channelId, participants);
    return participants;
  }
}
