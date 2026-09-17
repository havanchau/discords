import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Demo@123456', 12);

  const demo = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: { emailVerifiedAt: new Date() },
    create: {
      email: 'demo@example.com',
      username: 'demo',
      displayName: 'Demo User',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const teammate = await prisma.user.upsert({
    where: { email: 'teammate@example.com' },
    update: { emailVerifiedAt: new Date() },
    create: {
      email: 'teammate@example.com',
      username: 'teammate',
      displayName: 'Team Mate',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  let existingServer = await prisma.server.findFirst({
    where: { name: 'Demo Workspace', ownerId: demo.id },
  });

  if (!existingServer) {
    existingServer = await prisma.$transaction(async (tx) => {
      const server = await tx.server.create({
        data: {
          name: 'Demo Workspace',
          description: 'Seeded Discord clone workspace',
          ownerId: demo.id,
        },
      });

      const role = await tx.role.create({
        data: {
          serverId: server.id,
          name: '@everyone',
          permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'CREATE_INVITE'],
        },
      });

      const owner = await tx.serverMember.create({
        data: {
          userId: demo.id,
          serverId: server.id,
          kind: 'OWNER',
        },
      });

      const member = await tx.serverMember.create({
        data: {
          userId: teammate.id,
          serverId: server.id,
        },
      });

      await tx.memberRole.createMany({
        data: [
          { memberId: owner.id, roleId: role.id },
          { memberId: member.id, roleId: role.id },
        ],
      });

      const general = await tx.channel.create({
        data: {
          serverId: server.id,
          name: 'general',
          type: 'TEXT',
          position: 0,
        },
      });

      await tx.channel.create({
        data: {
          serverId: server.id,
          name: 'voice-lobby',
          type: 'VOICE',
          position: 1,
        },
      });

      await tx.invite.create({
        data: {
          code: 'demo-invite',
          serverId: server.id,
          channelId: general.id,
          creatorId: demo.id,
        },
      });

      return server;
    });
  }

  const general = await prisma.channel.findFirst({
    where: { serverId: existingServer.id, name: 'general' },
  });

  if (general) {
    const existingCount = await prisma.message.count({
      where: { channelId: general.id },
    });

    if (existingCount < 100) {
      const totalToSeed = 120;
      const now = Date.now();
      const sampleTexts = [
        'Hey everyone, testing the lazy loading functionality!',
        'How is the real-time chat performance holding up?',
        'WebSocket connection and state management look solid.',
        'Adding more messages to check cursor pagination.',
        'Did you check the latest update on channel permissions?',
        'Let us verify the infinite scrolling behavior.',
        'React Virtualizer handles large message counts smoothly.',
        'Remember to test both light and dark themes.',
        'Great progress on the Discord clone monorepo!',
        'Testing message reactions and replies in this channel.',
      ];

      const seedMessages = [];
      for (let i = 1; i <= totalToSeed; i++) {
        const authorId = i % 2 === 0 ? demo.id : teammate.id;
        const textIndex = (i - 1) % sampleTexts.length;
        const createdAt = new Date(now - (totalToSeed - i) * 60 * 1000);

        seedMessages.push({
          serverId: existingServer.id,
          channelId: general.id,
          authorId,
          content: `[Seed #${i}] ${sampleTexts[textIndex]}`,
          createdAt,
        });
      }

      await prisma.message.createMany({
        data: seedMessages,
      });
      console.log(`Successfully seeded ${totalToSeed} messages into #${general.name}`);
    }
  }
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
