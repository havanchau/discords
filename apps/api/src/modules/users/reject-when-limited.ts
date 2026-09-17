import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type { LimitResult } from '@/common/redis-fixed-window-limiter';

/**
 * Keyed by account rather than IP (the @RateLimit guard's key), with the guard's 429 shape and
 * `Retry-After` header.
 */
export function rejectWhenLimited(response: Response, limit: LimitResult) {
  if (limit.allowed) return;
  response.setHeader('Retry-After', String(limit.retryAfterSeconds));
  throw new HttpException(
    `Rate limit exceeded. Retry after ${limit.retryAfterSeconds}s.`,
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
