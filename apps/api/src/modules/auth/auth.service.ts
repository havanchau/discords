import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { Locale } from '@/common/i18n/locale';
import { I18nService } from '@/common/i18n/i18n.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailService } from './email.service';
import {
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  TwoFactorChallengeService,
} from './two-factor-challenge.service';

/*
 * Refresh tokens and email verification tokens are random (randomUUID / randomBytes), so a salted
 * slow hash adds nothing; a SHA-256 hex digest with a unique index gives one indexed lookup instead
 * of a bcrypt.compare over every row (docs/features/qa-follow-ups-2026-09-18.md). Same pattern as
 * `hashResetToken` in password-reset.service.ts.
 */
export function sha256Hex(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly twoFactorChallenges: TwoFactorChallengeService,
    private readonly i18n: I18nService,
  ) {}

  async register(dto: RegisterDto, _userAgent?: string, locale: Locale = 'en') {
    const username = dto.username.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username }] },
    });

    if (existing) {
      throw new ConflictException('Email or username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username,
        displayName: dto.displayName || username,
        passwordHash,
        locale,
      },
    });

    const verification = await this.createVerificationToken(user.id);
    this.deliverVerificationEmail(
      this.email.sendVerificationEmail(user.email, verification.token, locale),
    );

    // The token only ever travels by email: returning it would let anyone verify an address they do not own.
    return {
      verificationRequired: true,
      email: user.email,
      message: this.i18n.t(locale, 'auth.register.checkInbox'),
    };
  }

  /*
   * Same response whether or not the account exists or is pending, and the bcrypt token work runs after
   * responding, so neither the body nor the response time reveals the account state.
   */
  async resendVerification(email: string, locale: Locale = 'en') {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, emailVerifiedAt: true, locale: true, kind: true },
    });
    if (user && user.kind === 'HUMAN' && !user.emailVerifiedAt) {
      this.deliverVerificationEmail(
        this.reissueVerificationEmail(
          user.id,
          user.email,
          this.i18n.resolveUserLocale(user.locale),
        ),
      );
    }
    return { ok: true, message: this.i18n.t(locale, 'auth.resendVerification.ok') };
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // A webhook's synthetic user has an unusable password already; the kind check does not rely on it.
    if (
      !user ||
      user.kind !== 'HUMAN' ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Email is not verified');
    }

    return this.completeSignIn(user, userAgent);
  }

  /* Final step shared by password and provider sign-in: hand off to 2FA when enabled, else open a session. */
  async completeSignIn(user: { id: string; twoFactorEnabledAt: Date | null }, userAgent?: string) {
    // Before the 2FA hand-off, so a pending deletion is reported without spending a code.
    await this.assertNotPendingDeletion(user.id);
    if (user.twoFactorEnabledAt) {
      return {
        twoFactorRequired: true,
        challengeToken: await this.twoFactorChallenges.issue(user.id),
        expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
      };
    }

    return this.createSession(user.id, userAgent);
  }

  async verifyEmail(token: string, userAgent?: string) {
    const candidate = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });

    if (!candidate || candidate.usedAt || candidate.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: candidate.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: candidate.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    return this.createSession(candidate.userId, userAgent);
  }

  async logoutUser(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        locale: true,
        status: true,
        emailVerifiedAt: true,
        ageConfirmedAt: true,
        createdAt: true,
      },
    });
    return { user };
  }

  async refresh(refreshToken: string, userAgent?: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshHash: sha256Hex(refreshToken) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextRefreshToken = randomUUID();
    const refreshHash = sha256Hex(nextRefreshToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshHash,
        userAgent,
        expiresAt,
        lastActiveAt: new Date(),
      },
    });

    return {
      accessToken: await this.signAccessToken(session.userId, session.id),
      refreshToken: nextRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
      user: {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        displayName: session.user.displayName,
        avatarUrl: session.user.avatarUrl,
        bio: session.user.bio,
        locale: session.user.locale,
        status: session.user.status,
        emailVerifiedAt: session.user.emailVerifiedAt,
        ageConfirmedAt: session.user.ageConfirmedAt,
        createdAt: session.user.createdAt,
      },
    };
  }

  async createSession(userId: string, userAgent?: string) {
    // Every sign-in path (password, 2FA, email verification, provider) ends here.
    await this.assertNotPendingDeletion(userId);
    const refreshToken = randomUUID();
    const refreshHash = sha256Hex(refreshToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshHash,
        userAgent,
        expiresAt,
      },
    });

    return {
      accessToken: await this.signAccessToken(userId, session.id),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
      ...(await this.getMe(userId)),
    };
  }

  /*
   * An account in its deletion grace period (or already anonymized) cannot open a session. Reached
   * only after the credentials were accepted, so it does not reveal the state of someone else's
   * account. Cancelling goes through `POST /auth/account-deletion/cancel`.
   *
   * A non-HUMAN user (a webhook's synthetic author or a bot) never opens a session on any sign-in
   * path; a bot authenticates only with its bot token, on `/bot-api/*`.
   */
  private async assertNotPendingDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletionRequestedAt: true, kind: true },
    });
    if (!user || user.kind !== 'HUMAN') {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.deletionRequestedAt) {
      throw new ForbiddenException('Account is scheduled for deletion');
    }
  }

  private signAccessToken(userId: string, sessionId: string) {
    return this.jwt.signAsync({
      sub: userId,
      sid: sessionId,
    });
  }

  // Delivery is not awaited: a slow or failing SMTP server must not block or break the request. The user
  // can ask for a new link, so a failure is logged without the address or the token.
  private deliverVerificationEmail(delivery: Promise<unknown>) {
    delivery.catch((error: unknown) => {
      this.logger.error(
        'Verification email delivery failed',
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  private async reissueVerificationEmail(userId: string, email: string, locale: Locale) {
    const verification = await this.createVerificationToken(userId);
    return this.email.sendVerificationEmail(email, verification.token, locale);
  }

  private async createVerificationToken(userId: string) {
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('base64url');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    return { token };
  }
}
