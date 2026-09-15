import { NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

export const directMessageInclude = {
  author: { select: authorSelect },
  reactions: {
    select: { emoji: true, userId: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.DirectMessageInclude;

type DirectMessageWithDetails = Prisma.DirectMessageGetPayload<{
  include: typeof directMessageInclude;
}>;

/** Conversation list item: the viewer's partners, the latest message, and the viewer's read state. */
export function directConversationInclude(userId: string) {
  return {
    members: {
      where: { userId: { not: userId } },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            status: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' as const },
    },
    messages: {
      include: { author: { select: authorSelect } },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
    },
    readStates: { where: { userId }, take: 1 },
  } satisfies Prisma.DirectConversationInclude;
}

const replyPreviewSelect = {
  id: true,
  authorId: true,
  content: true,
  deletedAt: true,
  author: { select: authorSelect },
} satisfies Prisma.DirectMessageSelect;

type ReplyPreview = Prisma.DirectMessageGetPayload<{ select: typeof replyPreviewSelect }>;

/*
 * One realtime payload goes to every conversation member, so reactions carry the reacting user ids
 * and each client derives its own "me" flag.
 */
export function formatDirectMessage(
  message: DirectMessageWithDetails,
  replyToMessage?: ReplyPreview | null,
) {
  const reactions = new Map<string, { emoji: string; count: number; userIds: string[] }>();
  message.reactions.forEach(({ emoji, userId }) => {
    const current = reactions.get(emoji) ?? { emoji, count: 0, userIds: [] };
    current.count += 1;
    current.userIds.push(userId);
    reactions.set(emoji, current);
  });

  return {
    ...message,
    reactions: [...reactions.values()],
    replyToMessage: replyToMessage ?? null,
  };
}

export async function formatDirectMessages(
  prisma: PrismaClient,
  messages: DirectMessageWithDetails[],
) {
  const replyIds = [
    ...new Set(
      messages
        .map((message) => message.replyToMessageId)
        .filter((replyId): replyId is string => Boolean(replyId)),
    ),
  ];
  const replies = replyIds.length
    ? await prisma.directMessage.findMany({
        where: { id: { in: replyIds } },
        select: replyPreviewSelect,
      })
    : [];
  const replyById = new Map(replies.map((reply) => [reply.id, reply]));

  return messages.map((message) =>
    formatDirectMessage(message, replyById.get(message.replyToMessageId ?? '')),
  );
}

export async function findFormattedDirectMessage(prisma: PrismaClient, messageId: string) {
  const message = await prisma.directMessage.findUniqueOrThrow({
    where: { id: messageId },
    include: directMessageInclude,
  });
  const [formatted] = await formatDirectMessages(prisma, [message]);
  return formatted;
}

/** Non-members get the same 404 as a missing conversation, so conversation ids are not confirmed. */
export async function requireConversationMembership(
  prisma: PrismaClient,
  userId: string,
  conversationId: string,
) {
  const membership = await prisma.directConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) throw new NotFoundException('Conversation not found');
  return membership;
}
