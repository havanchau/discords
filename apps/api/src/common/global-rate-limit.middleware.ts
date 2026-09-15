import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { FixedWindowLimiter } from './fixed-window-limiter';

const GLOBAL_WINDOW_MS = 60_000;

/**
 * Per-IP cap across every HTTP request. Registered before body parsing and routing so unknown
 * routes, static uploads, and oversized bodies are counted too; route guards stay the fine-grained control.
 */
export function createGlobalRateLimitMiddleware(limiter: FixedWindowLimiter, requestsPerMinute: number) {
  return (request: Request, response: Response, next: NextFunction) => {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const result = limiter.hit(`global:${ip}`, requestsPerMinute, GLOBAL_WINDOW_MS);
    if (result.allowed) {
      next();
      return;
    }

    response.setHeader('Retry-After', String(result.retryAfterSeconds));
    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: `Rate limit exceeded. Retry after ${result.retryAfterSeconds}s.`,
    });
  };
}
