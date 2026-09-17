import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RateLimit } from '@/common/rate-limit.decorator';
import { AccountDeletionService } from './account-deletion.service';
import { CancelAccountDeletionDto } from './dto/delete-account.dto';

/** Unauthenticated: requesting a deletion revoked every session, so the password is the proof. */
@Controller('auth/account-deletion')
export class AccountDeletionCancelController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @RateLimit({ keyPrefix: 'account-deletion-cancel', limit: 10, windowMs: 15 * 60_000 })
  @HttpCode(200)
  @Post('cancel')
  cancel(@Body() dto: CancelAccountDeletionDto) {
    return this.deletion.cancelDeletion(dto);
  }
}
