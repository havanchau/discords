import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatHeader } from './chat/ChatHeader';
import { UtilityPanel } from './chat/UtilityPanel';
import { CallStage } from './chat/CallStage';
import { MessageList, type MessageListHandle } from './chat/MessageList';
import { MessageRow } from './chat/MessageRow';
import { MessageComposer } from './chat/MessageComposer';
import { ThreadPanel } from './chat/ThreadPanel';
import { AttachmentPreviewDialog, PreviewAttachment } from './chat/AttachmentPreviewDialog';
import { useTranslation } from '../i18n/LocaleProvider';
import { resolveMemberIdentity } from '../utils/memberIdentity';
import { Button } from './ui';
import { cn } from '../utils/cn';
import styles from './ChatPanel.module.css';
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
  const t = useTranslation();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const messageListRef = useRef<MessageListHandle>(null);

  const jumpToMessage = useCallback((messageId: string) => {
    messageListRef.current?.scrollToMessage(messageId);
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
    <section className={cn(styles.chatPanel, 'chat-panel')}>
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
        <div className={cn(styles.banner, styles.errorBanner)} role="alert">
          {alerts.error}
          <Button variant="ghost" size="sm" onClick={() => alerts.setError(null)}>
            {t('common.dismiss')}
          </Button>
        </div>
      )}

      {alerts.notice && (
        <div className={cn(styles.banner, styles.noticeBanner)} role="status">
          {alerts.notice}
          <Button variant="ghost" size="sm" onClick={() => alerts.setNotice(null)}>
            {t('common.dismiss')}
          </Button>
        </div>
      )}

      <CallStage session={session} call={call} />

      <MessageList
        ref={messageListRef}
        channel={session.channel}
        messages={messages.all}
        visibleMessages={messages.visible}
        isLoadingMessages={messages.isLoading}
        isLoadingMoreMessages={messages.isLoadingMore}
        hasMoreMessages={messages.hasMore}
        searchQuery={messages.searchQuery}
        loadMoreMessages={messages.loadMore}
        renderMessage={(message, index) => (
          <MessageRow
            message={message}
            previousMessage={messages.visible[index - 1]}
            auth={session.auth}
            serverId={session.channel?.serverId ?? null}
            authorIdentity={
              session.memberIdentities[message.authorId] ??
              resolveMemberIdentity(message.author)
            }
            pinnedMessageIds={messages.pinnedIds}
            actions={messageActions}
            onPreviewAttachment={setPreviewAttachment}
            onJumpToMessage={jumpToMessage}
          />
        )}
      />

      {messages.typingUsers.length > 0 && (
        <div className={styles.typingIndicator} aria-live="polite">
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
