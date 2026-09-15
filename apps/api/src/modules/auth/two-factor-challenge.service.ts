import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

const CHALLENGE_PURPOSE = '2fa-login';
export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 300;

/*
 * Short-lived proof that the password step passed. It is signed with a secret derived from, but
 * different to, JWT_SECRET and carries no `sid`, so it can never pass as an access token.
 */
@Injectable()
export class TwoFactorChallengeService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  issue(userId: string) {
    return this.jwt.signAsync(
      { sub: userId, purpose: CHALLENGE_PURPOSE },
      { secret: this.secret(), expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS },
    );
  }

  async verify(challengeToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown; purpose?: unknown }>(
        challengeToken,
        { secret: this.secret() },
      );
      if (payload.purpose !== CHALLENGE_PURPOSE || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid two-factor code');
      }
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid two-factor code');
    }
  }

  private secret() {
    return `${this.config.get<string>('JWT_SECRET', 'dev-secret-change-me')}:2fa-login-challenge`;
  }
}
