import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { RealtimePublisherModule } from '../realtime/realtime-publisher.module';
import { AuthController } from './auth.controller';
import { EmailService } from './email.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { TwoFactorChallengeService } from './two-factor-challenge.service';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [
    RealtimePublisherModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') as StringValue
        }
      })
    })
  ],
  controllers: [AuthController, SessionsController, TwoFactorController],
  providers: [
    AuthService,
    EmailService,
    JwtAuthGuard,
    PasswordResetService,
    SessionsService,
    TwoFactorChallengeService,
    TwoFactorService
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule]
})
export class AuthModule {}
