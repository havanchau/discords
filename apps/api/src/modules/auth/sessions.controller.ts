import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionsService } from './sessions.service';

@UseGuards(JwtAuthGuard)
@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.sessions.list(user.id, user.sessionId);
  }

  @RateLimit({ keyPrefix: 'session-revoke-others', limit: 10, windowMs: 60_000 })
  @HttpCode(200)
  @Post('revoke-others')
  revokeOthers(@CurrentUser() user: RequestUser) {
    return this.sessions.revokeOthers(user.id, user.sessionId);
  }

  @RateLimit({ keyPrefix: 'session-revoke', limit: 30, windowMs: 60_000 })
  @Delete(':sessionId')
  revoke(@CurrentUser() user: RequestUser, @Param('sessionId') sessionId: string) {
    return this.sessions.revoke(user.id, user.sessionId, sessionId);
  }
}
