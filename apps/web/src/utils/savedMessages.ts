import type { Message } from '../api';

export const SAVED_MESSAGES_STORAGE_KEY = 'discord-clone:saved-message-ids:v1';
const MAX_SAVED_MESSAGES_PER_CHANNEL = 50;

export type SavedMessageIdsByChannel = Record<string, string[]>;
type SavedMessageStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

export function readSavedMessageIds(
  storage: SavedMessageStorage = getBrowserStorage(),
): SavedMessageIdsByChannel {
  if (!storage) return {};

  try {
    return normalizeSavedMessageIds(
      JSON.parse(storage.getItem(SAVED_MESSAGES_STORAGE_KEY) ?? '{}'),
    );
  } catch {
    return {};
  }
}

export function writeSavedMessageIds(
  savedMessageIds: SavedMessageIdsByChannel,
  storage: SavedMessageStorage = getBrowserStorage(),
) {
  if (!storage) return;

  const normalized = normalizeSavedMessageIds(savedMessageIds);
  if (Object.keys(normalized).length === 0) {
    storage.removeItem(SAVED_MESSAGES_STORAGE_KEY);
    return;
  }

  storage.setItem(SAVED_MESSAGES_STORAGE_KEY, JSON.stringify(normalized));
}

export function toggleSavedMessageId(
  savedMessageIds: SavedMessageIdsByChannel,
  channelId: string,
  messageId: string,
): SavedMessageIdsByChannel {
  const currentIds = savedMessageIds[channelId] ?? [];
  const nextIds = currentIds.includes(messageId)
    ? currentIds.filter((id) => id !== messageId)
    : [messageId, ...currentIds].slice(0, MAX_SAVED_MESSAGES_PER_CHANNEL);
  const next: SavedMessageIdsByChannel = { ...savedMessageIds };

  if (nextIds.length) {
    next[channelId] = nextIds;
  } else {
    delete next[channelId];
  }

  return next;
}

export function selectSavedMessages(messages: Message[], savedMessageIds: string[]) {
  const messagesById = new Map(
    messages.filter((message) => !message.deletedAt).map((message) => [message.id, message]),
  );

  return savedMessageIds.flatMap((messageId) => {
    const message = messagesById.get(messageId);
    return message ? [message] : [];
  });
}

function normalizeSavedMessageIds(value: unknown): SavedMessageIdsByChannel {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([channelId, messageIds]) => {
      if (!Array.isArray(messageIds)) return [];

      const normalizedIds = messageIds.filter(
        (messageId): messageId is string => typeof messageId === 'string' && messageId.length > 0,
      );

      return normalizedIds.length
        ? [[channelId, normalizedIds.slice(0, MAX_SAVED_MESSAGES_PER_CHANNEL)]]
        : [];
    }),
  );
}

function getBrowserStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}
