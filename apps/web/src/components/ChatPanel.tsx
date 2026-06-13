import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatHeader } from './chat/ChatHeader';
import { UtilityPanel } from './chat/UtilityPanel';
import { CallStage } from './chat/CallStage';
import { MessageList } from './chat/MessageList';
import { MessageRow } from './chat/MessageRow';
import { MessageComposer } from './chat/MessageComposer';
import { ThreadPanel } from './chat/ThreadPanel';
import { AttachmentPreviewDialog, PreviewAttachment } from './chat/AttachmentPreviewDialog';
import { Button } from './ui';
import {
  readSavedMessageIds,
  selectSavedMessages,
  toggleSavedMessageId,
  writeSavedMessageIds,
} from '../utils/savedMessages';
import type { Message } from '../api';
import type {
  ActiveDialog,
  ActivePanel,
  ChatPanelAlerts,
  ChatPanelCall,
  ChatPanelChannelAvatar,
  ChatPanelComposer,
  ChatPanelEncryption,
  ChatPanelMessageActions,
  ChatPanelMessages,
  ChatPanelPanels,
  ChatPanelSession,
  ChatPanelThread,
} from './chat/types';

export interface ChatPanelProps {
  session: ChatPanelSession;
  messages: ChatPanelMessages;
  alerts: ChatPanelAlerts;
  panels: ChatPanelPanels;
  encryption: ChatPanelEncryption;
  call: ChatPanelCall;
  messageActions: ChatPanelMessageActions;
  composer: ChatPanelComposer;
  thread: ChatPanelThread;
  channelAvatar: ChatPanelChannelAvatar;
}

export function ChatPanel({
  session,
  messages,
  alerts,
  panels,
  encryption,
  call,
  messageActions,
  composer,
  thread,
  channelAvatar,
}: ChatPanelProps) {
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [savedMessageIdsByChannel, setSavedMessageIdsByChannel] = useState(readSavedMessageIds);
  const savedMessageIds = session.channel
    ? (savedMessageIdsByChannel[session.channel.id] ?? [])
    : [];
  const savedMessages = useMemo(
    () => selectSavedMessages(messages.all, savedMessageIds),
    [messages.all, savedMessageIds],
  );

  useEffect(() => {
    writeSavedMessageIds(savedMessageIdsByChannel);
  }, [savedMessageIdsByChannel]);

  const toggleSavedMessage = useCallback(
    (message: Message) => {
      const channelId = session.channel?.id ?? message.channelId;
      const isSaved = (savedMessageIdsByChannel[channelId] ?? []).includes(message.id);

      setSavedMessageIdsByChannel((current) =>
        toggleSavedMessageId(current, channelId, message.id),
      );
      setAnnouncement(isSaved ? 'Message removed from saved messages.' : 'Message saved.');
    },
    [savedMessageIdsByChannel, session.channel?.id],
  );

  const jumpToMessage = useCallback((messageId: string) => {
    const target = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    target.dataset.jumpHighlight = 'true';
    window.setTimeout(() => {
      delete target.dataset.jumpHighlight;
    }, 1400);
  }, []);

  // Announce incoming messages to screen readers
  const lastMessage = messages.all[messages.all.length - 1];
  useEffect(() => {
    if (lastMessage && !messages.isLoading) {
      setAnnouncement(
        `New message from ${lastMessage.author.displayName}: ${lastMessage.content || 'attachment'}`,
      );
    }
  }, [lastMessage?.id, messages.isLoading]);

  return (
    <section className="chat-panel">
      <ChatHeader
        channel={session.channel}
        notificationUnreadCount={messages.notificationUnreadCount}
        pendingAction={composer.pendingAction}
        callState={call.state}
        panels={panels}
        isChannelEncrypted={encryption.isChannelEncrypted}
        channelAvatar={channelAvatar}
        startCall={call.start}
      />

      <UtilityPanel
        activePanel={panels.activePanel}
        channel={session.channel}
        searchQuery={messages.searchQuery}
        parsedSearch={messages.parsedSearch}
        searchResults={messages.visible}
        pinnedMessages={messages.pinned}
        savedMessages={savedMessages}
        mediaMessages={messages.mediaSource}
        notifications={messages.notifications}
        notificationUnreadCount={messages.notificationUnreadCount}
        isLoadingNotifications={messages.isLoadingNotifications}
        isChannelEncrypted={encryption.isChannelEncrypted}
        setSearchQuery={panels.setSearchQuery}
        loadNotifications={panels.loadNotifications}
        markNotificationRead={panels.markNotificationRead}
        markAllNotificationsRead={panels.markAllNotificationsRead}
        onJumpToMessage={jumpToMessage}
        configureChannelEncryption={encryption.configure}
        clearChannelEncryption={encryption.clear}
      />

      {alerts.error && (
        <div className="banner error-banner">
          {alerts.error}
          <Button variant="ghost" size="sm" onClick={() => alerts.setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {alerts.notice && (
        <div className="banner notice-banner">
          {alerts.notice}
          <Button variant="ghost" size="sm" onClick={() => alerts.setNotice(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <CallStage session={session} call={call} />

      <MessageList
        channel={session.channel}
        messages={messages.all}
        visibleMessages={messages.visible}
        isLoadingMessages={messages.isLoading}
        isLoadingMoreMessages={messages.isLoadingMore}
        hasMoreMessages={messages.hasMore}
        searchQuery={messages.searchQuery}
        loadMoreMessages={messages.loadMore}
      >
        {messages.visible.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            previousMessage={messages.visible[index - 1]}
            auth={session.auth}
            pinnedMessageIds={messages.pinnedIds}
            savedMessageIds={savedMessageIds}
            actions={messageActions}
            onToggleSaved={toggleSavedMessage}
            onPreviewAttachment={setPreviewAttachment}
          />
        ))}
      </MessageList>

      {messages.typingUsers.length > 0 && (
        <div className="typing-indicator" aria-live="polite">
          {messages.typingUsers.length === 1
            ? `${messages.typingUsers[0].displayName} is typing...`
            : `${messages.typingUsers
                .slice(0, 2)
                .map((user) => user.displayName)
                .join(
                  ', ',
                )}${messages.typingUsers.length > 2 ? ` and ${messages.typingUsers.length - 2} more` : ''} are typing...`}
        </div>
      )}

      <MessageComposer
        channel={session.channel}
        messageActions={messageActions}
        composer={composer}
      />

      <ThreadPanel
        rootMessage={thread.rootMessage}
        messages={thread.messages}
        draft={thread.draft}
        isLoading={thread.isLoading}
        isSending={thread.isSending}
        onClose={thread.close}
        onDraftChange={thread.setDraft}
        onSend={thread.sendMessage}
      />

      <AttachmentPreviewDialog
        previewAttachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />

      <span
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          border: 0,
        }}
        aria-live="polite"
      >
        {announcement}
      </span>
    </section>
  );
}

export type { ActiveDialog, ActivePanel };
