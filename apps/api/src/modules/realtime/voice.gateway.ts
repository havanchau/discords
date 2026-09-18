import {
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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
  type VoiceJoinTransportInfo,
} from '@discord-clone/shared';
import { LivekitService } from '@/modules/livekit/livekit.service';
import {
  parseSoundboardPlay,
  SoundboardPlaybackService,
} from '@/modules/soundboard/soundboard-playback.service';
import { StageService } from '@/modules/stage/stage.service';
import { CallParticipant, CallRegistryService } from './call-registry.service';
import { DmCallMode } from './dm-call-rings';
import { DmCallsService, parseDmCallKey } from './dm-calls.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimePublisher } from './realtime-publisher.service';
import { SocketErrorTranslator } from './socket-error-translator.service';
import { SocketRateLimitService } from './socket-rate-limit.service';
import { requireHumanSocketUser } from './socket-user';

/**
 * Voice and video: call membership, DM ringing, and — per `VOICE_TRANSPORT` — either LiveKit join
 * tokens or the mesh's WebRTC signaling relay.
 */
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
    private readonly socketErrors: SocketErrorTranslator,
    private readonly livekit: LivekitService,
    private readonly stage: StageService,
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
    const user = requireHumanSocketUser(client);
    try {
      const profile = await this.access.authorizeCallJoin(user.id, body.channelId);
      const stageRole = await this.stage.resolveJoinRole(user.id, body.channelId);
      if (stageRole && this.livekit.transport !== 'livekit') {
        // The mesh has no way to keep an audience from publishing (`stage-channels.md`).
        throw new ServiceUnavailableException('Stage channels need the LiveKit voice transport');
      }
      // Minted before the join is recorded, so a LiveKit outage leaves no participant behind.
      const transport: VoiceJoinTransportInfo =
        this.livekit.transport === 'livekit'
          ? {
              transport: 'livekit',
              livekit: await this.livekit.mintJoinAccess({
                roomName: body.channelId,
                userId: user.id,
                socketId: client.id,
                displayName: profile.displayName,
                canPublish: stageRole !== 'audience',
              }),
            }
          : { transport: 'mesh' };
      if (stageRole) transport.stageRole = stageRole;

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
      return { participants: existingParticipants, ...transport };
    } catch (error) {
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
  }

  @SubscribeMessage('dm:call:ring')
  async ringDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; mode: DmCallMode },
  ) {
    await this.rateLimit.assert(client, 'dm:call:ring', 10, 60_000);
    const user = requireHumanSocketUser(client);
    try {
      if (body.mode !== 'voice' && body.mode !== 'video') {
        throw new UnauthorizedException('Invalid call mode');
      }
      return await this.dmCalls.ring(user.id, body.conversationId, body.mode);
    } catch (error) {
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
  }

  @SubscribeMessage('dm:call:decline')
  async declineDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    await this.rateLimit.assert(client, 'dm:call:decline', 20, 60_000);
    try {
      return await this.dmCalls.decline(requireHumanSocketUser(client).id, body.conversationId);
    } catch (error) {
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
  }

  @SubscribeMessage('dm:call:cancel')
  async cancelDirectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    await this.rateLimit.assert(client, 'dm:call:cancel', 20, 60_000);
    try {
      return await this.dmCalls.cancel(requireHumanSocketUser(client).id, body.conversationId);
    } catch (error) {
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
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
    requireHumanSocketUser(client);
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
    requireHumanSocketUser(client);
    await this.calls.leave(client, body.channelId);
    return { ok: true };
  }

  /**
   * Plays a server soundboard clip for everyone in the caller's call. Nothing is mixed into the media,
   * on either transport: each client plays the broadcast url locally. Refusals are acknowledged with
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
      const user = requireHumanSocketUser(client);
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
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
  }

  @SubscribeMessage('webrtc:offer')
  async relayOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; targetSocketId: string; offer: unknown },
  ) {
    await this.rateLimit.assert(client, 'webrtc:offer', 30, 60_000);
    requireHumanSocketUser(client);
    this.requireMeshTransport();
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
    requireHumanSocketUser(client);
    this.requireMeshTransport();
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
    requireHumanSocketUser(client);
    this.requireMeshTransport();
    await this.calls.assertPeer(client, body.channelId, body.targetSocketId);
    this.publisher.emitToRoom(body.targetSocketId, 'webrtc:ice-candidate', {
      channelId: body.channelId,
      fromSocketId: client.id,
      candidate: body.candidate,
    });
  }

  /**
   * Peer-to-peer relay exists only for the mesh rollback path (`voice-sfu.md` → Changes §7); under
   * LiveKit clients never negotiate with each other. Delete with the flag once mesh is retired.
   */
  private requireMeshTransport() {
    if (this.livekit.transport !== 'mesh') {
      throw new ForbiddenException('WebRTC relay is disabled');
    }
  }
}
