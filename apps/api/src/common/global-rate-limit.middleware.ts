import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RedisFixedWindowLimiter } from './redis-fixed-window-limiter';

const GLOBAL_WINDOW_MS = 60_000;

/**
 * Per-IP cap across every HTTP request. Registered before body parsing and routing so unknown
 * routes, static uploads, and oversized bodies are counted too; route guards stay the fine-grained control.
 */
export function createGlobalRateLimitMiddleware(
  limiter: RedisFixedWindowLimiter,
  requestsPerMinute: number,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const deny = (retryAfterSeconds: number) => {
      response.setHeader('Retry-After', String(retryAfterSeconds));
      response.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Rate limit exceeded. Retry after ${retryAfterSeconds}s.`,
      });
    };

    limiter
      .hit(`global:${ip}`, requestsPerMinute, GLOBAL_WINDOW_MS)
      .then((result) => (result.allowed ? next() : deny(result.retryAfterSeconds)))
      // The limiter already denies on a Redis failure; this only covers an unexpected throw.
      .catch(() => deny(Math.ceil(GLOBAL_WINDOW_MS / 1000)));
  };
}
