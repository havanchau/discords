import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '@/common/current-user.decorator';
import { I18nService } from '@/common/i18n/i18n.service';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly i18n: I18nService,
  ) {}

  @RateLimit({ keyPrefix: 'auth-register', limit: 5, windowMs: 15 * 60_000 })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(
      dto,
      request.headers['user-agent'],
      this.i18n.resolveRequestLocale(request),
    );
  }

  @RateLimit({ keyPrefix: 'auth-login', limit: 10, windowMs: 15 * 60_000 })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto, request.headers['user-agent']);
  }

  @RateLimit({ keyPrefix: 'auth-verify-email', limit: 10, windowMs: 15 * 60_000 })
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: Request) {
    return this.auth.verifyEmail(dto.token, request.headers['user-agent']);
  }

  @RateLimit({ keyPrefix: 'auth-resend-verification', limit: 5, windowMs: 15 * 60_000 })
  @HttpCode(200)
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto, @Req() request: Request) {
    return this.auth.resendVerification(dto.email, this.i18n.resolveRequestLocale(request));
  }

  @RateLimit({ keyPrefix: 'auth-forgot-password', limit: 5, windowMs: 15 * 60_000 })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.passwordReset.requestReset(dto.email, this.i18n.resolveRequestLocale(request));
  }

  @RateLimit({ keyPrefix: 'auth-reset-password', limit: 10, windowMs: 15 * 60_000 })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.resetPassword(dto.token, dto.password);
  }

  @RateLimit({ keyPrefix: 'auth-refresh', limit: 30, windowMs: 15 * 60_000 })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.auth.refresh(dto.refreshToken, request.headers['user-agent']);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: RequestUser) {
    return this.auth.logoutUser(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.auth.getMe(user.id);
  }
}
