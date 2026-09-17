import { Prisma } from '@prisma/client';
import type { Message, ThreadSummary } from '@discord-clone/shared';
import { formatForwardOrigin } from '@/common/forward-snapshot';
import { formatPoll, pollInclude } from '@/modules/polls/poll.format';
import { attachmentStickerInclude, formatAttachment } from './message-attachments';

export const messageInclude = {
  author: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      kind: true,
    },
  },
  attachments: { include: attachmentStickerInclude },
  reactions: true,
  poll: { include: pollInclude },
} satisfies Prisma.MessageInclude;

export type MessageWithDetails = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

/**
 * The one place a message becomes the shape the client reads. Fields are listed explicitly so the
 * response is the declared contract and not whatever columns the query happened to select.
 *
 * A webhook post's per-post name and avatar replace the author's here, so every surface that renders
 * `author` (message list, reply preview, thread panel, search) shows what that post supplied.
 */
export function formatMessage(
  message: MessageWithDetails,
  userId: string,
  replyToMessage?: Message | null,
  thread?: ThreadSummary | null,
): Message {
  const reactionMap = new Map<string, { emoji: string; count: number; me: boolean }>();

  message.reactions.forEach((reaction) => {
    const current = reactionMap.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      me: false,
    };
    reactionMap.set(reaction.emoji, {
      ...current,
      count: current.count + 1,
      me: current.me || reaction.userId === userId,
    });
  });

  return {
    id: message.id,
    channelId: message.channelId,
    serverId: message.serverId,
    authorId: message.authorId,
    content: message.content,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    author: {
      ...message.author,
      displayName: message.authorNameOverride ?? message.author.displayName,
      avatarUrl: message.authorAvatarOverride ?? message.author.avatarUrl,
    },
    attachments: message.attachments.map(formatAttachment),
    reactions: [...reactionMap.values()],
    replyToMessageId: message.replyToMessageId,
    // A reply preview never needs the poll, and it would carry the viewer's vote into broadcasts.
    replyToMessage: replyToMessage ? { ...replyToMessage, poll: null } : replyToMessage,
    threadId: message.threadId,
    thread: thread ?? null,
    poll: message.poll && !message.deletedAt ? formatPoll(message.poll, userId) : null,
    forwardOrigin: message.deletedAt ? null : formatForwardOrigin(message),
  };
}

/**
 * How a notification or alert names a message author. A bot's username is a generated `bot-<hex>`,
 * so a bot is named by its display name (the name its owner gave it); people keep their username.
 */
export function notificationAuthorName(author: {
  username: string;
  displayName: string;
  kind?: string | null;
}) {
  return author.kind === 'BOT' ? author.displayName : author.username;
}
