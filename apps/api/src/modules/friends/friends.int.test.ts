import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { DirectMessagesService } from '../direct-messages/direct-messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  befriend,
  createTestPrisma,
  createUser,
  RecordingRealtimePublisher,
  resetDatabase,
} from '../../test-support/test-database';
import { FriendsService } from './friends.service';

const prisma = createTestPrisma();
const publisher = new RecordingRealtimePublisher();
const notifications = new NotificationsService(prisma, publisher);
const friends = new FriendsService(prisma, notifications, publisher);
const directMessages = new DirectMessagesService(prisma, publisher, notifications);

describe('FriendsService blocking', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  it('removes the friendship and lists the block for the blocker only', async () => {
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);
    await befriend(prisma, alice.id, bob.id);

    await friends.block(alice.id, bob.id);

    const aliceView = await friends.list(alice.id);
    const bobView = await friends.list(bob.id);
    assert.equal(aliceView.friends.length, 0);
    assert.deepEqual(
      aliceView.blocked.map((entry) => entry.user.id),
      [bob.id],
    );
    assert.equal(bobView.friends.length, 0);
    assert.equal(bobView.blocked.length, 0);
  });

  it('is idempotent', async () => {
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);

    await friends.block(alice.id, bob.id);
    await friends.block(alice.id, bob.id);

    assert.equal(await prisma.userBlock.count(), 1);
  });

  it('refuses blocking yourself', async () => {
    const alice = await createUser(prisma);

    await assert.rejects(friends.block(alice.id, alice.id), /Cannot block yourself/);
  });

  it('does not let the blocked user remove the block', async () => {
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);
    await friends.block(alice.id, bob.id);

    await friends.unblock(bob.id, alice.id);

    assert.equal(await prisma.userBlock.count(), 1);
  });

  it('refuses friend requests in both directions while a block exists', async () => {
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);
    await friends.block(alice.id, bob.id);

    await assert.rejects(
      friends.request(bob.id, { usernameOrEmail: alice.username }),
      ForbiddenException,
    );
    await assert.rejects(
      friends.request(alice.id, { usernameOrEmail: bob.username }),
      ForbiddenException,
    );
  });

  it('refuses sending in an existing 1-1 conversation after a block', async () => {
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);
    await befriend(prisma, alice.id, bob.id);
    const { conversation } = await friends.startDm(alice.id, bob.id);
    await friends.block(bob.id, alice.id);

    await assert.rejects(
      directMessages.createMessage(alice.id, conversation.id, { content: 'hi' }),
      /You cannot message this user/,
    );
  });

  it('turns a legacy BLOCKED response into a block by the caller', async () => {
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);
    const request = await prisma.friendRequest.create({
      data: { requesterId: bob.id, receiverId: alice.id },
    });

    await friends.respond(bob.id, request.id, { status: 'BLOCKED' });

    const block = await prisma.userBlock.findFirstOrThrow();
    assert.equal(block.blockerId, bob.id);
    assert.equal(block.blockedId, alice.id);
    assert.equal(await prisma.friendRequest.count(), 0);
  });

  it('allows a new friend request after unblocking', async () => {
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);
    await friends.block(alice.id, bob.id);
    await friends.unblock(alice.id, bob.id);

    const { request } = await friends.request(bob.id, { usernameOrEmail: alice.username });

    assert.equal(request.status, 'PENDING');
  });
});
