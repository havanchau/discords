import { PrismaService } from '../modules/prisma/prisma.service';
import { RealtimePublisher } from '../modules/realtime/realtime-publisher.service';
import { assertDisposableDatabaseUrl } from './disposable-database';

/*
 * Integration tests run against a real Postgres database named by TEST_DATABASE_URL. Every test
 * truncates all tables, so the URL must point at a disposable database (see disposable-database).
 */
export function createTestPrisma() {
  const url = process.env.TEST_DATABASE_URL;
  assertDisposableDatabaseUrl(url);
  process.env.DATABASE_URL = url;
  return new PrismaService();
}

export async function resetDatabase(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (!tables.length) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** A publisher with no Socket.IO server attached records emits instead of sending them. */
export class RecordingRealtimePublisher extends RealtimePublisher {
  readonly emitted: Array<{ rooms: string[]; event: string; payload: unknown }> = [];

  override emitToRoom(room: string, event: string, payload: unknown) {
    this.emitted.push({ rooms: [room], event, payload });
  }

  override emitToRooms(rooms: string[], event: string, payload: unknown) {
    this.emitted.push({ rooms, event, payload });
  }
}

let userSequence = 0;

export function createUser(prisma: PrismaService, overrides: { username?: string } = {}) {
  userSequence += 1;
  const username = overrides.username ?? `user${userSequence}${Date.now().toString(36)}`;
  return prisma.user.create({
    data: {
      email: `${username}@example.test`,
      username,
      displayName: username,
      passwordHash: 'not-a-real-hash',
      emailVerifiedAt: new Date(),
    },
  });
}

export function befriend(prisma: PrismaService, requesterId: string, receiverId: string) {
  return prisma.friendRequest.create({ data: { requesterId, receiverId, status: 'ACCEPTED' } });
}

export async function createServerWithOwner(prisma: PrismaService, ownerId: string) {
  const server = await prisma.server.create({
    data: {
      name: `server-${Date.now().toString(36)}`,
      ownerId,
      roles: {
        create: {
          name: '@everyone',
          permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'CREATE_INVITE'],
        },
      },
      channels: { create: { name: 'general', type: 'TEXT' } },
    },
    include: { roles: true, channels: true },
  });
  await addServerMember(prisma, server.id, ownerId, 'OWNER');
  return { server, everyoneRole: server.roles[0], channel: server.channels[0] };
}

export async function addServerMember(
  prisma: PrismaService,
  serverId: string,
  userId: string,
  kind: 'OWNER' | 'MEMBER' = 'MEMBER',
) {
  const everyoneRole = await prisma.role.findUniqueOrThrow({
    where: { serverId_name: { serverId, name: '@everyone' } },
  });
  return prisma.serverMember.create({
    data: { serverId, userId, kind, roles: { create: { roleId: everyoneRole.id } } },
  });
}

export async function grantServerPermissions(
  prisma: PrismaService,
  serverId: string,
  memberId: string,
  permissions: string[],
) {
  const role = await prisma.role.create({
    data: { serverId, name: `role-${Date.now().toString(36)}`, permissions },
  });
  await prisma.memberRole.create({ data: { memberId, roleId: role.id } });
  return role;
}
