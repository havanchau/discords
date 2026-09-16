import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { AuthService } from './auth.service';
import { createSecretBox } from './secret-box';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotpSecret,
  verifyTotp,
} from './totp';
import { TwoFactorChallengeService } from './two-factor-challenge.service';
import { twoFactorEncryptionKey } from './two-factor-config';

const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Discords';

interface TwoFactorUser {
  id: string;
  twoFactorSecret: string | null;
  twoFactorLastUsedStep: number | null;
}

export function normalizeRecoveryCode(code: string) {
  return code.replace(/[\s-]/g, '').toLowerCase();
}

function hashRecoveryCode(code: string) {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

function generateRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const hex = randomBytes(4).toString('hex');
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  });
}

@Injectable()
export class TwoFactorService {
  private readonly secretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly challenges: TwoFactorChallengeService,
    config: ConfigService,
  ) {
    this.secretBox = createSecretBox(twoFactorEncryptionKey(config));
  }

  async status(userId: string) {
    const [user, recoveryCodesRemaining] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { twoFactorEnabledAt: true },
      }),
      this.prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } }),
    ]);
    return {
      enabled: Boolean(user.twoFactorEnabledAt),
      enabledAt: user.twoFactorEnabledAt,
      recoveryCodesRemaining,
    };
  }

  async setup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, twoFactorEnabledAt: true },
    });
    if (user.twoFactorEnabledAt) {
      throw new ConflictException('Two-factor authentication is already enabled');
    }

    const secret = base32Encode(generateTotpSecret());
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorPendingSecret: this.secretBox.seal(secret) },
    });
    return { secret, otpauthUrl: buildOtpauthUrl(TOTP_ISSUER, user.email, secret) };
  }

  async enable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorPendingSecret: true, twoFactorEnabledAt: true },
    });
    if (user.twoFactorEnabledAt) {
      throw new ConflictException('Two-factor authentication is already enabled');
    }
    if (!user.twoFactorPendingSecret) {
      throw new BadRequestException('Start two-factor setup first');
    }

    const step = verifyTotp(
      base32Decode(this.secretBox.open(user.twoFactorPendingSecret)),
      code,
      Date.now(),
    );
    if (step === null) throw new BadRequestException('Invalid two-factor code');

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: user.twoFactorPendingSecret,
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: new Date(),
          twoFactorLastUsedStep: step,
        },
      }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          userId,
          codeHash: hashRecoveryCode(recoveryCode),
        })),
      }),
    ]);
    return { recoveryCodes };
  }

  async disable(userId: string, password: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        twoFactorSecret: true,
        twoFactorLastUsedStep: true,
      },
    });
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches || !(await this.consumeCode(user, code))) {
      throw new BadRequestException('Invalid password or code');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: null,
          twoFactorLastUsedStep: null,
        },
      }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    ]);
    return { ok: true };
  }

  async regenerateRecoveryCodes(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, twoFactorSecret: true, twoFactorLastUsedStep: true },
    });
    // Authenticator codes only: a recovery code must not be able to mint new recovery codes.
    if (!user.twoFactorSecret || !(await this.consumeTotp(user, code))) {
      throw new BadRequestException('Invalid two-factor code');
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          userId,
          codeHash: hashRecoveryCode(recoveryCode),
        })),
      }),
    ]);
    return { recoveryCodes };
  }

  async verifyLogin(challengeToken: string, code: string, userAgent?: string) {
    const userId = await this.challenges.verify(challengeToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, twoFactorSecret: true, twoFactorLastUsedStep: true },
    });
    if (!user?.twoFactorSecret || !(await this.consumeCode(user, code))) {
      throw new UnauthorizedException('Invalid two-factor code');
    }
    return this.auth.createSession(user.id, userAgent);
  }

  private async consumeCode(user: TwoFactorUser, code: string) {
    return /^\d{6}$/.test(code)
      ? this.consumeTotp(user, code)
      : this.consumeRecoveryCode(user.id, code);
  }

  /* Each time step is accepted once per user, so an observed code cannot be replayed. */
  private async consumeTotp(user: TwoFactorUser, code: string) {
    if (!user.twoFactorSecret) return false;
    const step = verifyTotp(
      base32Decode(this.secretBox.open(user.twoFactorSecret)),
      code,
      Date.now(),
    );
    if (step === null) return false;

    const { count } = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ twoFactorLastUsedStep: null }, { twoFactorLastUsedStep: { lt: step } }],
      },
      data: { twoFactorLastUsedStep: step },
    });
    return count === 1;
  }

  private async consumeRecoveryCode(userId: string, code: string) {
    const { count } = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return count > 0;
  }
}
