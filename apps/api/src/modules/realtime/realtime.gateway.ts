import { HttpException, HttpStatus, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { MessageAttachmentInputDto } from '../messages/dto/create-message.dto';
import { ReactionDto } from '../messages/dto/reaction.dto';
import { defaultWebOrigin, parseWebOrigins } from '../../common/web-origins';
import { RealtimePublisher } from './realtime-publisher.service';

interface SocketUser {
  id: string;
  sessionId: string;
}

interface CallParticipant {
  socketId: string;
  userId: string;
  username: string;
  displayName: string;
  mode: 'voice' | 'video' | 'screen';
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
}

interface ActiveCallSummary {
  channelId: string;
  mode: 'voice' | 'video' | 'screen';
  participants: CallParticipant[];
  screenSharer?: CallParticipant;
}

@WebSocketGateway({
  cors: {
    origin: parseWebOrigins(process.env.WEB_ORIGIN || defaultWebOrigin),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly callParticipants = new Map<string, Map<string, CallParticipant>>();
  private readonly socketCalls = new Map<string, Set<string>>();
  private readonly socketRateLimits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService,
    private readonly publisher: RealtimePublisher,
  ) {}

  afterInit(server: Server) {
    this.publisher.attach(server);
  }

  async handleConnection(client: Socket) {
    try {
      client.data.user = await this.authenticate(client);
      await client.join(this.userRoom(client.data.user.id));
      await this.joinDirectConversationRooms(client, client.data.user.id);
      await this.prisma.user.update({
        where: { id: client.data.user.id },
        data: { status: 'ONLINE' },
      });
      await this.broadcastPresence(client.data.user.id, 'ONLINE');
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    this.leaveAllCalls(client);
    const user = client.data.user as SocketUser | undefined;
    if (user) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'OFFLINE' },
      });
      await this.broadcastPresence(user.id, 'OFFLINE');
    }
  }

  @SubscribeMessage('channel:join')
  async joinChannel(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = this.getUser(client);
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: body.channelId } });
    const canView = await this.permissions.hasChannelPermission(
      user.id,
      channel.id,
      Permission.ViewChannel,
    );
    if (!canView) {
      throw new UnauthorizedException('Not a channel member');
    }

    await client.join(this.channelRoom(body.channelId));
    await client.join(this.serverRoom(channel.serverId));
    return { ok: true, activeCall: this.getActiveCallSummary(body.channelId) };
  }

  @SubscribeMessage('message:create')
  async createMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      channelId: string;
      content: string;
      replyToMessageId?: string;
      attachments?: MessageAttachmentInputDto[];
    },
  ) {
    this.assertSocketRateLimit(client, 'message:create', 20, 60_000);
    const user = this.getUser(client);
    const result = await this.messages.createMessage(user.id, body.channelId, {
      content: body.content,
      replyToMessageId: body.replyToMessageId,
      attachments: body.attachments,
    });
    this.server.to(this.channelRoom(body.channelId)).emit('message:created', result.message);
    await this.emitUnreadUpdated(result.message);
    return result;
  }

  @SubscribeMessage('message:update')
  async updateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; content: string },
  ) {
    this.assertSocketRateLimit(client, 'message:update', 20, 60_000);
    const user = this.getUser(client);
    return this.messages.updateMessage(user.id, body.messageId, {
      content: body.content,
    });
  }

  @SubscribeMessage('message:delete')
  async deleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string },
  ) {
    this.assertSocketRateLimit(client, 'message:delete', 20, 60_000);
    const user = this.getUser(client);
    return this.messages.deleteMessage(user.id, body.messageId);
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const user = this.getUser(client);
    await this.requireConversationMember(user.id, body.conversationId);
    await client.join(this.conversationRoom(body.conversationId));
    return { ok: true };
  }

  @SubscribeMessage('unread:get')
  async getUnreadCounts(@ConnectedSocket() client: Socket) {
    const user = this.getUser(client);
    return { counts: await this.countUnreadByChannel(user.id) };
  }

  @SubscribeMessage('unread:clear')
  async clearUnread(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = this.getUser(client);
    await this.messages.markChannelRead(user.id, body.channelId);
    this.server.to(this.userRoom(user.id)).emit('unread:cleared', { channelId: body.channelId });
    return { ok: true };
  }

  @SubscribeMessage('reaction:toggle')
  async toggleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; messageId: string; emoji: string },
  ) {
    this.assertSocketRateLimit(client, 'reaction:toggle', 60, 60_000);
    const user = this.getUser(client);
    const result = await this.messages.toggleReaction(user.id, body.messageId, {
      emoji: body.emoji,
    } satisfies ReactionDto);
    this.server.to(this.channelRoom(body.channelId)).emit('reaction:updated', {
      channelId: body.channelId,
      message: result.message,
    });
    return result;
  }

  @SubscribeMessage('typing:start')
  async typingStart(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    this.assertSocketRateLimit(client, 'typing:start', 20, 30_000);
    const user = this.getUser(client);
    await this.assertChannelMember(user.id, body.channelId);
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { displayName: true, username: true },
    });
    client.to(this.channelRoom(body.channelId)).emit('typing:start', {
      channelId: body.channelId,
      userId: user.id,
      displayName: profile?.displayName ?? profile?.username ?? 'Someone',
    });
    return { ok: true };
  }

  @SubscribeMessage('typing:stop')
  async typingStop(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    this.assertSocketRateLimit(client, 'typing:stop', 20, 30_000);
    const user = this.getUser(client);
    await this.assertChannelMember(user.id, body.channelId);
    client.to(this.channelRoom(body.channelId)).emit('typing:stop', {
      channelId: body.channelId,
      userId: user.id,
    });
    return { ok: true };
  }

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
    this.assertSocketRateLimit(client, 'voice:join', 10, 60_000);
    const user = this.getUser(client);
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: body.channelId } });
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: user.id, serverId: channel.serverId } },
      include: { user: true },
    });

    if (!member) {
      throw new UnauthorizedException('Not a channel member');
    }

    const room = this.callRoom(body.channelId);
    const participants = this.getCallParticipants(body.channelId);
    const existingParticipants = [...participants.values()].filter(
      (item) => item.socketId !== client.id,
    );
    const participant: CallParticipant = {
      socketId: client.id,
      userId: user.id,
      username: member.user.username,
      displayName: member.user.displayName,
      mode: body.mode,
      isMuted: Boolean(body.isMuted),
      isCameraOff: Boolean(body.isCameraOff),
      isSharingScreen: Boolean(body.isSharingScreen),
    };

    participants.set(client.id, participant);
    if (!this.socketCalls.has(client.id)) {
      this.socketCalls.set(client.id, new Set());
    }
    this.socketCalls.get(client.id)?.add(body.channelId);
    await client.join(room);
    client.to(room).emit('voice:user-joined', { channelId: body.channelId, participant });
    this.emitActiveCall(body.channelId);
    return { participants: existingParticipants };
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
    this.assertSocketRateLimit(client, 'voice:state', 30, 60_000);
    const participant = this.callParticipants.get(body.channelId)?.get(client.id);
    if (!participant) return { ok: false };

    const nextParticipant = {
      ...participant,
      mode: body.mode ?? participant.mode,
      isMuted: body.isMuted ?? participant.isMuted,
      isCameraOff: body.isCameraOff ?? participant.isCameraOff,
      isSharingScreen: body.isSharingScreen ?? participant.isSharingScreen,
    };
    this.callParticipants.get(body.channelId)?.set(client.id, nextParticipant);
    this.server.to(this.callRoom(body.channelId)).emit('voice:user-updated', {
      channelId: body.channelId,
      participant: nextParticipant,
    });
    this.emitActiveCall(body.channelId);
    return { ok: true };
  }

  @SubscribeMessage('voice:leave')
  leaveVoice(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    this.leaveCall(client, body.channelId);
    return { ok: true };
  }

  @SubscribeMessage('webrtc:offer')
  relayOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { channelId: string; targetSocketId: string; offer: unknown },
  ) {
    this.assertSocketRateLimit(client, 'webrtc:offer', 30, 60_000);
    this.assertCallPeer(client, body.channelId, body.targetSocketId);
    this.server.to(body.targetSocketId).emit('webrtc:offer', {
      channelId: body.channelId,
      fromSocketId: client.id,
      offer: body.offer,
    });
  }

  @SubscribeMessage('webrtc:answer')
  relayAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { channelId: string; targetSocketId: string; answer: unknown },
  ) {
    this.assertSocketRateLimit(client, 'webrtc:answer', 30, 60_000);
    this.assertCallPeer(client, body.channelId, body.targetSocketId);
    this.server.to(body.targetSocketId).emit('webrtc:answer', {
      channelId: body.channelId,
      fromSocketId: client.id,
      answer: body.answer,
    });
  }

  @SubscribeMessage('webrtc:ice-candidate')
  relayIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { channelId: string; targetSocketId: string; candidate: unknown },
  ) {
    this.assertSocketRateLimit(client, 'webrtc:ice-candidate', 120, 60_000);
    this.assertCallPeer(client, body.channelId, body.targetSocketId);
    this.server.to(body.targetSocketId).emit('webrtc:ice-candidate', {
      channelId: body.channelId,
      fromSocketId: client.id,
      candidate: body.candidate,
    });
  }

  private async authenticate(client: Socket): Promise<SocketUser> {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(token, {
      secret: this.config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
    });

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    return { id: payload.sub, sessionId: payload.sid };
  }

  private getUser(client: Socket): SocketUser {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      throw new UnauthorizedException('Unauthenticated socket');
    }
    return user;
  }

  private channelRoom(channelId: string) {
    return `channel:${channelId}`;
  }

  private serverRoom(serverId: string) {
    return `server:${serverId}`;
  }

  private userRoom(userId: string) {
    return this.publisher.userRoom(userId);
  }

  private conversationRoom(conversationId: string) {
    return this.publisher.conversationRoom(conversationId);
  }

  private callRoom(channelId: string) {
    return `call:${channelId}`;
  }

  private getCallParticipants(channelId: string) {
    if (!this.callParticipants.has(channelId)) {
      this.callParticipants.set(channelId, new Map());
    }
    return this.callParticipants.get(channelId)!;
  }

  private leaveCall(client: Socket, channelId: string) {
    const participants = this.callParticipants.get(channelId);
    const participant = participants?.get(client.id);
    if (!participants || !participant) return;

    participants.delete(client.id);
    if (participants.size === 0) {
      this.callParticipants.delete(channelId);
    }

    this.socketCalls.get(client.id)?.delete(channelId);
    if (this.socketCalls.get(client.id)?.size === 0) {
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

  private leaveAllCalls(client: Socket) {
    const channelIds = [...(this.socketCalls.get(client.id) ?? [])];
    channelIds.forEach((channelId) => this.leaveCall(client, channelId));
    const keysToDelete = [...this.socketRateLimits.keys()].filter((key) =>
      key.startsWith(`${client.id}:`),
    );
    keysToDelete.forEach((key) => this.socketRateLimits.delete(key));
  }

  private assertCallPeer(client: Socket, channelId: string, targetSocketId: string) {
    const participants = this.callParticipants.get(channelId);
    if (!participants?.has(client.id) || !participants.has(targetSocketId)) {
      throw new UnauthorizedException('Target is not in the call');
    }
  }

  private getActiveCallSummary(channelId: string): ActiveCallSummary | null {
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

  private emitActiveCall(channelId: string) {
    const activeCall = this.getActiveCallSummary(channelId);
    if (activeCall) {
      this.server.to(this.channelRoom(channelId)).emit('voice:active', activeCall);
      return;
    }
    this.server.to(this.channelRoom(channelId)).emit('voice:ended', { channelId });
  }

  private async emitUnreadUpdated(message: {
    authorId: string;
    channelId: string;
    serverId: string;
    content: string;
  }) {
    const members = await this.prisma.serverMember.findMany({
      where: { serverId: message.serverId, userId: { not: message.authorId } },
      include: { user: { select: { username: true } } },
    });

    await Promise.all(
      members.map(async (member) => {
        const canView = await this.permissions.hasChannelPermission(
          member.userId,
          message.channelId,
          Permission.ViewChannel,
        );
        if (!canView) return;

        this.server.to(this.userRoom(member.userId)).emit('unread:updated', {
          channelId: message.channelId,
          count: 1,
          mentions: messageMentionsUsername(message.content, member.user.username) ? 1 : 0,
        });
      }),
    );
  }

  private async countUnreadByChannel(userId: string) {
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const serverIds = memberships.map((membership) => membership.serverId);
    if (!serverIds.length) return {};

    const channels = await this.prisma.channel.findMany({
      where: { serverId: { in: serverIds }, type: 'TEXT' },
      include: { readStates: { where: { userId }, take: 1 } },
    });
    const counts: Record<string, number> = {};

    await Promise.all(
      channels.map(async (channel) => {
        const canView = await this.permissions.hasChannelPermission(
          userId,
          channel.id,
          Permission.ViewChannel,
        );
        if (!canView) return;

        const readState = channel.readStates[0];
        const count = await this.prisma.message.count({
          where: {
            channelId: channel.id,
            deletedAt: null,
            authorId: { not: userId },
            ...(readState ? { createdAt: { gt: readState.lastReadAt } } : {}),
          },
        });
        if (count > 0) counts[channel.id] = count;
      }),
    );

    return counts;
  }

  private assertSocketRateLimit(client: Socket, event: string, limit: number, windowMs: number) {
    const now = Date.now();
    const key = `${client.id}:${event}`;
    const bucket = this.socketRateLimits.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.socketRateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      throw new HttpException('Socket rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async assertChannelMember(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } },
    });
    if (!member) {
      throw new UnauthorizedException('Not a channel member');
    }
    return channel;
  }

  private async joinDirectConversationRooms(client: Socket, userId: string) {
    const memberships = await this.prisma.directConversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    await Promise.all(
      memberships.map((membership) =>
        client.join(this.conversationRoom(membership.conversationId)),
      ),
    );
  }

  private async requireConversationMember(userId: string, conversationId: string) {
    const membership = await this.prisma.directConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership) {
      throw new UnauthorizedException('Not a conversation member');
    }
    return membership;
  }

  private async broadcastPresence(userId: string, status: 'ONLINE' | 'OFFLINE') {
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });

    memberships.forEach((membership) => {
      this.server.to(this.serverRoom(membership.serverId)).emit('presence:update', {
        userId,
        status,
      });
    });
  }
}

function messageMentionsUsername(content: string, username: string) {
  return [...content.matchAll(/@([a-zA-Z0-9_]+)/g)].some(
    (match) => match[1].toLowerCase() === username.toLowerCase(),
  );
}
