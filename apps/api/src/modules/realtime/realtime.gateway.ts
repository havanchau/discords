import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { MessageAttachmentInputDto } from '../messages/dto/create-message.dto';

interface SocketUser {
  id: string;
  sessionId: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
    credentials: true
  }
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly config: ConfigService
  ) {}

  async handleConnection(client: Socket) {
    try {
      client.data.user = await this.authenticate(client);
      await this.prisma.user.update({
        where: { id: client.data.user.id },
        data: { status: 'ONLINE' }
      });
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('channel:join')
  async joinChannel(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = this.getUser(client);
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: body.channelId } });
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: user.id, serverId: channel.serverId } }
    });

    if (!member) {
      throw new UnauthorizedException('Not a channel member');
    }

    await client.join(this.channelRoom(body.channelId));
    return { ok: true };
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
    }
  ) {
    const user = this.getUser(client);
    const result = await this.messages.createMessage(user.id, body.channelId, {
      content: body.content,
      replyToMessageId: body.replyToMessageId,
      attachments: body.attachments
    });
    this.server.to(this.channelRoom(body.channelId)).emit('message:created', result.message);
    return result;
  }

  private async authenticate(client: Socket): Promise<SocketUser> {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(token, {
      secret: this.config.get<string>('JWT_SECRET', 'dev-secret-change-me')
    });

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
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
}
