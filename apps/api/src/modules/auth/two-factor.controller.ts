import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import {
  DisableTwoFactorDto,
  TwoFactorCodeDto,
  VerifyTwoFactorLoginDto,
} from './dto/two-factor.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TwoFactorService } from './two-factor.service';

const FIFTEEN_MINUTES_MS = 15 * 60_000;

@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  status(@CurrentUser() user: RequestUser) {
    return this.twoFactor.status(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'two-factor-setup', limit: 10, windowMs: FIFTEEN_MINUTES_MS })
  @HttpCode(200)
  @Post('setup')
  setup(@CurrentUser() user: RequestUser) {
    return this.twoFactor.setup(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'two-factor-enable', limit: 10, windowMs: FIFTEEN_MINUTES_MS })
  @HttpCode(200)
  @Post('enable')
  enable(@CurrentUser() user: RequestUser, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.enable(user.id, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'two-factor-disable', limit: 10, windowMs: FIFTEEN_MINUTES_MS })
  @HttpCode(200)
  @Post('disable')
  disable(@CurrentUser() user: RequestUser, @Body() dto: DisableTwoFactorDto) {
    return this.twoFactor.disable(user.id, dto.password, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'two-factor-recovery', limit: 5, windowMs: FIFTEEN_MINUTES_MS })
  @HttpCode(200)
  @Post('recovery-codes')
  regenerateRecoveryCodes(@CurrentUser() user: RequestUser, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.regenerateRecoveryCodes(user.id, dto.code);
  }

  @RateLimit({ keyPrefix: 'two-factor-verify-login', limit: 10, windowMs: FIFTEEN_MINUTES_MS })
  @HttpCode(200)
  @Post('verify-login')
  verifyLogin(@Body() dto: VerifyTwoFactorLoginDto, @Req() request: Request) {
    return this.twoFactor.verifyLogin(dto.challengeToken, dto.code, request.headers['user-agent']);
  }
}
