import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RequestUser } from '@/common/request-user';

/**
 * Runs after `JwtAuthGuard` on every `/platform/*` route. `JwtAuthGuard` already loads
 * `session.user` (including `platformRole`) from the database on every request and puts it onto
 * `request.user`, so this guard needs no `PrismaService` of its own: the "re-read from the
 * database, never trust the token" property already holds — the JWT itself carries no role, only
 * `sub`/`sid` — and revoking `platformRole` takes effect on the admin's very next request because
 * there is nothing here to invalidate or refresh (docs/features/platform-report-review.md).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    if (request.user?.platformRole !== 'ADMIN') {
      throw new ForbiddenException('Platform admin access required');
    }
    return true;
  }
}
