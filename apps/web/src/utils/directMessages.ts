import type { DirectConversation, DirectMessage } from '../api';

export interface ViewerReaction {
  emoji: string;
  count: number;
  me: boolean;
}

/** Realtime reaction payloads list reacting user ids; the viewer's own state is derived here. */
export function toViewerReactions(message: DirectMessage, viewerId: string): ViewerReaction[] {
  return (message.reactions ?? []).map((reaction) => ({
    emoji: reaction.emoji,
    count: reaction.count,
    me: reaction.userIds.includes(viewerId),
  }));
}

export function replaceDirectMessage(messages: DirectMessage[], updated: DirectMessage) {
  let changed = false;
  const next = messages.map((message) => {
    if (message.id === updated.id) {
      changed = true;
      return updated;
    }
    if (message.replyToMessage?.id === updated.id) {
      changed = true;
      return {
        ...message,
        replyToMessage: {
          ...message.replyToMessage,
          content: updated.content,
          deletedAt: updated.deletedAt,
        },
      };
    }
    return message;
  });
  return changed ? next : messages;
}

/** Keeps the Recent DMs preview in sync when its latest message is edited or deleted. */
export function replaceConversationPreview(
  conversations: DirectConversation[],
  updated: DirectMessage,
) {
  let changed = false;
  const next = conversations.map((conversation) => {
    if (conversation.messages[0]?.id !== updated.id) return conversation;
    changed = true;
    return { ...conversation, messages: [updated] };
  });
  return changed ? next : conversations;
}
