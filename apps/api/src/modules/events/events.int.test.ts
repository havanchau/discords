import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import {
  addServerMember,
  createServerWithOwner,
  createTestPrisma,
  createUser,
  RecordingRealtimePublisher,
  resetDatabase,
} from '../../test-support/test-database';
import { EventsService } from './events.service';

const prisma = createTestPrisma();
const events = new EventsService(
  prisma,
  new PermissionsService(prisma),
  new RecordingRealtimePublisher(),
);
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

async function fixture() {
  const owner = await createUser(prisma);
  const member = await createUser(prisma);
  const { server, channel } = await createServerWithOwner(prisma, owner.id);
  await addServerMember(prisma, server.id, member.id);
  return { owner, member, server, channel };
}

describe('EventsService', () => {
  before(() => prisma.$connect());
  after(() => prisma.$disconnect());
  beforeEach(() => resetDatabase(prisma));

  it('lets managers create events that members can list', async () => {
    const { owner, member, server, channel } = await fixture();

    await events.create(owner.id, server.id, {
      name: 'Game night',
      channelId: channel.id,
      startAt: inMinutes(30),
    });
    const { events: listed } = await events.list(member.id, server.id);

    assert.deepEqual(
      listed.map((event) => [event.name, event.status, event.interestedCount]),
      [['Game night', 'SCHEDULED', 0]],
    );
  });

  it('refuses members without MANAGE_SERVER', async () => {
    const { member, server } = await fixture();

    await assert.rejects(
      events.create(member.id, server.id, { name: 'Nope', startAt: inMinutes(30) }),
      ForbiddenException,
    );
  });

  it('validates event times', async () => {
    const { owner, server } = await fixture();

    await assert.rejects(
      events.create(owner.id, server.id, { name: 'Past', startAt: inMinutes(-60) }),
      BadRequestException,
    );
    await assert.rejects(
      events.create(owner.id, server.id, {
        name: 'Backwards',
        startAt: inMinutes(60),
        endAt: inMinutes(30),
      }),
      BadRequestException,
    );
  });

  it('refuses a channel from another server', async () => {
    const { owner, server } = await fixture();
    const { channel: foreignChannel } = await createServerWithOwner(prisma, owner.id);

    await assert.rejects(
      events.create(owner.id, server.id, {
        name: 'Elsewhere',
        channelId: foreignChannel.id,
        startAt: inMinutes(30),
      }),
      NotFoundException,
    );
  });

  it('hides events in private channels from members who cannot view them', async () => {
    const { owner, member, server } = await fixture();
    const secret = await prisma.channel.create({
      data: { serverId: server.id, name: 'secret', isPrivate: true },
    });
    await events.create(owner.id, server.id, {
      name: 'Mods sync',
      channelId: secret.id,
      startAt: inMinutes(30),
    });

    assert.equal((await events.list(member.id, server.id)).events.length, 0);
    assert.equal((await events.list(owner.id, server.id)).events.length, 1);
  });

  it('tracks interest per member and drops cancelled events from the list', async () => {
    const { owner, member, server } = await fixture();
    const { event } = await events.create(owner.id, server.id, {
      name: 'Launch',
      startAt: inMinutes(30),
    });

    await events.setInterest(member.id, event.id, true);
    const { interestedCount } = await events.setInterest(owner.id, event.id, true);
    const [memberView] = (await events.list(member.id, server.id)).events;
    await events.cancel(owner.id, event.id);

    assert.equal(interestedCount, 2);
    assert.equal(memberView.interested, true);
    assert.equal((await events.list(member.id, server.id)).events.length, 0);
    await assert.rejects(events.setInterest(member.id, event.id, true), BadRequestException);
  });
});
