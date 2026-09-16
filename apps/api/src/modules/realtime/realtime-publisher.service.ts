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
        return Boolean(socketUser?.sessionId && sessionIds.includes(socketUser.sessionId));
      })
      .forEach((socket) => socket.disconnect(true));
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

  userRoom(userId: string) {
    return `user:${userId}`;
  }
}
