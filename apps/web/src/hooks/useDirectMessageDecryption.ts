import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DirectConversationWithMute, DirectMessage } from '@/api';
import { isEncryptedMessage } from '@/e2ee';
import { useTranslation } from '@/i18n/LocaleProvider';
import type { ContentDecryption } from './useScopeKeys';

interface EncryptedItem {
  id: string;
  conversationId: string;
  content: string;
}

interface OpenedContent {
  /** The ciphertext this result was made from; a later edit changes it and invalidates the entry. */
  source: string;
  /** Null while the message is still locked. */
  text: string | null;
}

interface UseDirectMessageDecryptionOptions {
  messages: DirectMessage[];
  conversations: DirectConversationWithMute[];
  decryptContent: (
    scope: { kind: 'conversation'; id: string },
    content: string,
  ) => Promise<ContentDecryption>;
  /** Changes when a key arrives, so messages that were locked get another try. */
  keyEpoch: number;
}

function collectEncryptedItems(
  messages: DirectMessage[],
  conversations: DirectConversationWithMute[],
) {
  const items = new Map<string, EncryptedItem>();
  const add = (id: string, conversationId: string, content: string) => {
    if (isEncryptedMessage(content)) items.set(id, { id, conversationId, content });
  };
  messages.forEach((message) => {
    add(message.id, message.conversationId, message.content);
    if (message.replyToMessage) {
      add(message.replyToMessage.id, message.conversationId, message.replyToMessage.content);
    }
  });
  conversations.forEach((conversation) =>
    conversation.messages.forEach((message) => add(message.id, conversation.id, message.content)),
  );
  return items;
}

/**
 * Direct messages stay as the server sent them (ciphertext) in the state that socket events and
 * message actions write to; this derives the readable list for display. A message that cannot be
 * opened yet shows a locked placeholder, never its ciphertext, so no write path has to remember to
 * decrypt.
 */
export function useDirectMessageDecryption({
  messages,
  conversations,
  decryptContent,
  keyEpoch,
}: UseDirectMessageDecryptionOptions) {
  const t = useTranslation();
  const [opened, setOpened] = useState<ReadonlyMap<string, OpenedContent>>(new Map());
  const openedRef = useRef(opened);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    openedRef.current = opened;
  }, [opened]);

  useEffect(() => {
    const items = collectEncryptedItems(messages, conversations);
    const todo = [...items.values()].filter((item) => {
      const known = openedRef.current.get(item.id);
      return !known || known.source !== item.content || known.text === null;
    });
    if (!todo.length) return;
    let isCancelled = false;
    void Promise.all(
      todo.map(async (item) => ({
        item,
        result: await decryptContent(
          { kind: 'conversation', id: item.conversationId },
          item.content,
        ),
      })),
    ).then((results) => {
      if (isCancelled) return;
      setOpened((previous) => {
        // Keep only what is on screen, so the cache cannot grow with every conversation visited.
        const next = new Map<string, OpenedContent>();
        items.forEach((item) => {
          const known = previous.get(item.id);
          if (known && known.source === item.content) next.set(item.id, known);
        });
        results.forEach(({ item, result }) => {
          next.set(item.id, {
            source: item.content,
            text: result.status === 'decrypted' ? result.content : null,
          });
        });
        return next;
      });
    });
    return () => {
      isCancelled = true;
    };
  }, [messages, conversations, decryptContent, keyEpoch, retryTick]);

  const lockedText = t('encryption.lockedMessage');
  const display = useCallback(
    (id: string, content: string) => {
      if (!isEncryptedMessage(content)) return content;
      const known = opened.get(id);
      return known && known.source === content && known.text !== null ? known.text : lockedText;
    },
    [opened, lockedText],
  );

  const displayMessages = useMemo(
    () =>
      messages.map((message) => {
        const content = display(message.id, message.content);
        const reply = message.replyToMessage;
        const replyContent = reply ? display(reply.id, reply.content) : null;
        if (content === message.content && (!reply || replyContent === reply.content)) {
          return message;
        }
        return {
          ...message,
          content,
          replyToMessage:
            reply && replyContent !== null ? { ...reply, content: replyContent } : reply,
        };
      }),
    [messages, display],
  );

  const displayConversations = useMemo(
    () =>
      conversations.map((conversation) => {
        const previews = conversation.messages.map((message) => {
          const content = display(message.id, message.content);
          return content === message.content ? message : { ...message, content };
        });
        return previews.every((preview, index) => preview === conversation.messages[index])
          ? conversation
          : { ...conversation, messages: previews };
      }),
    [conversations, display],
  );

  return {
    messages: displayMessages,
    conversations: displayConversations,
    retryLocked: useCallback(() => setRetryTick((tick) => tick + 1), []),
  };
}
