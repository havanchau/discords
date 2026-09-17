import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit } from '@/common/rate-limit.decorator';
import { AccountDeletionService } from './account-deletion.service';
import { CancelAccountDeletionDto } from './dto/delete-account.dto';
import { rejectWhenLimited } from './reject-when-limited';

/**
 * Unauthenticated: requesting a deletion revoked every session, so the password (and the second
 * factor, when enabled) is the proof. Limited per IP by the guard and per email address here.
 */
@Controller('auth/account-deletion')
export class AccountDeletionCancelController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @RateLimit({ keyPrefix: 'account-deletion-cancel', limit: 10, windowMs: 15 * 60_000 })
  @HttpCode(200)
  @Post('cancel')
  async cancel(
    @Body() dto: CancelAccountDeletionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    rejectWhenLimited(response, await this.deletion.hitCancelLimit(dto.email));
    return this.deletion.cancelDeletion(dto);
  }
}
