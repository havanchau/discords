import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import {
  addServerMember,
  createServerWithOwner,
  createTestPrisma,
  createUser,
  RecordingRealtimePublisher,
  resetDatabase,
} from '../../test-support/test-database';
import { EmojisService, MAX_EMOJIS_PER_SERVER } from './emojis.service';

const prisma = createTestPrisma();
const publisher = new RecordingRealtimePublisher();
const emojis = new EmojisService(prisma, new PermissionsService(prisma), publisher);
const url = '/uploads/00000000-0000-4000-8000-000000000000.png';

async function fixture() {
  const owner = await createUser(prisma);
  const member = await createUser(prisma);
  const { server } = await createServerWithOwner(prisma, owner.id);
  await addServerMember(prisma, server.id, member.id);
  return { owner, member, server };
}

describe('EmojisService', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  it('lets managers create emoji that every member can list', async () => {
    const { owner, member, server } = await fixture();

    await emojis.create(owner.id, server.id, { name: 'party', url });
    const { emojis: listed } = await emojis.list(member.id, server.id);

    assert.deepEqual(
      listed.map((emoji) => emoji.name),
      ['party'],
    );
    assert.equal(publisher.emitted.at(-1)?.event, 'server:emojis-updated');
  });

  it('refuses members without MANAGE_SERVER', async () => {
    const { member, server } = await fixture();

    await assert.rejects(
      emojis.create(member.id, server.id, { name: 'party', url }),
      ForbiddenException,
    );
  });

  it('refuses a duplicate name in the same server', async () => {
    const { owner, server } = await fixture();
    await emojis.create(owner.id, server.id, { name: 'party', url });

    await assert.rejects(
      emojis.create(owner.id, server.id, { name: 'party', url }),
      ConflictException,
    );
  });

  it('enforces the per-server limit', async () => {
    const { owner, server } = await fixture();
    await prisma.serverEmoji.createMany({
      data: Array.from({ length: MAX_EMOJIS_PER_SERVER }, (_, index) => ({
        serverId: server.id,
        name: `emoji_${index}`,
        url,
        creatorId: owner.id,
      })),
    });

    await assert.rejects(
      emojis.create(owner.id, server.id, { name: 'extra', url }),
      /Emoji limit reached/,
    );
  });

  it('refuses deleting an emoji through another server', async () => {
    const { owner, server } = await fixture();
    const { server: otherServer } = await createServerWithOwner(prisma, owner.id);
    const { emoji } = await emojis.create(owner.id, otherServer.id, { name: 'party', url });

    await assert.rejects(emojis.remove(owner.id, server.id, emoji.id), NotFoundException);
  });
});
