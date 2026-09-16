import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { defaultWebOrigin, parseWebOrigins } from '../../common/web-origins';
import { FixedWindowLimiter } from '../../common/fixed-window-limiter';
import { readLimitsConfig } from '../../common/limits-config';
import { CallRegistryService } from './call-registry.service';
import { PresenceService } from './presence.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimePublisher } from './realtime-publisher.service';
import { SocketAuthService } from './socket-auth.service';
import { SocketUser } from './socket-user';
import { SOCKET_MAX_PAYLOAD_BYTES, attachSocketGuards } from './socket-guards';

/**
 * Owns the socket connection itself: authentication, room membership and presence. Event handlers
 * live in the feature gateways (`MessagesGateway`, `VoiceGateway`) attached to the same server.
 */
@WebSocketGateway({
  cors: {
    origin: parseWebOrigins(process.env.WEB_ORIGIN || defaultWebOrigin),
    credentials: true,
  },
  maxHttpBufferSize: SOCKET_MAX_PAYLOAD_BYTES,
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly connectionLimiter = new FixedWindowLimiter();

  constructor(
    private readonly config: ConfigService,
    private readonly publisher: RealtimePublisher,
    private readonly socketAuth: SocketAuthService,
    private readonly presence: PresenceService,
    private readonly access: RealtimeAccessService,
    private readonly calls: CallRegistryService,
  ) {}

  afterInit(server: Server) {
    this.publisher.attach(server);
    const limits = readLimitsConfig(this.config);
    attachSocketGuards(server, this.connectionLimiter, {
      trustProxyHops: limits.trustProxyHops,
      maxConnectionsPerIp: limits.socketMaxConnectionsPerIp,
    });

    // Authentication runs in the handshake, not in handleConnection: a client that emits inside its
    // own `connect` handler would otherwise race the async lookup and hit an unauthenticated socket.
    server.use((socket, next) => {
      this.socketAuth
        .authenticate(socket)
        .then((user) => {
          socket.data.user = user;
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });

    void this.presence.resetStalePresence();
  }

  async handleConnection(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      client.disconnect(true);
      return;
    }

    try {
      await client.join(this.publisher.userRoom(user.id));
      await this.joinDirectConversationRooms(client, user.id);
      await this.presence.socketConnected(user.id, client.id);
    } catch (error) {
      this.logger.error(`Could not set up socket for user ${user.id}`, error);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    this.calls.leaveAll(client);
    const user = client.data.user as SocketUser | undefined;
    if (!user) return;

    try {
      await this.presence.socketDisconnected(user.id, client.id);
    } catch (error) {
      this.logger.error(`Could not update presence for user ${user.id}`, error);
    }
  }

  /** DM rooms are joined up front so a conversation delivers without an explicit join event. */
  private async joinDirectConversationRooms(client: Socket, userId: string) {
    const conversationIds = await this.access.listConversationIds(userId);
    await Promise.all(
      conversationIds.map((conversationId) =>
        client.join(this.publisher.conversationRoom(conversationId)),
      ),
    );
  }
}
