import { createRef } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState, Channel, Message } from '../../api';
import { TooltipProvider } from '../ui';
import { MessageList, type MessageListHandle } from './MessageList';
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
  openThread: () => undefined,
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

const VIEWPORT_HEIGHT = 560;
const ROW_HEIGHT = 56;

// jsdom has no layout: give the scroll container and rows fixed sizes so the virtualizer can window.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(VIEWPORT_HEIGHT);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width: 800, height: ROW_HEIGHT }),
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderMessageList(messages: Message[], ref = createRef<MessageListHandle>()) {
  render(
    <TooltipProvider>
      <MessageList
        ref={ref}
        channel={channel}
        messages={messages}
        visibleMessages={messages}
        isLoadingMessages={false}
        isLoadingMoreMessages={false}
        hasMoreMessages={false}
        searchQuery=""
        loadMoreMessages={async () => undefined}
        renderMessage={(message, index) => (
          <MessageRow
            message={message}
            previousMessage={messages[index - 1]}
            auth={auth}
            pinnedMessageIds={[]}
            actions={actions}
            onPreviewAttachment={() => undefined}
            onJumpToMessage={(messageId) => ref.current?.scrollToMessage(messageId)}
          />
        )}
      />
    </TooltipProvider>,
  );
  return ref;
}

describe('MessageList performance', () => {
  it('renders a 600-message channel within the smoke budget by mounting only a window of rows', () => {
    const messages = createMessages(600);
    const startedAt = performance.now();

    renderMessageList(messages);

    const elapsedMs = performance.now() - startedAt;
    const mountedRows = within(screen.getByTestId('message-list')).getAllByTestId('message');
    expect(mountedRows.length).toBeGreaterThan(0);
    expect(mountedRows.length).toBeLessThan(messages.length);
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe('MessageList jump to message', () => {
  it('focuses and highlights the target row once it is rendered', async () => {
    const messages = createMessages(3);
    const ref = renderMessageList(messages);

    act(() => ref.current?.scrollToMessage('message-1'));

    const target = within(screen.getByTestId('message-list'))
      .getAllByTestId('message')
      .find((element) => element.dataset.messageId === 'message-1');
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute('data-jump-highlight', 'true');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('does nothing for a message that is not in the visible list', () => {
    const ref = renderMessageList(createMessages(3));

    act(() => ref.current?.scrollToMessage('missing-message'));

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
