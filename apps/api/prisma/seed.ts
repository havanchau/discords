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

  // Local dev platform admin (docs/features/platform-report-review.md): `platformRole` is never
  // set by any API endpoint, only by a DB write, this seed, or a one-off maintenance script.
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { platformRole: 'ADMIN', emailVerifiedAt: new Date() },
    create: {
      email: 'admin@example.com',
      username: 'platform-admin',
      displayName: 'Platform Admin',
      passwordHash,
      emailVerifiedAt: new Date(),
      platformRole: 'ADMIN',
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

    // Seed sample reactions on recent messages for testing reactions grouping/counting
    const latestMessages = await prisma.message.findMany({
      where: { channelId: general.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    if (latestMessages.length > 0 && latestMessages[0]) {
      const targetMessageId = latestMessages[0].id;

      // Seed reactions from both demo user and teammate on the same message
      await prisma.messageReaction.deleteMany({
        where: { messageId: targetMessageId },
      });

      await prisma.messageReaction.createMany({
        data: [
          { messageId: targetMessageId, userId: demo.id, emoji: '👍' },
          { messageId: targetMessageId, userId: teammate.id, emoji: '👍' },
          { messageId: targetMessageId, userId: demo.id, emoji: '❤️' },
        ],
        skipDuplicates: true,
      });
      console.log(`Seeded reactions on message ${targetMessageId}: 👍 (2), ❤️ (1)`);
    }

    // Seed sample sticker pack for Demo Workspace
    const existingStickersCount = await prisma.serverSticker.count({
      where: { serverId: existingServer.id },
    });

    if (existingStickersCount === 0) {
      const stickerPacks = [
        {
          name: 'Wumpus Wave',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><defs><linearGradient id="bg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%235865F2"/><stop offset="100%" stop-color="%233B46C4"/></linearGradient></defs><circle cx="60" cy="60" r="54" fill="url(%23bg1)"/><circle cx="45" cy="50" r="6" fill="%23FFF"/><circle cx="75" cy="50" r="6" fill="%23FFF"/><circle cx="46" cy="50" r="3" fill="%232C2F33"/><circle cx="76" cy="50" r="3" fill="%232C2F33"/><path d="M 45 70 Q 60 85 75 70" stroke="%23FFF" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M 85 45 Q 98 30 102 42 Q 95 55 85 52 Z" fill="%23FEE75C"/><circle cx="102" cy="28" r="3" fill="%23FEE75C"/><circle cx="22" cy="35" r="4" fill="%2357F287"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Party Blob',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><defs><linearGradient id="partyBg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23FEE75C"/><stop offset="100%" stop-color="%23FEB139"/></linearGradient></defs><circle cx="60" cy="64" r="48" fill="url(%23partyBg)"/><polygon points="60,10 42,48 78,48" fill="%23EB459E"/><circle cx="60" cy="8" r="5" fill="%235865F2"/><circle cx="46" cy="66" r="5" fill="%232C2F33"/><circle cx="74" cy="66" r="5" fill="%232C2F33"/><path d="M 48 80 Q 60 94 72 80" stroke="%232C2F33" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="20" cy="30" r="4" fill="%2357F287"/><circle cx="100" cy="40" r="5" fill="%23EB459E"/><rect x="25" y="85" width="6" height="6" fill="%235865F2" transform="rotate(25 25 85)"/><rect x="90" y="80" width="6" height="6" fill="%23FEE75C" transform="rotate(40 90 80)"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Cyber Cat',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><defs><linearGradient id="catBg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23EB459E"/><stop offset="100%" stop-color="%23C22575"/></linearGradient></defs><polygon points="28,20 48,50 18,50" fill="%23EB459E"/><polygon points="92,20 102,50 72,50" fill="%23EB459E"/><polygon points="32,26 44,48 24,48" fill="%23FEE75C"/><polygon points="88,26 96,48 76,48" fill="%23FEE75C"/><circle cx="60" cy="68" r="46" fill="url(%23catBg)"/><path d="M 38 56 Q 45 44 52 56 Q 45 68 38 56 Z" fill="%23ED4245"/><path d="M 68 56 Q 75 44 82 56 Q 75 68 68 56 Z" fill="%23ED4245"/><polygon points="60,72 54,66 66,66" fill="%23FFF"/><path d="M 52 78 Q 60 84 68 78" stroke="%23FFF" stroke-width="3" stroke-linecap="round" fill="none"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Fire Rocket',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><defs><linearGradient id="rocketGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23ED4245"/><stop offset="100%" stop-color="%23FEE75C"/></linearGradient></defs><path d="M 60 10 C 85 30 85 70 85 90 L 35 90 C 35 70 35 30 60 10 Z" fill="%235865F2"/><polygon points="60,10 75,35 45,35" fill="%23ED4245"/><circle cx="60" cy="55" r="12" fill="%23FFF"/><circle cx="60" cy="55" r="8" fill="%2323272A"/><path d="M 45 90 Q 60 118 75 90 Q 60 102 45 90 Z" fill="url(%23rocketGrad)"/><polygon points="25,65 35,60 35,85" fill="%23ED4245"/><polygon points="95,65 85,60 85,85" fill="%23ED4245"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Cool Blob',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><defs><linearGradient id="coolGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2357F287"/><stop offset="100%" stop-color="%231F9C47"/></linearGradient></defs><circle cx="60" cy="60" r="52" fill="url(%23coolGrad)"/><path d="M 26 46 L 56 46 L 50 62 L 32 62 Z" fill="%232C2F33"/><path d="M 64 46 L 94 46 L 88 62 L 70 62 Z" fill="%232C2F33"/><line x1="56" y1="52" x2="64" y2="52" stroke="%232C2F33" stroke-width="4"/><line x1="22" y1="50" x2="26" y2="50" stroke="%232C2F33" stroke-width="4"/><line x1="94" y1="50" x2="98" y2="50" stroke="%232C2F33" stroke-width="4"/><path d="M 42 74 Q 60 92 78 74" stroke="%232C2F33" stroke-width="5" stroke-linecap="round" fill="none"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Mind Blown',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><defs><radialGradient id="boomGrad"><stop offset="0%" stop-color="%23FEE75C"/><stop offset="60%" stop-color="%23ED4245"/><stop offset="100%" stop-color="%23EB459E"/></radialGradient></defs><path d="M 60 5 L 68 25 L 90 15 L 80 35 L 105 45 L 85 55 L 100 75 L 75 70 L 75 95 L 60 80 L 45 95 L 45 70 L 20 75 L 35 55 L 15 45 L 40 35 L 30 15 L 52 25 Z" fill="url(%23boomGrad)"/><circle cx="60" cy="72" r="36" fill="%23FEE75C"/><circle cx="48" cy="70" r="6" fill="%232C2F33"/><circle cx="72" cy="70" r="6" fill="%232C2F33"/><ellipse cx="60" cy="88" rx="8" ry="10" fill="%232C2F33"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Coffee Cozy',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect x="25" y="45" width="60" height="60" rx="12" fill="%235865F2"/><path d="M 85 58 C 105 58 105 82 85 82" stroke="%235865F2" stroke-width="8" fill="none" stroke-linecap="round"/><ellipse cx="55" cy="45" rx="30" ry="6" fill="%233B46C4"/><path d="M 40 32 Q 45 20 42 12" stroke="%23FEE75C" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 55 34 Q 60 22 57 14" stroke="%23FEE75C" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 70 32 Q 75 20 72 12" stroke="%23FEE75C" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="45" cy="68" r="4" fill="%23FFF"/><circle cx="65" cy="68" r="4" fill="%23FFF"/><path d="M 50 80 Q 55 86 60 80" stroke="%23FFF" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Winner Trophy',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><path d="M 35 20 L 85 20 L 78 65 Q 60 85 42 65 Z" fill="%23FEE75C"/><path d="M 35 30 C 15 30 15 55 38 55" stroke="%23FEE75C" stroke-width="6" fill="none"/><path d="M 85 30 C 105 30 105 55 82 55" stroke="%23FEE75C" stroke-width="6" fill="none"/><rect x="54" y="75" width="12" height="20" fill="%23FEB139"/><rect x="35" y="95" width="50" height="15" rx="4" fill="%235865F2"/><polygon points="60,30 64,42 76,42 66,50 70,62 60,54 50,62 54,50 44,42 56,42" fill="%23FFF"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Rage Mode',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="52" fill="%23ED4245"/><path d="M 30 38 L 52 48" stroke="%232C2F33" stroke-width="6" stroke-linecap="round"/><path d="M 90 38 L 68 48" stroke="%232C2F33" stroke-width="6" stroke-linecap="round"/><circle cx="44" cy="58" r="6" fill="%232C2F33"/><circle cx="76" cy="58" r="6" fill="%232C2F33"/><rect x="36" y="75" width="48" height="20" rx="4" fill="%232C2F33"/><line x1="48" y1="75" x2="48" y2="95" stroke="%23FFF" stroke-width="3"/><line x1="60" y1="75" x2="60" y2="95" stroke="%23FFF" stroke-width="3"/><line x1="72" y1="75" x2="72" y2="95" stroke="%23FFF" stroke-width="3"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Sad Pleading',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="52" fill="%23FEE75C"/><circle cx="42" cy="54" r="14" fill="%232C2F33"/><circle cx="78" cy="54" r="14" fill="%232C2F33"/><circle cx="38" cy="48" r="6" fill="%23FFF"/><circle cx="74" cy="48" r="6" fill="%23FFF"/><circle cx="46" cy="58" r="3" fill="%23FFF"/><circle cx="82" cy="58" r="3" fill="%23FFF"/><path d="M 45 84 Q 60 72 75 84" stroke="%232C2F33" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M 28 66 Q 32 76 30 82" stroke="%2300AFF0" stroke-width="4" stroke-linecap="round" fill="none"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: 'Gamer Pad',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect x="15" y="35" width="90" height="50" rx="22" fill="%235865F2"/><line x1="38" y1="48" x2="38" y2="72" stroke="%23FFF" stroke-width="5" stroke-linecap="round"/><line x1="26" y1="60" x2="50" y2="60" stroke="%23FFF" stroke-width="5" stroke-linecap="round"/><circle cx="85" cy="50" r="5" fill="%23ED4245"/><circle cx="75" cy="60" r="5" fill="%23FEE75C"/><circle cx="95" cy="60" r="5" fill="%2357F287"/><circle cx="85" cy="70" r="5" fill="%23EB459E"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
        {
          name: '100 Percent',
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="52" fill="%23ED4245"/><text x="60" y="68" font-size="38" font-weight="900" fill="%23FFF" text-anchor="middle" font-family="sans-serif">100</text><line x1="25" y1="80" x2="95" y2="80" stroke="%23FFF" stroke-width="5" stroke-linecap="round"/><line x1="35" y1="88" x2="85" y2="88" stroke="%23FFF" stroke-width="3" stroke-linecap="round"/></svg>',
          mimeType: 'image/svg+xml',
          byteSize: 1024,
        },
      ];

      await prisma.serverSticker.createMany({
        data: stickerPacks.map((pack) => ({
          serverId: existingServer.id,
          creatorId: demo.id,
          ...pack,
        })),
        skipDuplicates: true,
      });
      console.log(`Seeded ${stickerPacks.length} sticker packs into ${existingServer.name}`);
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
