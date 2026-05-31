import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RATE_LIMIT_METADATA, RateLimitOptions } from './rate-limit.decorator';

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  limit: 120,
  windowMs: 60_000,
  keyPrefix: 'global'
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweepAt = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA, [
        context.getHandler(),
        context.getClass()
      ]) ?? DEFAULT_RATE_LIMIT;

    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = `${options.keyPrefix ?? 'route'}:${this.getClientIp(request)}:${request.method}:${request.route?.path ?? request.path}`;
    const bucket = this.buckets.get(key);

    if (now - this.lastSweepAt > 60_000) {
      this.sweep(now);
    }

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > options.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new HttpException(`Rate limit exceeded. Retry after ${retryAfter}s.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private getClientIp(request: Request) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();
    return firstForwardedIp || request.ip || request.socket.remoteAddress || 'unknown';
  }

  private sweep(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
    this.lastSweepAt = now;
  }
}
