import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  befriend,
  createTestPrisma,
  createUser,
  RecordingRealtimePublisher,
  resetDatabase,
} from '../../test-support/test-database';
import { DirectMessageActionsService } from './direct-message-actions.service';
import { DirectMessagesService } from './direct-messages.service';

const prisma = createTestPrisma();
const publisher = new RecordingRealtimePublisher();
const notifications = new NotificationsService(prisma, publisher);
const friends = new FriendsService(prisma, notifications, publisher);
const directMessages = new DirectMessagesService(prisma, publisher, notifications);
const actions = new DirectMessageActionsService(prisma, publisher);

async function conversationFixture() {
  const alice = await createUser(prisma);
  const bob = await createUser(prisma);
  await befriend(prisma, alice.id, bob.id);
  const { conversation } = await friends.startDm(alice.id, bob.id);
  const { message } = await directMessages.createMessage(alice.id, conversation.id, {
    content: 'hello',
  });
  return { alice, bob, conversation, message };
}

describe('DirectMessageActionsService', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  it('lets only the author edit and emits dm:updated', async () => {
    const { alice, bob, message } = await conversationFixture();

    await assert.rejects(
      actions.updateMessage(bob.id, message.id, { content: 'hijack' }),
      ForbiddenException,
    );
    const { message: edited } = await actions.updateMessage(alice.id, message.id, {
      content: ' edited ',
    });

    assert.equal(edited.content, 'edited');
    assert.ok(edited.editedAt);
    assert.equal(publisher.emitted.at(-1)?.event, 'dm:updated');
  });

  it('soft deletes, clears the pin, and is idempotent', async () => {
    const { alice, message } = await conversationFixture();
    await actions.togglePin(alice.id, message.id);

    await actions.deleteMessage(alice.id, message.id);
    const { message: deletedAgain } = await actions.deleteMessage(alice.id, message.id);

    assert.equal(deletedAgain.content, '');
    assert.ok(deletedAgain.deletedAt);
    assert.equal(deletedAgain.pinnedAt, null);
  });

  it('refuses a reply target from another conversation', async () => {
    const { alice, conversation } = await conversationFixture();
    const carol = await createUser(prisma);
    await befriend(prisma, alice.id, carol.id);
    const { conversation: other } = await friends.startDm(alice.id, carol.id);
    const { message: foreign } = await directMessages.createMessage(alice.id, other.id, {
      content: 'elsewhere',
    });

    await assert.rejects(
      directMessages.createMessage(alice.id, conversation.id, {
        content: 'reply',
        replyToMessageId: foreign.id,
      }),
      NotFoundException,
    );
  });

  it('includes a reply preview', async () => {
    const { bob, conversation, message } = await conversationFixture();

    const { message: reply } = await directMessages.createMessage(bob.id, conversation.id, {
      content: 'reply',
      replyToMessageId: message.id,
    });

    assert.equal(reply.replyToMessage?.id, message.id);
    assert.equal(reply.replyToMessage?.content, 'hello');
  });

  it('toggles reactions and aggregates user ids', async () => {
    const { alice, bob, message } = await conversationFixture();

    await actions.toggleReaction(alice.id, message.id, { emoji: '🔥' });
    const { message: both } = await actions.toggleReaction(bob.id, message.id, { emoji: '🔥' });
    const { message: one } = await actions.toggleReaction(alice.id, message.id, { emoji: '🔥' });

    assert.deepEqual(both.reactions, [{ emoji: '🔥', count: 2, userIds: [alice.id, bob.id] }]);
    assert.deepEqual(one.reactions, [{ emoji: '🔥', count: 1, userIds: [bob.id] }]);
  });

  it('enforces the pin limit', async () => {
    const { alice, conversation } = await conversationFixture();
    await prisma.directMessage.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        conversationId: conversation.id,
        authorId: alice.id,
        content: `pinned ${index}`,
        pinnedAt: new Date(),
      })),
    });
    const { message } = await directMessages.createMessage(alice.id, conversation.id, {
      content: 'one more',
    });

    await assert.rejects(actions.togglePin(alice.id, message.id), /Pin limit reached/);
  });

  it('hides messages from non-members with 404', async () => {
    const { message } = await conversationFixture();
    const mallory = await createUser(prisma);

    await assert.rejects(
      actions.toggleReaction(mallory.id, message.id, { emoji: '👀' }),
      NotFoundException,
    );
  });
});
