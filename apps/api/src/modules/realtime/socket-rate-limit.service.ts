import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { socketLimitSubject } from './socket-guards';

@Injectable()
export class SocketRateLimitService {
  constructor(private readonly limiter: RedisFixedWindowLimiter) {}

  /** Per-socket event budget, shared by every gateway so one limiter covers the whole connection. */
  async assert(client: Socket, event: string, limit: number, windowMs: number) {
    const key = `socket-event:${socketLimitSubject(client)}:${event}`;
    const result = await this.limiter.hit(key, limit, windowMs);
    if (!result.allowed) {
      throw new HttpException('Socket rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
