import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  RealtimeEvents,
  SOUNDBOARD_PLAY_LIMIT,
  SOUNDBOARD_PLAY_WINDOW_MS,
  type SoundboardPlayedPayload,
} from '@discord-clone/shared';
import {
  parseSoundboardPlay,
  SoundboardPlaybackService,
} from '@/modules/soundboard/soundboard-playback.service';
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
    private readonly soundboard: SoundboardPlaybackService,
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
    await this.rateLimit.assert(client, 'voice:join', 10, 60_000);
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
    const existingParticipants = await this.calls.join(body.channelId, participant);

    const room = this.calls.callRoom(body.channelId);
    await client.join(room);
    client.to(room).emit('voice:user-joined', { channelId: body.channelId, participant });
    await this.calls.emitActiveCall(body.channelId);

    const dmConversationId = parseDmCallKey(body.channelId);
    if (dmConversationId) await this.dmCalls.participantJoined(dmConversationId, user.id);
    return { participants: existingParticipants };
  }

  @SubscribeMessage('dm:call:ring')
  async ringDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; mode: DmCallMode },
  ) {
    await this.rateLimit.assert(client, 'dm:call:ring', 10, 60_000);
    const user = getSocketUser(client);
    if (body.mode !== 'voice' && body.mode !== 'video') {
      throw new UnauthorizedException('Invalid call mode');
    }
    return this.dmCalls.ring(user.id, body.conversationId, body.mode);
  }

  @SubscribeMessage('dm:call:decline')
  async declineDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    await this.rateLimit.assert(client, 'dm:call:decline', 20, 60_000);
    return this.dmCalls.decline(getSocketUser(client).id, body.conversationId);
  }

  @SubscribeMessage('dm:call:cancel')
  async cancelDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    await this.rateLimit.assert(client, 'dm:call:cancel', 20, 60_000);
    return this.dmCalls.cancel(getSocketUser(client).id, body.conversationId);
  }

  @SubscribeMessage('voice:state')
  async updateVoiceState(
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
    await this.rateLimit.assert(client, 'voice:state', 30, 60_000);
    const nextParticipant = await this.calls.updateState(body.channelId, client.id, {
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
    await this.calls.emitActiveCall(body.channelId);
    return { ok: true };
  }

  @SubscribeMessage('voice:leave')
  async leaveVoice(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    await this.calls.leave(client, body.channelId);
    return { ok: true };
  }

  /**
   * Plays a server soundboard clip for everyone in the caller's call. There is no SFU, so nothing is
   * mixed into the media: each client plays the broadcast url locally. Refusals are acknowledged with
   * `{ error }` so the client can show them, like `message:create`.
   */
  @SubscribeMessage('soundboard:play')
  async playSoundboardClip(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    try {
      await this.rateLimit.assert(
        client,
        RealtimeEvents.SoundboardPlay,
        SOUNDBOARD_PLAY_LIMIT,
        SOUNDBOARD_PLAY_WINDOW_MS,
      );
      const user = getSocketUser(client);
      const command = parseSoundboardPlay(body);
      if (parseDmCallKey(command.channelId)) {
        throw new ForbiddenException('Soundboard is only available in server voice calls');
      }
      const participant = await this.calls.requireParticipant(client, command.channelId);
      const clip = await this.soundboard.authorizePlay(user.id, command);
      const payload: SoundboardPlayedPayload = {
        ...clip,
        triggeredBy: { id: user.id, displayName: participant.displayName },
      };
      this.publisher.emitToRoom(
        this.calls.callRoom(command.channelId),
        RealtimeEvents.SoundboardPlayed,
        payload,
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpException) return { error: error.message };
      throw error;
    }
  }

  @SubscribeMessage('webrtc:offer')
  async relayOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; targetSocketId: string; offer: unknown },
  ) {
    await this.rateLimit.assert(client, 'webrtc:offer', 30, 60_000);
    await this.calls.assertPeer(client, body.channelId, body.targetSocketId);
    this.publisher.emitToRoom(body.targetSocketId, 'webrtc:offer', {
      channelId: body.channelId,
      fromSocketId: client.id,
      offer: body.offer,
    });
  }

  @SubscribeMessage('webrtc:answer')
  async relayAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; targetSocketId: string; answer: unknown },
  ) {
    await this.rateLimit.assert(client, 'webrtc:answer', 30, 60_000);
    await this.calls.assertPeer(client, body.channelId, body.targetSocketId);
    this.publisher.emitToRoom(body.targetSocketId, 'webrtc:answer', {
      channelId: body.channelId,
      fromSocketId: client.id,
      answer: body.answer,
    });
  }

  @SubscribeMessage('webrtc:ice-candidate')
  async relayIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; targetSocketId: string; candidate: unknown },
  ) {
    await this.rateLimit.assert(client, 'webrtc:ice-candidate', 120, 60_000);
    await this.calls.assertPeer(client, body.channelId, body.targetSocketId);
    this.publisher.emitToRoom(body.targetSocketId, 'webrtc:ice-candidate', {
      channelId: body.channelId,
      fromSocketId: client.id,
      candidate: body.candidate,
    });
  }
}
