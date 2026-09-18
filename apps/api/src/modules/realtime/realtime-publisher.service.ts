import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { readSocketUser } from './socket-user';

@Injectable()
export class RealtimePublisher {
  private server?: Server;

  attach(server: Server) {
    this.server = server;
  }

  emitToRoom(room: string, event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }

  emitToRooms(rooms: string[], event: string, payload: unknown) {
    const uniqueRooms = [...new Set(rooms)];
    if (!this.server || !uniqueRooms.length) return;

    const [firstRoom, ...remainingRooms] = uniqueRooms;
    let target = this.server.to(firstRoom);
    remainingRooms.forEach((room) => {
      target = target.to(room);
    });
    target.emit(event, payload);
  }

  /** Takes specific sockets (on any instance) out of a room. */
  removeSocketsFromRoom(socketIds: string[], room: string) {
    if (!this.server || !socketIds.length) return;
    this.server.in(socketIds).socketsLeave(room);
  }

  /** Moves every connected socket of these users into a room, e.g. after joining a group DM. */
  joinUsersToRoom(userIds: string[], room: string) {
    if (!this.server || !userIds.length) return;
    this.server.in(userIds.map((userId) => this.userRoom(userId))).socketsJoin(room);
  }

  removeUsersFromRooms(userIds: string[], rooms: string[]) {
    if (!this.server || !userIds.length || !rooms.length) return;
    this.server.in(userIds.map((userId) => this.userRoom(userId))).socketsLeave(rooms);
  }

  /** Disconnects the user's sockets that authenticated with one of these sessions. */
  async disconnectSessions(userId: string, sessionIds: string[]) {
    if (!this.server || !sessionIds.length) return;
    const sockets = await this.server.in(this.userRoom(userId)).fetchSockets();
    sockets
      .filter((socket) => {
        const socketUser = readSocketUser(socket);
        return Boolean(socketUser?.kind === 'human' && sessionIds.includes(socketUser.sessionId));
      })
      .forEach((socket) => socket.disconnect(true));
  }

  /**
   * A bot's live socket(s), if any (every bot socket joins `botRoom(botId)` on connect, mirroring
   * `userRoom`). Multi-instance safe: the Redis adapter's remote-socket selectors reach a socket
   * held by any instance, not just this one.
   */
  fetchBotSockets(botId: string) {
    if (!this.server) return Promise.resolve([]);
    return this.server.in(this.botRoom(botId)).fetchSockets();
  }

  /** Full disconnect — token regeneration, bot/owner deletion: the identity itself changed. */
  disconnectBotSocket(botId: string) {
    this.server?.in(this.botRoom(botId)).disconnectSockets(true);
  }

  /** Removes a bot's live socket(s) from specific rooms without disconnecting — removal from one server only. */
  removeBotFromRooms(botId: string, rooms: string[]) {
    if (!this.server || !rooms.length) return;
    this.server.in(this.botRoom(botId)).socketsLeave(rooms);
  }

  serverRoom(serverId: string) {
    return `server:${serverId}`;
  }

  channelRoom(channelId: string) {
    return `channel:${channelId}`;
  }

  conversationRoom(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  /** Socket.IO room of one call's participants; a call id is a channel id or `dm:<conversationId>`. */
  callRoom(callId: string) {
    return `call:${callId}`;
  }

  userRoom(userId: string) {
    return `user:${userId}`;
  }

  /** Every socket of one bot, across every instance — connection cap, disconnect, targeted emit. */
  botRoom(botId: string) {
    return `bot:${botId}`;
  }
}
