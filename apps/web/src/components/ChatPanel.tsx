import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ChatHeader } from './chat/ChatHeader';
import { UtilityPanel } from './chat/UtilityPanel';
import { CallStage } from './chat/CallStage';
import { MessageList, type MessageListHandle } from './chat/MessageList';
import { MessageRow } from './chat/MessageRow';
import { MessageComposer } from './chat/MessageComposer';
import { ThreadPanel } from './chat/ThreadPanel';
import { AgeGate } from './chat/AgeGate';
import { ForumChannelView } from './forum/ForumChannelView';
import { DecisionChannelView } from './decisions/DecisionChannelView';
import { StageChannelView } from './stage/StageChannelView';
import { AttachmentPreviewDialog, PreviewAttachment } from './chat/AttachmentPreviewDialog';
import { useTranslation } from '@/i18n/LocaleProvider';
import { resolveMemberIdentity } from '@/utils/memberIdentity';
import { channelNeedsAgeConfirmation } from '@/utils/ageGate';
import { Button } from './ui';
import { cn } from '@/utils/cn';
import { clearMessageJump, usePendingMessageJump } from '@/utils/pendingMessageJump';
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
  /** Records the caller's 18+ confirmation and updates the cached user (age-restricted channels). */
  confirmAge: () => Promise<void>;
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
  confirmAge,
}: ChatPanelProps) {
  const t = useTranslation();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const messageListRef = useRef<MessageListHandle>(null);

  const jumpToMessage = useCallback((messageId: string) => {
    messageListRef.current?.scrollToMessage(messageId);
  }, []);

  // A jump requested before this channel opened (Saved Messages) runs once its message has loaded.
  const pendingJump = usePendingMessageJump();
  const channelId = session.channel?.id;
  useEffect(() => {
    if (!pendingJump || pendingJump.channelId !== channelId || messages.isLoading) return;
    if (!messages.visible.some((message) => message.id === pendingJump.messageId)) return;
    clearMessageJump();
    jumpToMessage(pendingJump.messageId);
  }, [pendingJump, channelId, messages.isLoading, messages.visible, jumpToMessage]);

  const needsAgeConfirmation = Boolean(
    session.channel && channelNeedsAgeConfirmation(session.channel, session.auth.user),
  );

  // Announce incoming messages to screen readers
  const lastMessage = messages.all[messages.all.length - 1];
  // Only a new last message or the end of loading announces; an edit to the same message does not.
  const announceLastMessage = useEffectEvent(() => {
    if (lastMessage && !messages.isLoading) {
      setAnnouncement(
        `New message from ${lastMessage.author.displayName}: ${lastMessage.content || 'attachment'}`,
      );
    }
  });
  useEffect(() => {
    announceLastMessage();
  }, [lastMessage?.id, messages.isLoading]);

  return (
    <section className={cn(styles.chatPanel, 'chat-panel')}>
      <ChatHeader
        auth={session.auth}
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

      {/* The stage view has its own join button and controls; only a call elsewhere shows here. */}
      {session.channel?.type === 'STAGE' &&
      (!call.state || call.state.channelId === session.channel.id) ? null : (
        <CallStage session={session} call={call} />
      )}

      {session.channel?.type === 'STAGE' ? (
        <StageChannelView
          key={session.channel.id}
          auth={session.auth}
          channel={session.channel}
          call={call}
        />
      ) : needsAgeConfirmation && session.channel ? (
        // Stage audio is not message content, so only the forum and message views are gated.
        <AgeGate key={session.channel.id} channel={session.channel} confirmAge={confirmAge} />
      ) : session.channel?.type === 'FORUM' ? (
        <ForumChannelView
          key={session.channel.id}
          channel={session.channel}
          disabledReason={composer.restriction.disabledReason}
          onOpenPost={messageActions.openThread}
        />
      ) : session.channel?.type === 'DECISION' ? (
        <DecisionChannelView
          key={session.channel.id}
          channel={session.channel}
          disabledReason={composer.restriction.disabledReason}
          canManageMessages={messageActions.canManageMessages}
          openThread={messageActions.openThread}
        />
      ) : (
        <>
          <MessageList
            ref={messageListRef}
            channel={session.channel}
            messages={messages.all}
            visibleMessages={messages.visible}
            isLoadingMessages={messages.isLoading}
            isLoadingMoreMessages={messages.isLoadingMore}
            hasMoreMessages={messages.hasMore}
            firstUnreadMessageId={messages.firstUnreadMessageId}
            searchQuery={messages.searchQuery}
            loadMoreMessages={messages.loadMore}
            onMarkRead={messages.markRead}
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
                isFirstUnread={message.id === messages.firstUnreadMessageId}
                editDisabledReason={composer.restriction.disabledReason}
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
            isChannelEncrypted={encryption.isChannelEncrypted}
          />
        </>
      )}

      <ThreadPanel
        rootMessage={thread.rootMessage}
        messages={thread.messages}
        draft={thread.draft}
        isLoading={thread.isLoading}
        isSending={thread.isSending}
        onClose={thread.close}
        onDraftChange={thread.setDraft}
        onSend={thread.sendMessage}
        onSendSticker={thread.sendSticker}
        messageActions={{
          viewerId: session.auth.user.id,
          canManageMessages: messageActions.canManageMessages,
          onToggleReaction: thread.toggleReaction,
          onDeleteMessage: thread.deleteMessage,
        }}
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
