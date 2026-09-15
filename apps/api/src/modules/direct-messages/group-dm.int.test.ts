import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  befriend,
  createTestPrisma,
  createUser,
  RecordingRealtimePublisher,
  resetDatabase,
} from '../../test-support/test-database';
import { DirectConversationsService } from './direct-conversations.service';
import { DirectMessagesService } from './direct-messages.service';

const prisma = createTestPrisma();
const publisher = new RecordingRealtimePublisher();
const notifications = new NotificationsService(prisma, publisher);
const friends = new FriendsService(prisma, notifications, publisher);
const conversations = new DirectConversationsService(prisma, publisher);
const directMessages = new DirectMessagesService(prisma, publisher, notifications);

async function ownerWithFriends(count: number) {
  const owner = await createUser(prisma);
  const others = [];
  for (let index = 0; index < count; index += 1) {
    const friend = await createUser(prisma);
    await befriend(prisma, owner.id, friend.id);
    others.push(friend);
  }
  return { owner, others };
}

describe('DirectConversationsService groups', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  it('creates a group with friends and notifies every member', async () => {
    const { owner, others } = await ownerWithFriends(2);

    const { conversation } = await conversations.createGroup(owner.id, {
      userIds: others.map((user) => user.id),
      name: ' Weekend ',
    });

    assert.equal(conversation.isGroup, true);
    assert.equal(conversation.name, 'Weekend');
    assert.equal(conversation.members.length, 2);
    const event = publisher.emitted.find((item) => item.event === 'dm:conversation-updated');
    assert.equal(event?.rooms.length, 3);
  });

  it('refuses users who are not friends', async () => {
    const { owner, others } = await ownerWithFriends(1);
    const stranger = await createUser(prisma);

    await assert.rejects(
      conversations.createGroup(owner.id, { userIds: [others[0].id, stranger.id] }),
      ForbiddenException,
    );
  });

  it('refuses adding members beyond the size limit', async () => {
    const { owner, others } = await ownerWithFriends(10);
    const { conversation } = await conversations.createGroup(owner.id, {
      userIds: others.slice(0, 9).map((user) => user.id),
    });

    await assert.rejects(
      conversations.addMember(owner.id, conversation.id, { userId: others[9].id }),
      BadRequestException,
    );
  });

  it('only lets the owner remove other members', async () => {
    const { owner, others } = await ownerWithFriends(2);
    const { conversation } = await conversations.createGroup(owner.id, {
      userIds: others.map((user) => user.id),
    });

    await assert.rejects(
      conversations.removeMember(others[0].id, conversation.id, others[1].id),
      ForbiddenException,
    );
  });

  it('transfers ownership to the longest-standing member when the owner leaves', async () => {
    const { owner, others } = await ownerWithFriends(2);
    const { conversation } = await conversations.createGroup(owner.id, {
      userIds: others.map((user) => user.id),
    });
    await prisma.directConversationMember.update({
      where: { conversationId_userId: { conversationId: conversation.id, userId: others[1].id } },
      data: { joinedAt: new Date(Date.now() - 60_000) },
    });

    await conversations.removeMember(owner.id, conversation.id, owner.id);

    const updated = await prisma.directConversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    assert.equal(updated.ownerId, others[1].id);
  });

  it('deletes the group when the last member leaves', async () => {
    const { owner, others } = await ownerWithFriends(2);
    const { conversation } = await conversations.createGroup(owner.id, {
      userIds: others.map((user) => user.id),
    });

    await conversations.removeMember(owner.id, conversation.id, owner.id);
    await conversations.removeMember(others[0].id, conversation.id, others[0].id);
    await conversations.removeMember(others[1].id, conversation.id, others[1].id);

    assert.equal(await prisma.directConversation.count(), 0);
  });

  it('never returns a group when opening a 1-1 DM', async () => {
    const { owner, others } = await ownerWithFriends(2);
    const { conversation: group } = await conversations.createGroup(owner.id, {
      userIds: others.map((user) => user.id),
    });

    const { conversation: direct } = await friends.startDm(owner.id, others[0].id);

    assert.notEqual(direct.id, group.id);
    assert.equal(direct.isGroup, false);
  });

  it('lets group members send even when two of them blocked each other', async () => {
    const { owner, others } = await ownerWithFriends(2);
    const { conversation } = await conversations.createGroup(owner.id, {
      userIds: others.map((user) => user.id),
    });
    await friends.block(others[0].id, others[1].id);

    const { message } = await directMessages.createMessage(others[1].id, conversation.id, {
      content: 'still in the group',
    });

    assert.equal(message.content, 'still in the group');
  });
});
