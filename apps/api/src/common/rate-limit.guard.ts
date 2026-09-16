import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisFixedWindowLimiter } from './redis-fixed-window-limiter';
import { RATE_LIMIT_METADATA, RateLimitOptions } from './rate-limit.decorator';

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  limit: 120,
  windowMs: 60_000,
  keyPrefix: 'global'
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RedisFixedWindowLimiter,
  ) {}

  async canActivate(context: ExecutionContext) {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA, [
        context.getHandler(),
        context.getClass()
      ]) ?? DEFAULT_RATE_LIMIT;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    // request.ip honours `trust proxy`; the raw X-Forwarded-For header is client-controlled.
    const clientIp = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const key = `${options.keyPrefix ?? 'route'}:${clientIp}:${request.method}:${request.route?.path ?? request.path}`;
    const result = await this.limiter.hit(key, options.limit, options.windowMs);

    if (!result.allowed) {
      http.getResponse<Response>().setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(
        `Rate limit exceeded. Retry after ${result.retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }
}
