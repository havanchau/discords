import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AuthState, Channel, Message } from '../../api';
import { TooltipProvider } from '../ui';
import { MessageList } from './MessageList';
import { MessageRow } from './MessageRow';
import type { ChatPanelMessageActions } from './types';

const channel: Channel = {
  id: 'channel-1',
  serverId: 'server-1',
  name: 'general',
  type: 'TEXT',
};

const auth: AuthState = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: {
    id: 'user-1',
    email: 'ada@example.com',
    username: 'ada',
    displayName: 'Ada',
  },
};

const actions: ChatPanelMessageActions = {
  editingMessageId: null,
  editingDraft: '',
  setReplyingToMessage: () => undefined,
  setEditingMessageId: () => undefined,
  setEditingDraft: () => undefined,
  saveEdit: async () => undefined,
  delete: async () => undefined,
  toggleReaction: async () => undefined,
  togglePinned: () => undefined,
};

function createMessages(count: number): Message[] {
  const start = Date.parse('2026-06-07T00:00:00.000Z');

  return Array.from({ length: count }, (_, index) => {
    const authorId = `user-${(index % 8) + 1}`;
    const content =
      index % 17 === 0
        ? `Long update ${index} https://example.com/thread/${index} ` +
          'with enough words to exercise wrapping and link preview rendering.'
        : `Message ${index} with ordinary chat text.`;

    return {
      id: `message-${index}`,
      channelId: channel.id,
      authorId,
      content,
      createdAt: new Date(start + index * 60_000).toISOString(),
      editedAt: null,
      deletedAt: null,
      author: {
        id: authorId,
        username: `user${index % 8}`,
        displayName: `User ${index % 8}`,
        avatarUrl: null,
      },
      attachments: [],
      reactions: index % 9 === 0 ? [{ emoji: 'ok', count: 2, me: false }] : [],
      replyToMessage: null,
    };
  });
}

describe('MessageList performance', () => {
  it('renders more than 500 visible messages within the smoke budget', () => {
    const messages = createMessages(600);
    const startedAt = performance.now();

    render(
      <TooltipProvider>
        <MessageList
          channel={channel}
          messages={messages}
          visibleMessages={messages}
          isLoadingMessages={false}
          isLoadingMoreMessages={false}
          hasMoreMessages={false}
          searchQuery=""
          loadMoreMessages={async () => undefined}
        >
          {messages.map((message, index) => (
            <MessageRow
              key={message.id}
              message={message}
              previousMessage={messages[index - 1]}
              auth={auth}
              pinnedMessageIds={[]}
              actions={actions}
              onPreviewAttachment={() => undefined}
            />
          ))}
        </MessageList>
      </TooltipProvider>,
    );

    const elapsedMs = performance.now() - startedAt;
    const list = screen.getByTestId('message-list');

    expect(within(list).getAllByTestId('message')).toHaveLength(600);
    expect(elapsedMs).toBeLessThan(5000);
  });
});
