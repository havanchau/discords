import { UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CallParticipant, CallRegistryService } from './call-registry.service';
import { DmCallMode } from './dm-call-rings';
import { DmCallsService, parseDmCallKey } from './dm-calls.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimePublisher } from './realtime-publisher.service';
import { SocketRateLimitService } from './socket-rate-limit.service';
import { getSocketUser } from './socket-user';

/** Voice and video: call membership, DM ringing, and WebRTC signaling relay. */
@WebSocketGateway()
export class VoiceGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly access: RealtimeAccessService,
    private readonly calls: CallRegistryService,
    private readonly dmCalls: DmCallsService,
    private readonly publisher: RealtimePublisher,
    private readonly rateLimit: SocketRateLimitService,
  ) {}

  @SubscribeMessage('voice:join')
  async joinVoice(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      channelId: string;
      mode: 'voice' | 'video' | 'screen';
      isMuted?: boolean;
      isCameraOff?: boolean;
      isSharingScreen?: boolean;
    },
  ) {
    this.rateLimit.assert(client, 'voice:join', 10, 60_000);
    const user = getSocketUser(client);
    const profile = await this.access.authorizeCallJoin(user.id, body.channelId);

    const participant: CallParticipant = {
      socketId: client.id,
      userId: user.id,
      username: profile.username,
      displayName: profile.displayName,
      mode: body.mode,
      isMuted: Boolean(body.isMuted),
      isCameraOff: Boolean(body.isCameraOff),
      isSharingScreen: Boolean(body.isSharingScreen),
    };
    const existingParticipants = this.calls.join(body.channelId, participant);

    const room = this.calls.callRoom(body.channelId);
    await client.join(room);
    client.to(room).emit('voice:user-joined', { channelId: body.channelId, participant });
    this.calls.emitActiveCall(body.channelId);

    const dmConversationId = parseDmCallKey(body.channelId);
    if (dmConversationId) this.dmCalls.participantJoined(dmConversationId, user.id);
    return { participants: existingParticipants };
  }

  @SubscribeMessage('dm:call:ring')
  async ringDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; mode: DmCallMode },
  ) {
    this.rateLimit.assert(client, 'dm:call:ring', 10, 60_000);
    const user = getSocketUser(client);
    if (body.mode !== 'voice' && body.mode !== 'video') {
      throw new UnauthorizedException('Invalid call mode');
    }
    return this.dmCalls.ring(user.id, body.conversationId, body.mode);
  }

  @SubscribeMessage('dm:call:decline')
  declineDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    this.rateLimit.assert(client, 'dm:call:decline', 20, 60_000);
    return this.dmCalls.decline(getSocketUser(client).id, body.conversationId);
  }

  @SubscribeMessage('dm:call:cancel')
  cancelDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    this.rateLimit.assert(client, 'dm:call:cancel', 20, 60_000);
    return this.dmCalls.cancel(getSocketUser(client).id, body.conversationId);
  }

  @SubscribeMessage('voice:state')
  updateVoiceState(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      channelId: string;
      isMuted?: boolean;
      isCameraOff?: boolean;
      isSharingScreen?: boolean;
      mode?: 'voice' | 'video' | 'screen';
    },
  ) {
    this.rateLimit.assert(client, 'voice:state', 30, 60_000);
    const nextParticipant = this.calls.updateState(body.channelId, client.id, {
      mode: body.mode,
      isMuted: body.isMuted,
      isCameraOff: body.isCameraOff,
      isSharingScreen: body.isSharingScreen,
    });
    if (!nextParticipant) return { ok: false };

    this.publisher.emitToRoom(this.calls.callRoom(body.channelId), 'voice:user-updated', {
      channelId: body.channelId,
      participant: nextParticipant,
    });
    this.calls.emitActiveCall(body.channelId);
    return { ok: true };
  }

  @SubscribeMessage('voice:leave')
  leaveVoice(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    this.calls.leave(client, body.channelId);
    return { ok: true };
  }

  @SubscribeMessage('webrtc:offer')
  relayOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; targetSocketId: string; offer: unknown },
  ) {
    this.rateLimit.assert(client, 'webrtc:offer', 30, 60_000);
    this.calls.assertPeer(client, body.channelId, body.targetSocketId);
    this.publisher.emitToRoom(body.targetSocketId, 'webrtc:offer', {
      channelId: body.channelId,
      fromSocketId: client.id,
      offer: body.offer,
    });
  }

  @SubscribeMessage('webrtc:answer')
  relayAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; targetSocketId: string; answer: unknown },
  ) {
    this.rateLimit.assert(client, 'webrtc:answer', 30, 60_000);
    this.calls.assertPeer(client, body.channelId, body.targetSocketId);
    this.publisher.emitToRoom(body.targetSocketId, 'webrtc:answer', {
      channelId: body.channelId,
      fromSocketId: client.id,
      answer: body.answer,
    });
  }

  @SubscribeMessage('webrtc:ice-candidate')
  relayIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; targetSocketId: string; candidate: unknown },
  ) {
    this.rateLimit.assert(client, 'webrtc:ice-candidate', 120, 60_000);
    this.calls.assertPeer(client, body.channelId, body.targetSocketId);
    this.publisher.emitToRoom(body.targetSocketId, 'webrtc:ice-candidate', {
      channelId: body.channelId,
      fromSocketId: client.id,
      candidate: body.candidate,
    });
  }
}
