import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import {
  createTestPrisma,
  createUser,
  RecordingRealtimePublisher,
  resetDatabase,
} from '../../test-support/test-database';
import { EmailService } from './email.service';
import { FORGOT_PASSWORD_RESPONSE, PasswordResetService } from './password-reset.service';

class CapturingEmailService extends EmailService {
  readonly resetTokens: string[] = [];

  constructor() {
    super(new ConfigService({}));
  }

  override async sendPasswordResetEmail(_email: string, token: string) {
    this.resetTokens.push(token);
    return { sent: true };
  }
}

const prisma = createTestPrisma();
const email = new CapturingEmailService();
const passwordReset = new PasswordResetService(prisma, email, new RecordingRealtimePublisher());
const NEW_PASSWORD = 'N3w-Passw0rd!';

describe('PasswordResetService', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(async () => {
    await resetDatabase(prisma);
    email.resetTokens.length = 0;
  });

  it('answers the same way for unknown emails without creating a token', async () => {
    const response = await passwordReset.requestReset('nobody@example.test');

    assert.deepEqual(response, FORGOT_PASSWORD_RESPONSE);
    assert.equal(await prisma.passwordResetToken.count(), 0);
    assert.equal(email.resetTokens.length, 0);
  });

  it('stores only a hash of the emailed token', async () => {
    const user = await createUser(prisma);

    await passwordReset.requestReset(user.email.toUpperCase());

    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    assert.equal(email.resetTokens.length, 1);
    assert.notEqual(stored.tokenHash, email.resetTokens[0]);
  });

  it('resets the password once and revokes every session', async () => {
    const user = await createUser(prisma);
    await prisma.session.create({
      data: { userId: user.id, refreshHash: 'x', expiresAt: new Date(Date.now() + 60_000) },
    });
    await passwordReset.requestReset(user.email);
    const [token] = email.resetTokens;

    await passwordReset.resetPassword(token, NEW_PASSWORD);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(await bcrypt.compare(NEW_PASSWORD, updated.passwordHash), true);
    assert.equal(await prisma.session.count({ where: { userId: user.id, revokedAt: null } }), 0);
    await assert.rejects(passwordReset.resetPassword(token, NEW_PASSWORD), BadRequestException);
  });

  it('invalidates an older token when a new one is requested', async () => {
    const user = await createUser(prisma);
    await passwordReset.requestReset(user.email);
    await passwordReset.requestReset(user.email);
    const [olderToken, newerToken] = email.resetTokens;

    await assert.rejects(
      passwordReset.resetPassword(olderToken, NEW_PASSWORD),
      BadRequestException,
    );
    await passwordReset.resetPassword(newerToken, NEW_PASSWORD);
  });

  it('refuses an expired token', async () => {
    const user = await createUser(prisma);
    await passwordReset.requestReset(user.email);
    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await assert.rejects(
      passwordReset.resetPassword(email.resetTokens[0], NEW_PASSWORD),
      BadRequestException,
    );
  });
});
