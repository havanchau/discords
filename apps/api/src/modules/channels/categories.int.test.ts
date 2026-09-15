import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { ServersService } from '../servers/servers.service';
import {
  addServerMember,
  createServerWithOwner,
  createTestPrisma,
  createUser,
  resetDatabase,
} from '../../test-support/test-database';
import { CategoriesService } from './categories.service';
import { ChannelsService } from './channels.service';

const prisma = createTestPrisma();
const permissions = new PermissionsService(prisma);
const servers = new ServersService(prisma, permissions);
const channels = new ChannelsService(prisma, servers, permissions);
const categories = new CategoriesService(prisma, permissions);

async function fixture() {
  const owner = await createUser(prisma);
  const member = await createUser(prisma);
  const { server } = await createServerWithOwner(prisma, owner.id);
  await addServerMember(prisma, server.id, member.id);
  return { owner, member, server };
}

describe('CategoriesService', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  it('refuses members without MANAGE_CHANNELS', async () => {
    const { member, server } = await fixture();

    await assert.rejects(
      categories.createCategory(member.id, server.id, { name: 'Community' }),
      ForbiddenException,
    );
  });

  it('refuses a category from another server', async () => {
    const { owner, server } = await fixture();
    const { server: otherServer } = await createServerWithOwner(prisma, owner.id);
    const { category } = await categories.createCategory(owner.id, otherServer.id, {
      name: 'Elsewhere',
    });

    await assert.rejects(
      channels.createChannel(owner.id, server.id, { name: 'misplaced', categoryId: category.id }),
      NotFoundException,
    );
  });

  it('moves channels to uncategorized when their category is deleted', async () => {
    const { owner, server } = await fixture();
    const { category } = await categories.createCategory(owner.id, server.id, { name: 'Voice' });
    const { channel } = await channels.createChannel(owner.id, server.id, {
      name: 'lounge',
      categoryId: category.id,
    });

    await categories.deleteCategory(owner.id, category.id);

    const updated = await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } });
    assert.equal(updated.categoryId, null);
  });

  it('removes a channel from its category when categoryId is null', async () => {
    const { owner, server } = await fixture();
    const { category } = await categories.createCategory(owner.id, server.id, { name: 'Voice' });
    const { channel } = await channels.createChannel(owner.id, server.id, {
      name: 'lounge',
      categoryId: category.id,
    });

    const { channel: updated } = await channels.updateChannel(owner.id, channel.id, {
      categoryId: null,
    });

    assert.equal(updated.categoryId, null);
  });

  it('only shows members categories that contain a channel they can view', async () => {
    const { owner, member, server } = await fixture();
    const { category: visible } = await categories.createCategory(owner.id, server.id, {
      name: 'Community',
    });
    const { category: hidden } = await categories.createCategory(owner.id, server.id, {
      name: 'Mods only',
    });
    await categories.createCategory(owner.id, server.id, { name: 'Empty' });
    await channels.createChannel(owner.id, server.id, { name: 'chat', categoryId: visible.id });
    const { channel: secret } = await channels.createChannel(owner.id, server.id, {
      name: 'secret',
      categoryId: hidden.id,
    });
    await prisma.channel.update({ where: { id: secret.id }, data: { isPrivate: true } });

    const memberView = await servers.getServerForUser(member.id, server.id);
    const ownerView = await servers.getServerForUser(owner.id, server.id);

    assert.deepEqual(
      memberView.server.categories.map((category) => category.name),
      ['Community'],
    );
    assert.equal(ownerView.server.categories.length, 3);
  });
});
