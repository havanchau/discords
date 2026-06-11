import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

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
