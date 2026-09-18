import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { VoiceLivekitAccess, VoiceTransport } from '@discord-clone/shared';
import { LivekitConfig, readLivekitConfig } from '@/common/livekit-config';

/** Seconds a server-to-server LiveKit call may take before `voice:join` reports the SFU as down. */
const LIVEKIT_REQUEST_TIMEOUT_SECONDS = 3;
/** A join token only has to outlive the `Room.connect()` that follows the ack. */
const LIVEKIT_JOIN_TOKEN_TTL = '10m';

export interface LivekitJoinGrant {
  /** The call id: a channel id or `dm:<conversationId>` (`voice-sfu.md` → Changes §3). */
  roomName: string;
  userId: string;
  socketId: string;
  displayName: string;
  canPublish: boolean;
}

/**
 * The one wrapper around `livekit-server-sdk`: join tokens and the room-admin calls stage channels
 * use to change a speaker's publish right without a reconnect. In `mesh` mode nothing here talks to
 * LiveKit, so an environment with no LiveKit configured keeps working.
 */
@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);
  private readonly config: LivekitConfig;
  private readonly rooms: RoomServiceClient | null;

  constructor(configService: ConfigService) {
    this.config = readLivekitConfig(configService);
    this.rooms =
      this.config.transport === 'livekit' && this.config.url
        ? new RoomServiceClient(
            this.config.url,
            this.config.apiKey ?? undefined,
            this.config.apiSecret ?? undefined,
            { requestTimeout: LIVEKIT_REQUEST_TIMEOUT_SECONDS },
          )
        : null;
  }

  get transport(): VoiceTransport {
    return this.config.transport;
  }

  /**
   * Mints the caller's join token after checking the SFU answers, so a LiveKit outage fails the
   * `voice:join` ack instead of a `Room.connect()` the client has already started media for.
   */
  async mintJoinAccess(grant: LivekitJoinGrant): Promise<VoiceLivekitAccess> {
    const { wsUrl, apiKey, apiSecret } = this.config;
    const rooms = this.rooms;
    if (!rooms || !wsUrl || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException('Voice service is unavailable');
    }
    try {
      await rooms.listRooms([grant.roomName]);
    } catch (error) {
      this.logger.error(
        `LiveKit unreachable while joining room ${grant.roomName}: ${describe(error)}`,
      );
      throw new ServiceUnavailableException('Voice service is unavailable');
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: livekitIdentity(grant.userId, grant.socketId),
      name: grant.displayName,
      metadata: JSON.stringify({ userId: grant.userId, displayName: grant.displayName }),
      ttl: LIVEKIT_JOIN_TOKEN_TTL,
    });
    token.addGrant({
      room: grant.roomName,
      roomJoin: true,
      canSubscribe: true,
      canPublish: grant.canPublish,
      canPublishData: false,
    });
    return { url: wsUrl, token: await token.toJwt() };
  }

  /**
   * Grants or revokes publishing for every connection (tab/device) the user has in the room. A user
   * who is not connected is skipped: their next join token carries the new right.
   */
  async setUserPublish(roomName: string, userId: string, canPublish: boolean) {
    const rooms = this.rooms;
    if (!rooms) return;
    try {
      const identities = await this.userIdentities(rooms, roomName, userId);
      for (const identity of identities) {
        await rooms.updateParticipant(roomName, identity, {
          permission: { canPublish, canSubscribe: true, canPublishData: false },
        });
      }
    } catch (error) {
      this.logger.error(
        `LiveKit publish update failed for room ${roomName}, user ${userId}: ${describe(error)}`,
      );
      throw new ServiceUnavailableException('Voice service is unavailable');
    }
  }

  /** Disconnects every connection the user has in the room (kick or ban from the server). */
  async removeUser(roomName: string, userId: string) {
    const rooms = this.rooms;
    if (!rooms) return;
    const identities = await this.userIdentities(rooms, roomName, userId);
    for (const identity of identities) {
      await rooms.removeParticipant(roomName, identity);
    }
  }

  private async userIdentities(rooms: RoomServiceClient, roomName: string, userId: string) {
    // LiveKit answers "not found" for the participants of a room nobody has joined yet.
    const [room] = await rooms.listRooms([roomName]);
    if (!room) return [];
    const participants = await rooms.listParticipants(roomName);
    const prefix = `${userId}:`;
    return participants
      .map((participant) => participant.identity)
      .filter((identity) => identity.startsWith(prefix));
  }
}

/** One identity per socket, so two tabs of one user are two participants, as in the mesh. */
export function livekitIdentity(userId: string, socketId: string) {
  return `${userId}:${socketId}`;
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
