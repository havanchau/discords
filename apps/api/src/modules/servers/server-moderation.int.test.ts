import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelsService } from '../channels/channels.service';
import { MessagesService } from '../messages/messages.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PushService } from '../push/push.service';
import {
  addServerMember,
  createServerWithOwner,
  createTestPrisma,
  createUser,
  grantServerPermissions,
  RecordingRealtimePublisher,
  resetDatabase,
} from '../../test-support/test-database';
import { ServerModerationService } from './server-moderation.service';
import { ServersService } from './servers.service';

const prisma = createTestPrisma();
const publisher = new RecordingRealtimePublisher();
const permissions = new PermissionsService(prisma);
const servers = new ServersService(prisma, permissions);
const channels = new ChannelsService(prisma, servers, permissions);
const messages = new MessagesService(
  prisma,
  channels,
  permissions,
  new PushService(prisma, new ConfigService({})),
  publisher,
);
const moderation = new ServerModerationService(prisma, permissions, publisher);

async function serverFixture() {
  const owner = await createUser(prisma);
  const member = await createUser(prisma);
  const { server, channel } = await createServerWithOwner(prisma, owner.id);
  const membership = await addServerMember(prisma, server.id, member.id);
  const invite = await prisma.invite.create({
    data: { code: `code-${Date.now()}`, serverId: server.id, creatorId: owner.id, maxUses: 10 },
  });
  return { owner, member, server, channel, membership, invite };
}

describe('ServerModerationService', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  describe('bans', () => {
    it('removes the membership, records the ban, and announces the removal', async () => {
      const { owner, member, server } = await serverFixture();

      await moderation.ban(owner.id, server.id, { userId: member.id, reason: ' spam ' });

      assert.equal(await prisma.serverMember.count({ where: { userId: member.id } }), 0);
      const ban = await prisma.serverBan.findFirstOrThrow();
      assert.equal(ban.reason, 'spam');
      const event = publisher.emitted.find((item) => item.event === 'server:member-removed');
      assert.deepEqual(event?.payload, { serverId: server.id, userId: member.id, reason: 'BAN' });
      assert.equal(await prisma.auditLog.count({ where: { action: 'MEMBER_BAN' } }), 1);
    });

    it('refuses invite joins for banned users without consuming a use', async () => {
      const { owner, member, server, invite } = await serverFixture();
      await moderation.ban(owner.id, server.id, { userId: member.id });

      await assert.rejects(servers.joinInvite(member.id, invite.code), /banned from this server/);

      const unchanged = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } });
      assert.equal(unchanged.usedCount, 0);
    });

    it('refuses banning the owner or yourself', async () => {
      const { owner, member, server, membership } = await serverFixture();
      await grantServerPermissions(prisma, server.id, membership.id, ['BAN_MEMBERS']);

      await assert.rejects(
        moderation.ban(member.id, server.id, { userId: owner.id }),
        ForbiddenException,
      );
      await assert.rejects(
        moderation.ban(member.id, server.id, { userId: member.id }),
        ForbiddenException,
      );
    });

    it('refuses members without BAN_MEMBERS', async () => {
      const { owner, member, server } = await serverFixture();

      await assert.rejects(
        moderation.ban(member.id, server.id, { userId: owner.id }),
        ForbiddenException,
      );
    });

    it('lets an unbanned user join again', async () => {
      const { owner, member, server, invite } = await serverFixture();
      await moderation.ban(owner.id, server.id, { userId: member.id });

      await moderation.unban(owner.id, server.id, member.id);
      const { joinedNow } = await servers.joinInvite(member.id, invite.code);

      assert.equal(joinedNow, true);
    });
  });

  describe('timeouts', () => {
    it('blocks messages and reactions until cleared', async () => {
      const { owner, member, server, channel, membership } = await serverFixture();
      const { message } = await messages.createMessage(owner.id, channel.id, { content: 'hi' });

      await moderation.timeout(owner.id, server.id, membership.id, { durationMinutes: 10 });

      await assert.rejects(
        messages.createMessage(member.id, channel.id, { content: 'let me talk' }),
        /timed out until/,
      );
      await assert.rejects(
        messages.toggleReaction(member.id, message.id, { emoji: '👍' }),
        /timed out until/,
      );

      await moderation.timeout(owner.id, server.id, membership.id, { durationMinutes: 0 });
      const { message: allowed } = await messages.createMessage(member.id, channel.id, {
        content: 'back',
      });
      assert.equal(allowed.content, 'back');
    });

    it('refuses timing out the owner', async () => {
      const { owner, server } = await serverFixture();
      const ownerMember = await prisma.serverMember.findFirstOrThrow({
        where: { serverId: server.id, userId: owner.id },
      });
      const moderator = await createUser(prisma);
      const moderatorMember = await addServerMember(prisma, server.id, moderator.id);
      await grantServerPermissions(prisma, server.id, moderatorMember.id, ['KICK_MEMBERS']);

      await assert.rejects(
        moderation.timeout(moderator.id, server.id, ownerMember.id, { durationMinutes: 10 }),
        ForbiddenException,
      );
    });
  });

  describe('slowmode', () => {
    it('refuses a second message inside the window and lets managers bypass it', async () => {
      const { owner, member, server, channel, membership } = await serverFixture();
      await prisma.channel.update({ where: { id: channel.id }, data: { slowmodeSeconds: 60 } });

      await messages.createMessage(member.id, channel.id, { content: 'one' });
      await assert.rejects(
        messages.createMessage(member.id, channel.id, { content: 'two' }),
        (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
      );

      await messages.createMessage(owner.id, channel.id, { content: 'owner one' });
      await messages.createMessage(owner.id, channel.id, { content: 'owner two' });
      await grantServerPermissions(prisma, server.id, membership.id, ['MANAGE_MESSAGES']);
      const { message } = await messages.createMessage(member.id, channel.id, { content: 'mod' });
      assert.equal(message.content, 'mod');
    });
  });
});
