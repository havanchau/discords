import { HttpException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from '@/modules/messages/messages.service';
import { MessageAttachmentInputDto } from '@/modules/messages/dto/create-message.dto';
import { withoutViewerVotes } from '@/modules/polls/poll.format';
import { CallRegistryService } from './call-registry.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimePublisher } from './realtime-publisher.service';
import { RealtimeUnreadService } from './realtime-unread.service';
import { SocketErrorTranslator } from './socket-error-translator.service';
import { SocketRateLimitService } from './socket-rate-limit.service';
import { requireHumanSocketUser } from './socket-user';
import { validateSocketMessageBody, validateSocketReactionBody } from './socket-validation';

/** Chat over the socket: rooms, messages, threads, reactions, typing and unread badges. */
@WebSocketGateway()
export class MessagesGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly messages: MessagesService,
    private readonly access: RealtimeAccessService,
    private readonly unread: RealtimeUnreadService,
    private readonly publisher: RealtimePublisher,
    private readonly calls: CallRegistryService,
    private readonly rateLimit: SocketRateLimitService,
    private readonly socketErrors: SocketErrorTranslator,
  ) {}

  @SubscribeMessage('channel:join')
  async joinChannel(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = requireHumanSocketUser(client);
    const channel = await this.access.requireViewableChannel(user.id, body.channelId);

    await client.join(this.publisher.channelRoom(body.channelId));
    await client.join(this.publisher.serverRoom(channel.serverId));
    return { ok: true, activeCall: await this.calls.getActiveCallSummary(body.channelId) };
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
      stickerId?: string;
    },
  ) {
    await this.rateLimit.assert(client, 'message:create', 20, 60_000);
    const user = requireHumanSocketUser(client);
    let result: Awaited<ReturnType<MessagesService['createMessage']>>;
    try {
      const dto = await validateSocketMessageBody(body);
      result = await this.messages.createMessage(user.id, body.channelId, dto);
    } catch (error) {
      // Business refusals (timeout, slowmode, permissions) are acknowledged so the client can show
      // the reason; anything else still fails the event as before.
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
    this.publisher.emitToRoom(
      this.publisher.channelRoom(body.channelId),
      'message:created',
      result.message,
    );
    await this.unread.emitUpdated(result.message);
    return result;
  }

  @SubscribeMessage('thread:join')
  async joinThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { rootMessageId: string },
  ) {
    const user = requireHumanSocketUser(client);
    const result = await this.messages.listThreadMessages(user.id, body.rootMessageId);
    if (result.thread?.id) {
      await client.join(`thread:${result.thread.id}`);
    }
    return result;
  }

  @SubscribeMessage('thread:message:create')
  async createThreadMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      rootMessageId: string;
      content: string;
      replyToMessageId?: string;
      attachments?: MessageAttachmentInputDto[];
      stickerId?: string;
    },
  ) {
    await this.rateLimit.assert(client, 'thread:message:create', 20, 60_000);
    const user = requireHumanSocketUser(client);
    try {
      const dto = await validateSocketMessageBody(body);
      return await this.messages.createThreadMessage(user.id, body.rootMessageId, dto);
    } catch (error) {
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
  }

  @SubscribeMessage('message:update')
  async updateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; content: string },
  ) {
    await this.rateLimit.assert(client, 'message:update', 20, 60_000);
    const user = requireHumanSocketUser(client);
    try {
      return await this.messages.updateMessage(user.id, body.messageId, {
        content: body.content,
      });
    } catch (error) {
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
  }

  @SubscribeMessage('message:delete')
  async deleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string },
  ) {
    await this.rateLimit.assert(client, 'message:delete', 20, 60_000);
    const user = requireHumanSocketUser(client);
    try {
      return await this.messages.deleteMessage(user.id, body.messageId);
    } catch (error) {
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const user = requireHumanSocketUser(client);
    await this.access.requireConversationMember(user.id, body.conversationId);
    await client.join(this.publisher.conversationRoom(body.conversationId));
    return { ok: true };
  }

  @SubscribeMessage('unread:get')
  async getUnreadCounts(@ConnectedSocket() client: Socket) {
    const user = requireHumanSocketUser(client);
    return { counts: await this.unread.countByChannel(user.id) };
  }

  @SubscribeMessage('unread:clear')
  async clearUnread(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = requireHumanSocketUser(client);
    await this.messages.markChannelRead(user.id, body.channelId);
    this.publisher.emitToRoom(this.publisher.userRoom(user.id), 'unread:cleared', {
      channelId: body.channelId,
    });
    return { ok: true };
  }

  @SubscribeMessage('reaction:toggle')
  async toggleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; messageId: string; emoji: string },
  ) {
    await this.rateLimit.assert(client, 'reaction:toggle', 60, 60_000);
    const user = requireHumanSocketUser(client);
    let result: Awaited<ReturnType<MessagesService['toggleReaction']>>;
    try {
      const dto = await validateSocketReactionBody(body);
      result = await this.messages.toggleReaction(user.id, body.messageId, dto);
    } catch (error) {
      if (error instanceof HttpException) return this.socketErrors.ack(client, error);
      throw error;
    }
    // Broadcast to the message's own channel: the client-sent channelId is unchecked, and using it
    // would push a private channel's message into a room of members who cannot read it.
    const channelId = result.message.channelId;
    this.publisher.emitToRoom(this.publisher.channelRoom(channelId), 'reaction:updated', {
      channelId,
      message: withoutViewerVotes(result.message),
    });
    return result;
  }

  @SubscribeMessage('typing:start')
  async typingStart(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    await this.rateLimit.assert(client, 'typing:start', 20, 30_000);
    const user = requireHumanSocketUser(client);
    await this.access.requireChannelMember(user.id, body.channelId);
    const displayName = await this.access.getTypingIdentity(user.id);

    client.to(this.publisher.channelRoom(body.channelId)).emit('typing:start', {
      channelId: body.channelId,
      userId: user.id,
      displayName,
    });
    return { ok: true };
  }

  @SubscribeMessage('typing:stop')
  async typingStop(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    await this.rateLimit.assert(client, 'typing:stop', 20, 30_000);
    const user = requireHumanSocketUser(client);
    await this.access.requireChannelMember(user.id, body.channelId);

    client.to(this.publisher.channelRoom(body.channelId)).emit('typing:stop', {
      channelId: body.channelId,
      userId: user.id,
    });
    return { ok: true };
  }
}
