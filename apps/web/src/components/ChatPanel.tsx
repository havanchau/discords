import { useEffect, useState } from 'react';
import { ChatHeader } from './chat/ChatHeader';
import { UtilityPanel } from './chat/UtilityPanel';
import { CallStage } from './chat/CallStage';
import { MessageList } from './chat/MessageList';
import { MessageRow } from './chat/MessageRow';
import { MessageComposer } from './chat/MessageComposer';
import { AttachmentPreviewDialog, PreviewAttachment } from './chat/AttachmentPreviewDialog';
import { Button } from './ui';
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
  channelAvatar,
}: ChatPanelProps) {
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // Announce incoming messages to screen readers
  const lastMessage = messages.all[messages.all.length - 1];
  useEffect(() => {
    if (lastMessage && !messages.isLoading) {
      setAnnouncement(
        `New message from ${lastMessage.author.displayName}: ${lastMessage.content || 'attachment'}`
      );
    }
  }, [lastMessage?.id, messages.isLoading]);

  return (
    <section className="chat-panel">
      <ChatHeader
        channel={session.channel}
        pendingAction={composer.pendingAction}
        callState={call.state}
        panels={panels}
        isChannelEncrypted={encryption.isChannelEncrypted}
        channelAvatar={channelAvatar}
        startCall={call.start}
      />

      <UtilityPanel
        activePanel={panels.activePanel}
        searchQuery={messages.searchQuery}
        pinnedMessages={messages.pinned}
        isChannelEncrypted={encryption.isChannelEncrypted}
        setSearchQuery={panels.setSearchQuery}
        configureChannelEncryption={encryption.configure}
        clearChannelEncryption={encryption.clear}
      />

      {alerts.error && (
        <div className="banner error-banner">
          {alerts.error}
          <Button variant="ghost" size="sm" onClick={() => alerts.setError(null)}>Dismiss</Button>
        </div>
      )}

      {alerts.notice && (
        <div className="banner notice-banner">
          {alerts.notice}
          <Button variant="ghost" size="sm" onClick={() => alerts.setNotice(null)}>Dismiss</Button>
        </div>
      )}

      <CallStage
        session={session}
        call={call}
      />

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
            actions={messageActions}
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
