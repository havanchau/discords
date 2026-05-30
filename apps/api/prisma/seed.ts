import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Demo@123456', 12);

  const demo = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      username: 'demo',
      displayName: 'Demo User',
      passwordHash
    }
  });

  const teammate = await prisma.user.upsert({
    where: { email: 'teammate@example.com' },
    update: {},
    create: {
      email: 'teammate@example.com',
      username: 'teammate',
      displayName: 'Team Mate',
      passwordHash
    }
  });

  const existingServer = await prisma.server.findFirst({
    where: { name: 'Demo Workspace', ownerId: demo.id }
  });

  if (existingServer) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const server = await tx.server.create({
      data: {
        name: 'Demo Workspace',
        description: 'Seeded Discord clone workspace',
        ownerId: demo.id
      }
    });

    const role = await tx.role.create({
      data: {
        serverId: server.id,
        name: '@everyone',
        permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'CREATE_INVITE']
      }
    });

    const owner = await tx.serverMember.create({
      data: {
        userId: demo.id,
        serverId: server.id,
        kind: 'OWNER'
      }
    });

    const member = await tx.serverMember.create({
      data: {
        userId: teammate.id,
        serverId: server.id
      }
    });

    await tx.memberRole.createMany({
      data: [
        { memberId: owner.id, roleId: role.id },
        { memberId: member.id, roleId: role.id }
      ]
    });

    const general = await tx.channel.create({
      data: {
        serverId: server.id,
        name: 'general',
        type: 'TEXT',
        position: 0
      }
    });

    await tx.channel.create({
      data: {
        serverId: server.id,
        name: 'voice-lobby',
        type: 'VOICE',
        position: 1
      }
    });

    await tx.message.createMany({
      data: [
        {
          serverId: server.id,
          channelId: general.id,
          authorId: demo.id,
          content: 'Welcome to the Discord clone MVP.'
        },
        {
          serverId: server.id,
          channelId: general.id,
          authorId: teammate.id,
          content: 'Realtime messaging is ready to test with two browser sessions.'
        }
      ]
    });

    await tx.invite.create({
      data: {
        code: 'demo-invite',
        serverId: server.id,
        channelId: general.id,
        creatorId: demo.id
      }
    });
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
