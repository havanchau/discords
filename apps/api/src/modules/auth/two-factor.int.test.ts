import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { BadRequestException, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createTestPrisma, createUser, resetDatabase } from '../../test-support/test-database';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { base32Decode, generateTotp, totpStep } from './totp';
import { TwoFactorChallengeService } from './two-factor-challenge.service';
import { TwoFactorService } from './two-factor.service';

const PASSWORD = 'Str0ng!Pass';
const config = new ConfigService({ JWT_SECRET: 'test-jwt-secret' });
const jwt = new JwtService({ secret: 'test-jwt-secret', signOptions: { expiresIn: '15m' } });
const prisma = createTestPrisma();
const challenges = new TwoFactorChallengeService(jwt, config);
const auth = new AuthService(prisma, jwt, config, new EmailService(config), challenges);
const twoFactor = new TwoFactorService(prisma, auth, challenges, config);
const guard = new JwtAuthGuard(jwt, prisma);

function codeFor(secret: string, offsetSteps = 0) {
  return generateTotp(base32Decode(secret), totpStep(Date.now()) + offsetSteps);
}

async function userWithPassword() {
  const user = await createUser(prisma);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
  return user;
}

async function enabledUser() {
  const user = await userWithPassword();
  const { secret } = await twoFactor.setup(user.id);
  // Enabling consumes the previous step so the login test can use the current one.
  const { recoveryCodes } = await twoFactor.enable(user.id, codeFor(secret, -1));
  return { user, secret, recoveryCodes };
}

describe('TwoFactorService', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  it('stores the secret sealed, never in plain text', async () => {
    const user = await userWithPassword();
    const { secret } = await twoFactor.setup(user.id);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(stored.twoFactorPendingSecret);
    assert.ok(!stored.twoFactorPendingSecret.includes(secret));
  });

  it('only enables with a valid code', async () => {
    const user = await userWithPassword();
    await twoFactor.setup(user.id);

    await assert.rejects(twoFactor.enable(user.id, '000000'), BadRequestException);
    assert.equal((await twoFactor.status(user.id)).enabled, false);
  });

  it('returns a challenge instead of tokens once enabled, then signs in with a code', async () => {
    const { user, secret } = await enabledUser();

    const login = await auth.login({ email: user.email, password: PASSWORD });
    assert.ok('twoFactorRequired' in login && login.twoFactorRequired);

    const session = await twoFactor.verifyLogin(login.challengeToken, codeFor(secret));
    assert.ok('accessToken' in session);
  });

  it('refuses replaying a code that was already used', async () => {
    const { user, secret } = await enabledUser();
    const login = await auth.login({ email: user.email, password: PASSWORD });
    assert.ok('challengeToken' in login);
    const code = codeFor(secret);

    await twoFactor.verifyLogin(login.challengeToken, code);

    await assert.rejects(twoFactor.verifyLogin(login.challengeToken, code), UnauthorizedException);
  });

  it('accepts each recovery code once', async () => {
    const { user, recoveryCodes } = await enabledUser();
    const login = await auth.login({ email: user.email, password: PASSWORD });
    assert.ok('challengeToken' in login);

    await twoFactor.verifyLogin(login.challengeToken, recoveryCodes[0].toUpperCase());

    await assert.rejects(
      twoFactor.verifyLogin(login.challengeToken, recoveryCodes[0]),
      UnauthorizedException,
    );
    assert.equal((await twoFactor.status(user.id)).recoveryCodesRemaining, 9);
  });

  it('never lets the challenge token authenticate a request', async () => {
    const { user } = await enabledUser();
    await auth.createSession(user.id);
    const login = await auth.login({ email: user.email, password: PASSWORD });
    assert.ok('challengeToken' in login);
    const request = { headers: { authorization: `Bearer ${login.challengeToken}` } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await assert.rejects(guard.canActivate(context), UnauthorizedException);
  });

  it('requires the password and a valid code to disable', async () => {
    const { user, secret } = await enabledUser();

    await assert.rejects(
      twoFactor.disable(user.id, 'wrong-password', codeFor(secret)),
      BadRequestException,
    );
    await twoFactor.disable(user.id, PASSWORD, codeFor(secret));

    assert.equal((await twoFactor.status(user.id)).enabled, false);
    assert.equal(await prisma.twoFactorRecoveryCode.count(), 0);
  });
});
