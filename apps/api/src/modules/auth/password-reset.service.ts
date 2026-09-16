import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import type { Locale } from '../../common/i18n/locale';
import { I18nService } from '../../common/i18n/i18n.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { EmailService } from './email.service';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly realtime: RealtimePublisher,
    private readonly i18n: I18nService,
  ) {}

  /* Same response whether or not the account exists, and delivery happens after responding. */
  async requestReset(email: string, locale: Locale = 'en') {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, locale: true },
    });
    const okResponse = { ok: true, message: this.i18n.t(locale, 'auth.forgotPassword.ok') };
    if (!user) return okResponse;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);

    this.email
      .sendPasswordResetEmail(user.email, token, this.i18n.resolveUserLocale(user.locale))
      .catch((error: unknown) => {
      this.logger.error(
        'Password reset email delivery failed',
        error instanceof Error ? error.stack : undefined,
      );
    });
    return okResponse;
  }

  async resetPassword(token: string, password: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const revokedSessionIds = await this.prisma.$transaction(async (tx) => {
      // Claiming the token conditionally means two concurrent resets cannot both succeed.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw new BadRequestException('Invalid or expired reset token');

      await tx.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      const activeSessions = await tx.session.findMany({
        where: { userId: resetToken.userId, revokedAt: null },
        select: { id: true },
      });
      await tx.session.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return activeSessions.map((session) => session.id);
    });
    await this.realtime.disconnectSessions(resetToken.userId, revokedSessionIds);
    return { ok: true };
  }
}
