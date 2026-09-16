import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, Socket } from 'socket.io';
import { defaultWebOrigin, parseWebOrigins } from '@/common/web-origins';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { readLimitsConfig } from '@/common/limits-config';
import { RedisService } from '@/modules/redis/redis.service';
import { CallRegistryService } from './call-registry.service';
import { PresenceService } from './presence.service';
import { RealtimeHeartbeatService } from './realtime-heartbeat.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimePublisher } from './realtime-publisher.service';
import { SocketAuthService } from './socket-auth.service';
import { readSocketUser, setSocketUser } from './socket-user';
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

  constructor(
    private readonly config: ConfigService,
    private readonly publisher: RealtimePublisher,
    private readonly socketAuth: SocketAuthService,
    private readonly presence: PresenceService,
    private readonly access: RealtimeAccessService,
    private readonly calls: CallRegistryService,
    private readonly redis: RedisService,
    private readonly limiter: RedisFixedWindowLimiter,
    private readonly heartbeat: RealtimeHeartbeatService,
  ) {}

  afterInit(server: Server) {
    // Attached before anything else so no socket is ever accepted onto a single-instance server:
    // without it a broadcast would only reach the clients this process happens to hold.
    const { pubClient, subClient } = this.redis.createAdapterClients();
    server.adapter(createAdapter(pubClient, subClient));

    this.publisher.attach(server);
    const limits = readLimitsConfig(this.config);
    attachSocketGuards(server, this.limiter, {
      trustProxyHops: limits.trustProxyHops,
      maxConnectionsPerIp: limits.socketMaxConnectionsPerIp,
    });

    // Authentication runs in the handshake, not in handleConnection: a client that emits inside its
    // own `connect` handler would otherwise race the async lookup and hit an unauthenticated socket.
    server.use((socket, next) => {
      this.socketAuth
        .authenticate(socket)
        .then((user) => {
          setSocketUser(socket, user);
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });

    this.heartbeat.start(server);
  }

  async handleConnection(client: Socket) {
    const user = readSocketUser(client);
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
    const user = readSocketUser(client);

    try {
      await this.calls.leaveAll(client);
      if (user) await this.presence.socketDisconnected(user.id, client.id);
    } catch (error) {
      this.logger.error(`Could not clean up socket ${client.id}`, error);
    }
  }

  /** DM rooms are joined up front so a conversation delivers without an explicit join event. */
  private async joinDirectConversationRooms(client: Socket, userId: string) {
    const conversationIds = await this.access.listConversationIds(userId);
    await Promise.all(
      conversationIds.map(async (conversationId) => {
        await client.join(this.publisher.conversationRoom(conversationId));
      }),
    );
  }
}
