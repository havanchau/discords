import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Channel, Message } from '../../api';
import { parseMessageSearchQuery } from '../../utils/messageSearch';
import { UtilityPanel } from './UtilityPanel';

const channel: Channel = {
  id: 'channel-1',
  serverId: 'server-1',
  name: 'general',
  type: 'TEXT',
};

const message: Message = {
  id: 'message-1',
  channelId: channel.id,
  authorId: 'user-1',
  content: 'Saved release note with enough detail to recognize later.',
  createdAt: '2026-06-13T01:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  author: {
    id: 'user-1',
    username: 'ada',
    displayName: 'Ada',
    avatarUrl: null,
  },
  attachments: [],
  reactions: [],
  replyToMessage: null,
};

function renderUtilityPanel(overrides: Partial<ComponentProps<typeof UtilityPanel>> = {}) {
  const props: ComponentProps<typeof UtilityPanel> = {
    activePanel: 'saved',
    channel,
    searchQuery: '',
    parsedSearch: parseMessageSearchQuery(''),
    searchResults: [],
    pinnedMessages: [],
    savedMessages: [],
    mediaMessages: [],
    notifications: [],
    notificationUnreadCount: 0,
    isLoadingNotifications: false,
    isChannelEncrypted: false,
    setSearchQuery: vi.fn(),
    loadNotifications: vi.fn(async () => undefined),
    markNotificationRead: vi.fn(async () => undefined),
    markAllNotificationsRead: vi.fn(async () => undefined),
    onJumpToMessage: vi.fn(),
    configureChannelEncryption: vi.fn(async () => undefined),
    clearChannelEncryption: vi.fn(),
    ...overrides,
  };

  render(<UtilityPanel {...props} />);
  return props;
}

describe('UtilityPanel saved messages', () => {
  it('renders saved messages and jumps to the selected message', () => {
    const onJumpToMessage = vi.fn();
    renderUtilityPanel({ savedMessages: [message], onJumpToMessage });

    expect(screen.getByRole('list', { name: 'Saved messages' })).toBeInTheDocument();
    expect(
      screen.getByText('Saved release note with enough detail to recognize later.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Saved release note/ }));

    expect(onJumpToMessage).toHaveBeenCalledWith('message-1');
  });

  it('shows a compact empty state for channels without saved messages', () => {
    renderUtilityPanel();

    expect(screen.getByText('No saved messages in this channel.')).toBeInTheDocument();
  });
});
