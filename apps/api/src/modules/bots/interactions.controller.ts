import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { InvokeInteractionDto } from './dto/invoke-interaction.dto';
import { InteractionsService } from './interactions.service';

/**
 * `POST /channels/:channelId/interactions` — session auth: the invoker is a human member, not a bot,
 * so this stays off `/bot-api/*` (`bot-gateway-and-slash-commands.md` → Changes → Invocation flow).
 */
@UseGuards(JwtAuthGuard)
@Controller('channels/:channelId/interactions')
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @RateLimit({ keyPrefix: 'interaction-invoke', limit: 30, windowMs: 60_000 })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  invoke(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: InvokeInteractionDto,
  ) {
    return this.interactions.invoke(user.id, channelId, dto);
  }
}
