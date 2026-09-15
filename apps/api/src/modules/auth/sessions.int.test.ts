import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  createTestPrisma,
  createUser,
  RecordingRealtimePublisher,
  resetDatabase,
} from '../../test-support/test-database';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionsService } from './sessions.service';

const prisma = createTestPrisma();
const sessions = new SessionsService(prisma, new RecordingRealtimePublisher());
const jwt = new JwtService({ secret: 'test-secret' });
const guard = new JwtAuthGuard(jwt, prisma);

function createSession(userId: string, overrides: { revokedAt?: Date; expiresAt?: Date } = {}) {
  return prisma.session.create({
    data: {
      userId,
      refreshHash: 'hash',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
      revokedAt: overrides.revokedAt,
    },
  });
}

function httpContext(token: string) {
  const request = { headers: { authorization: `Bearer ${token}` } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionsService', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  it('lists only the caller’s active sessions and marks the current one', async () => {
    const user = await createUser(prisma);
    const other = await createUser(prisma);
    const current = await createSession(user.id);
    await createSession(user.id, { revokedAt: new Date() });
    await createSession(user.id, { expiresAt: new Date(Date.now() - 1000) });
    await createSession(other.id);

    const { sessions: listed } = await sessions.list(user.id, current.id);

    assert.deepEqual(
      listed.map((session) => [session.id, session.current]),
      [[current.id, true]],
    );
  });

  it('refuses revoking another user’s session with 404', async () => {
    const user = await createUser(prisma);
    const other = await createUser(prisma);
    const current = await createSession(user.id);
    const foreign = await createSession(other.id);

    await assert.rejects(sessions.revoke(user.id, current.id, foreign.id), NotFoundException);
  });

  it('revokes every other session and keeps the current one', async () => {
    const user = await createUser(prisma);
    const current = await createSession(user.id);
    await createSession(user.id);
    await createSession(user.id);

    const { revoked } = await sessions.revokeOthers(user.id, current.id);

    assert.equal(revoked, 2);
    assert.equal(await prisma.session.count({ where: { userId: user.id, revokedAt: null } }), 1);
  });

  it('makes the guard reject an access token of a revoked session', async () => {
    const user = await createUser(prisma);
    const session = await createSession(user.id);
    const token = await jwt.signAsync({ sub: user.id, sid: session.id });
    assert.equal(await guard.canActivate(httpContext(token)), true);

    await sessions.revoke(user.id, session.id, session.id);

    await assert.rejects(guard.canActivate(httpContext(token)), UnauthorizedException);
  });

  it('makes the guard reject signed tokens without a session id', async () => {
    const user = await createUser(prisma);
    await createSession(user.id);
    const token = await jwt.signAsync({ sub: user.id, purpose: '2fa-login' });

    await assert.rejects(guard.canActivate(httpContext(token)), UnauthorizedException);
  });
});
