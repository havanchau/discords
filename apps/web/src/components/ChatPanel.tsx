import { ChangeEvent, Dispatch, FormEvent, RefObject, SetStateAction, useEffect, useState } from 'react';
import { AuthState, Channel, Message } from '../api';
import { ActiveCallSummary, CallMode, CallState, RemoteMedia } from '../helpers';
import { ChatHeader } from './chat/ChatHeader';
import { UtilityPanel } from './chat/UtilityPanel';
import { CallStage } from './chat/CallStage';
import { MessageList } from './chat/MessageList';
import { MessageRow } from './chat/MessageRow';
import { MessageComposer } from './chat/MessageComposer';
import { AttachmentPreviewDialog, PreviewAttachment } from './chat/AttachmentPreviewDialog';
import { Button } from './ui';

export type ActivePanel = 'notifications' | 'search' | 'encryption' | null;
export type ActiveDialog =
  | 'profile'
  | 'server-settings'
  | 'channel-settings'
  | 'roles'
  | 'member-roles'
  | null;

export interface ChatPanelProps {
  auth: AuthState;
  channel: Channel | null;
  messages: Message[];
  visibleMessages: Message[];
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  workspaceError: string | null;
  workspaceNotice: string | null;
  callState: CallState | null;
  activeCall: ActiveCallSummary | null;
  remoteMedia: RemoteMedia[];
  activePanel: ActivePanel;
  activeDialog: ActiveDialog;
  searchQuery: string;
  isChannelEncrypted: boolean;
  typingUsers: Array<{ userId: string; displayName: string }>;
  pinnedMessages: Message[];
  pinnedMessageIds: string[];
  replyingToMessage: Message | null;
  selectedFiles: File[];
  isRecordingVoice: boolean;
  pendingAction: string | null;
  editingMessageId: string | null;
  editingDraft: string;
  channelAvatarInputRef: RefObject<HTMLInputElement | null>;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  setActiveDialog: (dialog: ActiveDialog) => void;
  setActivePanel: Dispatch<SetStateAction<ActivePanel>>;
  setSearchQuery: (value: string) => void;
  setWorkspaceError: (value: string | null) => void;
  setWorkspaceNotice: (value: string | null) => void;
  configureChannelEncryption: (passphrase: string) => Promise<void>;
  clearChannelEncryption: () => void;
  setReplyingToMessage: (message: Message | null) => void;
  setEditingMessageId: (messageId: string | null) => void;
  setEditingDraft: (draft: string) => void;
  updateChannelAvatar: (event: ChangeEvent<HTMLInputElement>) => void;
  startCall: (mode: CallMode, options?: { receiveOnly?: boolean }) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  endCall: () => void;
  saveMessageEdit: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (message: Message, emoji: string) => Promise<void>;
  togglePinnedMessage: (message: Message) => void;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  startVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => void;
  removeSelectedFile: (index: number) => void;
  selectFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  handleComposerInput: () => void;
}

