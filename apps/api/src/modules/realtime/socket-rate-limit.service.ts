import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { FixedWindowLimiter } from '../../common/fixed-window-limiter';
import { socketLimitSubject } from './socket-guards';

@Injectable()
export class SocketRateLimitService {
  private readonly limiter = new FixedWindowLimiter();

  /** Per-socket event budget, shared by every gateway so one limiter covers the whole connection. */
  assert(client: Socket, event: string, limit: number, windowMs: number) {
    const key = `socket-event:${socketLimitSubject(client)}:${event}`;
    if (!this.limiter.hit(key, limit, windowMs).allowed) {
      throw new HttpException('Socket rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
