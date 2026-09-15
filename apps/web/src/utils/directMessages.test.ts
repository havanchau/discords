import type { DirectConversation, DirectMessage } from '../api';
import {
  replaceConversationPreview,
  replaceDirectMessage,
  toViewerReactions,
} from './directMessages';

function message(overrides: Partial<DirectMessage> = {}): DirectMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    authorId: 'u1',
    content: 'hello',
    createdAt: '2026-09-15T00:00:00.000Z',
    reactions: [],
    ...overrides,
  };
}

describe('toViewerReactions', () => {
  it('marks reactions that include the viewer', () => {
    const reactions = toViewerReactions(
      message({
        reactions: [
          { emoji: '🔥', count: 2, userIds: ['u1', 'u2'] },
          { emoji: '👀', count: 1, userIds: ['u2'] },
        ],
      }),
      'u1',
    );

    expect(reactions).toEqual([
      { emoji: '🔥', count: 2, me: true },
      { emoji: '👀', count: 1, me: false },
    ]);
  });

  it('returns an empty list when the payload has no reactions', () => {
    expect(toViewerReactions(message({ reactions: undefined }), 'u1')).toEqual([]);
  });
});

describe('replaceDirectMessage', () => {
  it('replaces the message and refreshes replies that quote it', () => {
    const original = message();
    const reply = message({
      id: 'm2',
      replyToMessageId: 'm1',
      replyToMessage: { id: 'm1', authorId: 'u1', content: 'hello' },
    });
    const deleted = message({ content: '', deletedAt: '2026-09-15T01:00:00.000Z' });

    const next = replaceDirectMessage([original, reply], deleted);

    expect(next[0]).toBe(deleted);
    expect(next[1].replyToMessage).toMatchObject({ content: '', deletedAt: deleted.deletedAt });
  });

  it('returns the same array when nothing matches', () => {
    const list = [message()];

    expect(replaceDirectMessage(list, message({ id: 'other' }))).toBe(list);
  });
});

describe('replaceConversationPreview', () => {
  it('updates only the conversation whose latest message changed', () => {
    const conversations: DirectConversation[] = [
      { id: 'c1', members: [], messages: [message()] },
      { id: 'c2', members: [], messages: [message({ id: 'm9', conversationId: 'c2' })] },
    ];
    const edited = message({ content: 'edited' });

    const next = replaceConversationPreview(conversations, edited);

    expect(next[0].messages[0].content).toBe('edited');
    expect(next[1]).toBe(conversations[1]);
  });
});
