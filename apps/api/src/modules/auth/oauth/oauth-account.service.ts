import { Injectable } from '@nestjs/common';
import { OAuthProvider, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OAUTH_PROVIDERS,
  OAuthFlowError,
  OAuthProfile,
  OAuthProviderName,
} from './oauth-providers';

const SIGN_IN_USER_SELECT = { id: true, twoFactorEnabledAt: true } as const;
export type SignInUser = Prisma.UserGetPayload<{ select: typeof SIGN_IN_USER_SELECT }>;

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const DISPLAY_NAME_MAX_LENGTH = 64;
const USERNAME_SUFFIX_ATTEMPTS = 5;

/* Maps a provider identity to a local user, following the linking rules in docs/features/oauth-login.md. */
@Injectable()
export class OAuthAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUser(providerName: OAuthProviderName, profile: OAuthProfile): Promise<SignInUser> {
    try {
      return await this.resolve(providerName, profile);
    } catch (error) {
      // Two callbacks for the same new identity can race on the unique indexes; the second one then
      // finds the account the first one created.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.resolve(providerName, profile);
      }
      throw error;
    }
  }

  private async resolve(providerName: OAuthProviderName, profile: OAuthProfile) {
    const provider = OAUTH_PROVIDERS[providerName].prismaProvider;
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId },
      },
      select: { user: { select: SIGN_IN_USER_SELECT } },
    });
    if (linked) return linked.user;

    if (!profile.email || !profile.emailVerified) {
      throw new OAuthFlowError('email_required', 'Provider did not return a verified email');
    }
    const email = profile.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { ...SIGN_IN_USER_SELECT, emailVerifiedAt: true },
    });

    if (existing) {
      // Only Google proves the email is verified; linking on anything weaker hands over the account.
      if (providerName !== 'google') {
        throw new OAuthFlowError('account_exists', 'Email belongs to an existing account');
      }
      await this.linkToExistingUser(existing, provider, profile.providerAccountId);
      return { id: existing.id, twoFactorEnabledAt: existing.twoFactorEnabledAt };
    }

    return this.createUser(email, provider, profile);
  }

  private async linkToExistingUser(
    user: { id: string; emailVerifiedAt: Date | null },
    provider: OAuthProvider,
    providerAccountId: string,
  ) {
    const now = new Date();
    // An unverified account may have been registered by someone else with this address, so the
    // password they chose must stop working. The owner can set one through "Forgot password?".
    const passwordHash = user.emailVerifiedAt ? null : await unusablePasswordHash();

    await this.prisma.$transaction(async (tx) => {
      if (passwordHash) {
        await tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: now, passwordHash },
        });
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.emailVerificationToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        });
      }
      await tx.oAuthAccount.create({ data: { userId: user.id, provider, providerAccountId } });
    });
  }

  private async createUser(email: string, provider: OAuthProvider, profile: OAuthProfile) {
    const username = await this.availableUsername(email);
    const displayName = profile.name?.trim().slice(0, DISPLAY_NAME_MAX_LENGTH) || username;

    return this.prisma.user.create({
      data: {
        email,
        username,
        displayName,
        passwordHash: await unusablePasswordHash(),
        emailVerifiedAt: new Date(),
        oauthAccounts: { create: { provider, providerAccountId: profile.providerAccountId } },
      },
      select: SIGN_IN_USER_SELECT,
    });
  }

  private async availableUsername(email: string) {
    const base = usernameBase(email);
    if (!(await this.usernameTaken(base))) return base;

    for (let attempt = 0; attempt < USERNAME_SUFFIX_ATTEMPTS; attempt += 1) {
      const candidate = `${base.slice(0, USERNAME_MAX_LENGTH - 4)}${randomInt(1000, 10_000)}`;
      if (!(await this.usernameTaken(candidate))) return candidate;
    }
    return `${base.slice(0, USERNAME_MAX_LENGTH - 8)}${randomBytes(4).toString('hex')}`;
  }

  private async usernameTaken(username: string) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    return Boolean(user);
  }
}

/* Usernames follow RegisterDto: 3-32 characters of [a-z0-9_.-]. */
function usernameBase(email: string) {
  const localPart = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '');
  if (!localPart) return 'user';
  const padded = localPart.length >= USERNAME_MIN_LENGTH ? localPart : `${localPart}_user`;
  return padded.slice(0, USERNAME_MAX_LENGTH);
}

/* Accounts created or reclaimed through a provider have no password anyone knows. */
function unusablePasswordHash() {
  return bcrypt.hash(randomBytes(32).toString('base64url'), 12);
}