export function ChatPanel({
  auth,
  channel,
  messages,
  visibleMessages,
  isLoadingMessages,
  isLoadingMoreMessages,
  hasMoreMessages,
  workspaceError,
  workspaceNotice,
  callState,
  activeCall,
  remoteMedia,
  activePanel,
  activeDialog,
  searchQuery,
  isChannelEncrypted,
  typingUsers,
  pinnedMessages,
  pinnedMessageIds,
  replyingToMessage,
  selectedFiles,
  isRecordingVoice,
  pendingAction,
  editingMessageId,
  editingDraft,
  channelAvatarInputRef,
  localVideoRef,
  fileInputRef,
  setActiveDialog,
  setActivePanel,
  setSearchQuery,
  setWorkspaceError,
  setWorkspaceNotice,
  configureChannelEncryption,
  clearChannelEncryption,
  setReplyingToMessage,
  setEditingMessageId,
  setEditingDraft,
  updateChannelAvatar,
  startCall,
  toggleMute,
  toggleCamera,
  endCall,
  saveMessageEdit,
  deleteMessage,
  toggleReaction,
  togglePinnedMessage,
  loadMoreMessages,
  sendMessage,
  startVoiceRecording,
  stopVoiceRecording,
  removeSelectedFile,
  selectFiles,
  handleComposerInput,
}: ChatPanelProps) {
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // Announce incoming messages to screen readers
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (lastMessage && !isLoadingMessages) {
      setAnnouncement(
        `New message from ${lastMessage.author.displayName}: ${lastMessage.content || 'attachment'}`
      );
    }
  }, [lastMessage?.id, isLoadingMessages]);

  return (
    <section className="chat-panel">
      <ChatHeader
        channel={channel}
        pendingAction={pendingAction}
        callState={callState}
        activeDialog={activeDialog}
        activePanel={activePanel}
        isChannelEncrypted={isChannelEncrypted}
        channelAvatarInputRef={channelAvatarInputRef}
        updateChannelAvatar={updateChannelAvatar}
        startCall={startCall}
        setActiveDialog={setActiveDialog}
        setActivePanel={setActivePanel}
      />

      <UtilityPanel
        activePanel={activePanel}
        searchQuery={searchQuery}
        pinnedMessages={pinnedMessages}
        isChannelEncrypted={isChannelEncrypted}
        setSearchQuery={setSearchQuery}
        configureChannelEncryption={configureChannelEncryption}
        clearChannelEncryption={clearChannelEncryption}
      />

      {workspaceError && (
        <div className="banner error-banner">
          {workspaceError}
          <Button variant="ghost" size="sm" onClick={() => setWorkspaceError(null)}>Dismiss</Button>
        </div>
      )}

      {workspaceNotice && (
        <div className="banner notice-banner">
          {workspaceNotice}
          <Button variant="ghost" size="sm" onClick={() => setWorkspaceNotice(null)}>Dismiss</Button>
        </div>
      )}

      <CallStage
        auth={auth}
        channel={channel}
        activeCall={activeCall}
        callState={callState}
        remoteMedia={remoteMedia}
        localVideoRef={localVideoRef}
        startCall={startCall}
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        endCall={endCall}
      />

      <MessageList
        channel={channel}
        messages={messages}
        visibleMessages={visibleMessages}
        isLoadingMessages={isLoadingMessages}
        isLoadingMoreMessages={isLoadingMoreMessages}
        hasMoreMessages={hasMoreMessages}
        searchQuery={searchQuery}
        loadMoreMessages={loadMoreMessages}
      >
        {visibleMessages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            previousMessage={visibleMessages[index - 1]}
            auth={auth}
            pinnedMessageIds={pinnedMessageIds}
            editingMessageId={editingMessageId}
            editingDraft={editingDraft}
            setReplyingToMessage={setReplyingToMessage}
            setEditingMessageId={setEditingMessageId}
            setEditingDraft={setEditingDraft}
            saveMessageEdit={saveMessageEdit}
            deleteMessage={deleteMessage}
            toggleReaction={toggleReaction}
            togglePinnedMessage={togglePinnedMessage}
            onPreviewAttachment={setPreviewAttachment}
          />
        ))}
      </MessageList>

      {typingUsers.length > 0 && (
        <div className="typing-indicator" aria-live="polite">
          {typingUsers.length === 1
            ? `${typingUsers[0].displayName} is typing...`
            : `${typingUsers
                .slice(0, 2)
                .map((user) => user.displayName)
                .join(
                  ', ',
                )}${typingUsers.length > 2 ? ` and ${typingUsers.length - 2} more` : ''} are typing...`}
        </div>
      )}

      <MessageComposer
        channel={channel}
        replyingToMessage={replyingToMessage}
        selectedFiles={selectedFiles}
        isRecordingVoice={isRecordingVoice}
        pendingAction={pendingAction}
        fileInputRef={fileInputRef}
        setReplyingToMessage={setReplyingToMessage}
        removeSelectedFile={removeSelectedFile}
        selectFiles={selectFiles}
        startVoiceRecording={startVoiceRecording}
        stopVoiceRecording={stopVoiceRecording}
        sendMessage={sendMessage}
        handleComposerInput={handleComposerInput}
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
