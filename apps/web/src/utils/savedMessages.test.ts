import { describe, expect, it } from 'vitest';
import type { Message } from '../api';
import {
  readSavedMessageIds,
  SAVED_MESSAGES_STORAGE_KEY,
  selectSavedMessages,
  toggleSavedMessageId,
  writeSavedMessageIds,
} from './savedMessages';

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

function message(partial: Partial<Message>): Message {
  return {
    id: 'message-1',
    channelId: 'channel-1',
    authorId: 'user-1',
    content: 'Saved message',
    createdAt: '2026-06-13T01:00:00.000Z',
    author: { id: 'user-1', username: 'ada', displayName: 'Ada', avatarUrl: null },
    attachments: [],
    reactions: [],
    ...partial,
  };
}

describe('saved message helpers', () => {
  it('reads and writes saved IDs with invalid storage fallback', () => {
    const storage = createStorage();

    writeSavedMessageIds({ 'channel-1': ['message-1'] }, storage);
    expect(readSavedMessageIds(storage)).toEqual({ 'channel-1': ['message-1'] });

    storage.setItem(SAVED_MESSAGES_STORAGE_KEY, '{not valid json');
    expect(readSavedMessageIds(storage)).toEqual({});

    writeSavedMessageIds({}, storage);
    expect(storage.values.has(SAVED_MESSAGES_STORAGE_KEY)).toBe(false);
  });

  it('toggles saved IDs per channel', () => {
    const saved = toggleSavedMessageId({}, 'channel-1', 'message-1');
    expect(saved).toEqual({ 'channel-1': ['message-1'] });

    expect(toggleSavedMessageId(saved, 'channel-1', 'message-1')).toEqual({});
  });

  it('selects saved messages in saved order and skips deleted messages', () => {
    const messages = [
      message({ id: 'message-1', deletedAt: '2026-06-13T01:01:00.000Z' }),
      message({ id: 'message-2', content: 'Second saved message' }),
      message({ id: 'message-3', content: 'Third saved message' }),
    ];

    expect(
      selectSavedMessages(messages, ['message-3', 'message-1', 'message-2']).map((item) => item.id),
    ).toEqual(['message-3', 'message-2']);
  });
});
