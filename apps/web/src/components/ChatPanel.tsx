import {
  Bell,
  Edit3,
  FileArchive,
  FileAudio2,
  FileText,
  Hash,
  Image,
  Link as LinkIcon,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Paperclip,
  Phone,
  PhoneOff,
  Pin,
  Reply,
  Search,
  Send,
  SmilePlus,
  Square,
  Trash2,
  Unlock,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { ChangeEvent, Dispatch, FormEvent, RefObject, SetStateAction, useState } from 'react';
import { assetUrl, AuthState, Channel, Message, MessageAttachment } from '../api';
import {
  accentClass,
  ActiveCallSummary,
  attachmentKind,
  CallMode,
  CallState,
  extractLinks,
  formatBytes,
  formatDate,
  formatDayDivider,
  formatTime,
  initials,
  isSameMessageDay,
  previewText,
  QUICK_REACTIONS,
  RemoteMedia,
} from '../helpers';
import { RemoteVideoTile } from './RemoteVideoTile';

export type ActivePanel = 'notifications' | 'search' | 'encryption' | null;
export type ActiveDialog =
  | 'profile'
  | 'server-settings'
  | 'channel-settings'
  | 'roles'
  | 'member-roles'
  | null;

interface ChatPanelProps {
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

function MessageContent({ message }: { message: Message }) {
  const links = extractLinks(message.content);
  const parts = message.content.split(/(https?:\/\/[^\s]+)/gi);

  return (
    <>
      {message.replyToMessage ? (
        <button
          type="button"
          className="reply-preview"
          onClick={() =>
            document
              .querySelector(`[data-message-id="${message.replyToMessage?.id}"]`)
              ?.scrollIntoView()
          }
        >
          <Reply size={13} />
          <strong>{message.replyToMessage.author.displayName}</strong>
          <span>{previewText(message.replyToMessage)}</span>
        </button>
      ) : null}
      {message.content ? (
        <p>
          {message.isEncrypted ? (
            <span className={`encrypted-pill ${message.decryptionFailed ? 'locked' : ''}`}>
              {message.decryptionFailed ? <Lock size={12} /> : <Unlock size={12} />}
              {message.decryptionFailed ? 'Locked' : 'E2EE'}
            </span>
          ) : null}
          {parts.map((part, index) => {
            if (/^https?:\/\//i.test(part)) {
              return (
                <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
                  {part}
                </a>
              );
            }

            return part.split(/(@[\w.-]+)/g).map((segment, segmentIndex) =>
              /^@[\w.-]+$/.test(segment) ? (
                <span className="mention" key={`${part}-${index}-${segmentIndex}`}>
                  {segment}
                </span>
              ) : (
                <span key={`${part}-${index}-${segmentIndex}`}>{segment}</span>
              ),
            );
          })}
        </p>
      ) : null}
      {links.map((link) => (
        <a key={link} className="link-preview" href={link} target="_blank" rel="noreferrer">
          <LinkIcon size={18} />
          <span>{link.replace(/^https?:\/\//i, '')}</span>
        </a>
      ))}
    </>
  );
}

interface PreviewAttachment {
  url: string;
  fileName: string;
  kind: 'image' | 'video';
}

function MessageAttachments({
  attachments,
  onPreview,
}: {
  attachments: MessageAttachment[];
  onPreview: (attachment: PreviewAttachment) => void;
}) {
  if (!attachments.length) return null;

  return (
    <div className="attachment-grid">
      {attachments.map((attachment) => {
        const kind = attachmentKind(attachment);
        const url = assetUrl(attachment.url);

        if (kind === 'image') {
          return (
            <button
              type="button"
              key={attachment.id ?? attachment.url}
              className="attachment image-attachment"
              onClick={() => onPreview({ url, fileName: attachment.fileName, kind: 'image' })}
            >
              <img src={url} alt={attachment.fileName} />
            </button>
          );
        }

        if (kind === 'video') {
          return (
            <div key={attachment.id ?? attachment.url} className="attachment video-attachment">
              <video src={url} controls preload="metadata" />
              <span>
                {attachment.fileName}
                <button
                  type="button"
                  onClick={() => onPreview({ url, fileName: attachment.fileName, kind: 'video' })}
                >
                  Open preview
                </button>
              </span>
            </div>
          );
        }

        if (kind === 'audio') {
          return (
            <div key={attachment.id ?? attachment.url} className="attachment audio-attachment">
              <div className="audio-attachment-header">
                <FileAudio2 size={18} />
                <span>
                  <strong>{attachment.fileName}</strong>
                  <small>{formatBytes(attachment.byteSize)}</small>
                </span>
              </div>
              <div className="audio-waveform" aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
              <audio src={url} controls preload="metadata" />
            </div>
          );
        }

        const Icon = kind === 'archive' ? FileArchive : FileText;
        return (
          <a
            key={attachment.id ?? attachment.url}
            className="attachment file-attachment"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <Icon size={22} />
            <span>
              <strong>{attachment.fileName}</strong>
              <small>{formatBytes(attachment.byteSize)}</small>
            </span>
          </a>
        );
      })}
    </div>
  );
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
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const emojiOptions = [
    '👍',
    '🔥',
    '😂',
    '❤️',
    '🎉',
    '👏',
    '🙏',
    '😍',
    '😮',
    '😢',
    '😡',
    '✅',
    '👀',
    '💯',
    '🚀',
    '✨',
  ];

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="chat-title">
          <input
            ref={channelAvatarInputRef}
            className="file-input"
            type="file"
            accept="image/*"
            onChange={updateChannelAvatar}
          />
          <button
            type="button"
            className="channel-avatar-button"
            title="Change channel avatar"
            onClick={() => channelAvatarInputRef.current?.click()}
            disabled={!channel || pendingAction === 'channel-avatar'}
          >
            {channel?.avatarUrl ? (
              <img src={assetUrl(channel.avatarUrl)} alt={channel.name} />
            ) : (
              <Hash size={20} />
            )}
          </button>
          <div>
            <strong>{channel?.name || 'Select a channel'}</strong>
            <span>
              {channel
                ? channel.topic || `Server channel / #${channel.name}`
                : 'Choose a workspace channel to start.'}
            </span>
          </div>
        </div>
        <div className="toolbar">
          <button
            className={callState?.mode === 'voice' ? 'selected' : ''}
            data-testid="voice-call-button"
            title="Start voice call"
            onClick={() => void startCall('voice')}
            disabled={!channel || Boolean(callState)}
          >
            <Phone size={18} />
          </button>
          <button
            className={callState?.mode === 'video' ? 'selected' : ''}
            data-testid="video-call-button"
            title="Start video call"
            onClick={() => void startCall('video')}
            disabled={!channel || Boolean(callState)}
          >
            <Video size={18} />
          </button>
          <button
            className={callState?.mode === 'screen' ? 'selected' : ''}
            data-testid="screen-share-button"
            title="Share screen"
            onClick={() => void startCall('screen')}
            disabled={!channel || Boolean(callState)}
          >
            <MonitorUp size={18} />
          </button>
          <button
            className={activeDialog === 'channel-settings' ? 'selected' : ''}
            data-testid="channel-settings-button"
            title="Channel settings"
            onClick={() => setActiveDialog('channel-settings')}
            disabled={!channel}
          >
            <Edit3 size={18} />
          </button>
          <button
            className={activePanel === 'notifications' ? 'selected' : ''}
            data-testid="notifications-button"
            title="Notifications"
            onClick={() =>
              setActivePanel((current) => (current === 'notifications' ? null : 'notifications'))
            }
          >
            <Bell size={18} />
          </button>
          <button
            className={activePanel === 'encryption' || isChannelEncrypted ? 'selected' : ''}
            data-testid="encryption-button"
            title={isChannelEncrypted ? 'Encryption enabled' : 'Set encryption passphrase'}
            onClick={() =>
              setActivePanel((current) => (current === 'encryption' ? null : 'encryption'))
            }
            disabled={!channel}
          >
            {isChannelEncrypted ? <Lock size={18} /> : <Unlock size={18} />}
          </button>
          <button
            className={activePanel === 'search' ? 'selected' : ''}
            data-testid="search-button"
            title="Search"
            onClick={() => setActivePanel((current) => (current === 'search' ? null : 'search'))}
          >
            <Search size={18} />
          </button>
        </div>
      </header>

      <div className={`utility-panel ${activePanel ? 'open' : ''}`}>
        {activePanel === 'search' ? (
          <label>
            Search messages
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Keyword in current channel"
            />
          </label>
        ) : activePanel === 'notifications' ? (
          <div className="notification-panel">
            <strong>Pinned messages</strong>
            {pinnedMessages.length ? (
              pinnedMessages.map((message) => (
                <button
                  type="button"
                  key={message.id}
                  onClick={() =>
                    document.querySelector(`[data-message-id="${message.id}"]`)?.scrollIntoView()
                  }
                >
                  <Pin size={13} />
                  <span>{previewText(message)}</span>
                </button>
              ))
            ) : (
              <div className="notification-empty">No pinned messages in this channel.</div>
            )}
          </div>
        ) : activePanel === 'encryption' ? (
          <form
            className="encryption-panel"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void configureChannelEncryption(String(form.get('passphrase') || ''));
              event.currentTarget.reset();
            }}
          >
            <strong>{isChannelEncrypted ? 'Encrypted channel session' : 'Enable E2EE'}</strong>
            <span>
              Messages are encrypted in this browser before they are sent. Share the passphrase
              out-of-band with trusted members.
            </span>
            <input
              name="passphrase"
              type="password"
              minLength={8}
              placeholder="Channel passphrase"
              autoComplete="off"
            />
            <div className="encryption-actions">
              <button className="primary compact-primary" type="submit">
                {isChannelEncrypted ? 'Update key' : 'Enable'}
              </button>
              {isChannelEncrypted ? (
                <button type="button" onClick={clearChannelEncryption}>
                  Forget key
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>

      {workspaceError ? (
        <div className="banner error-banner">
          {workspaceError}
          <button onClick={() => setWorkspaceError(null)}>Dismiss</button>
        </div>
      ) : null}

      {workspaceNotice ? (
        <div className="banner notice-banner">
          {workspaceNotice}
          <button onClick={() => setWorkspaceNotice(null)}>Dismiss</button>
        </div>
      ) : null}

      {activeCall && !callState ? (
        <section className="active-call-banner" data-testid="active-call-banner">
          <div className="active-call-icon">
            {activeCall.mode === 'screen' ? (
              <MonitorUp size={18} />
            ) : activeCall.mode === 'video' ? (
              <Video size={18} />
            ) : (
              <Phone size={18} />
            )}
          </div>
          <div className="active-call-copy">
            <strong>
              {activeCall.mode === 'screen'
                ? `${activeCall.screenSharer?.displayName ?? 'Someone'} is sharing screen`
                : activeCall.mode === 'video'
                  ? 'Video call is active'
                  : 'Voice call is active'}
            </strong>
            <span>
              #{channel?.name} · {activeCall.participants.length} participant
              {activeCall.participants.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            className="primary active-call-join"
            onClick={() => void startCall('voice', { receiveOnly: true })}
          >
            {activeCall.mode === 'screen' ? 'Join stream' : 'Join call'}
          </button>
        </section>
      ) : null}

      {callState ? (
        <section className="call-stage" data-testid="call-stage">
          <div className="call-stage-header">
            <div>
              <strong>
                {callState.isSharingScreen
                  ? 'Screen share'
                  : callState.mode === 'video'
                    ? 'Video call'
                    : 'Voice call'}
              </strong>
              <span>
                #{channel?.name} Â· {remoteMedia.length + 1} participant
                {remoteMedia.length ? 's' : ''}
              </span>
            </div>
            <div className="call-controls">
              <button
                type="button"
                className={callState.isMuted ? 'danger' : ''}
                onClick={toggleMute}
                title={callState.isMuted ? 'Unmute' : 'Mute'}
              >
                {callState.isMuted ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
              <button
                type="button"
                onClick={toggleCamera}
                disabled={callState.mode === 'voice'}
                title={callState.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {callState.isCameraOff ? <VideoOff size={17} /> : <Video size={17} />}
              </button>
              <button type="button" className="danger" onClick={endCall} title="Leave call">
                <PhoneOff size={17} />
              </button>
            </div>
          </div>
          <div className="call-grid">
            <div className="call-tile local">
              {callState.mode !== 'voice' && !callState.isCameraOff ? (
                <video ref={localVideoRef} autoPlay muted playsInline />
              ) : (
                <div className={`avatar call-avatar ${accentClass(auth.user.id)}`}>
                  {initials(auth.user.displayName)}
                </div>
              )}
              <div className="call-label">
                <strong>{auth.user.displayName}</strong>
                <span>
                  {callState.isSharingScreen
                    ? 'Sharing screen'
                    : callState.isMuted
                      ? 'Muted'
                      : 'You'}
                </span>
              </div>
            </div>
            {remoteMedia.map((participant) => (
              <RemoteVideoTile key={participant.socketId} participant={participant} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="message-list" data-testid="message-list">
        {isLoadingMessages ? (
          <div className="message-skeleton-list" aria-label="Loading messages">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="message-skeleton">
                <span />
                <div>
                  <i />
                  <b />
                </div>
              </div>
            ))}
          </div>
        ) : !channel ? (
          <div className="state-panel">
            <Hash size={24} />
            Select a channel from the sidebar.
          </div>
        ) : messages.length === 0 ? (
          <div className="state-panel">
            <MessageSquare size={24} />
            <strong>Welcome to #{channel.name}</strong>
            <span>This is the start of the channel.</span>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="state-panel">
            <Search size={24} />
            No messages match the current search.
          </div>
        ) : (
          <>
            {hasMoreMessages && !searchQuery.trim() ? (
              <div className="load-more-row">
                <button
                  type="button"
                  onClick={() => void loadMoreMessages()}
                  disabled={isLoadingMoreMessages}
                >
                  {isLoadingMoreMessages ? <Loader2 className="spin" size={16} /> : null}
                  Load older messages
                </button>
              </div>
            ) : null}
            {visibleMessages.map((message, index) => {
              const previousMessage = visibleMessages[index - 1];
              const showDateDivider = !isSameMessageDay(
                previousMessage?.createdAt,
                message.createdAt,
              );
              const isFirstInGroup =
                !previousMessage ||
                showDateDivider ||
                previousMessage.authorId !== message.authorId ||
                new Date(message.createdAt).getTime() -
                  new Date(previousMessage.createdAt).getTime() >
                  7 * 60 * 1000;
              const canManage = message.authorId === auth.user.id && !message.deletedAt;
              const isEditing = editingMessageId === message.id;

              return (
                <div key={message.id} className="message-block">
                  {showDateDivider ? (
                    <div className="message-date-divider">
                      <span>{formatDayDivider(message.createdAt)}</span>
                    </div>
                  ) : null}
                  <article
                    className={`message ${isFirstInGroup ? 'first-in-group' : 'grouped-message'}`}
                    data-testid="message"
                    data-message-id={message.id}
                  >
                    {isFirstInGroup ? (
                      <div className={`avatar message-avatar ${accentClass(message.authorId)}`}>
                        {message.author.avatarUrl ? (
                          <img
                            src={assetUrl(message.author.avatarUrl)}
                            alt={message.author.displayName}
                          />
                        ) : (
                          initials(message.author.displayName)
                        )}
                      </div>
                    ) : (
                      <span className="hover-timestamp">{formatTime(message.createdAt)}</span>
                    )}
                    <div className="message-body">
                      {isFirstInGroup ? (
                        <div className="message-meta">
                          <strong>{message.author.displayName}</strong>
                          <span>{formatDate(message.createdAt)}</span>
                          {message.editedAt ? <span>edited</span> : null}
                        </div>
                      ) : null}

                      {message.deletedAt ? (
                        <p className="deleted-message">Message deleted</p>
                      ) : isEditing ? (
                        <div className="edit-row">
                          <input
                            value={editingDraft}
                            onChange={(event) => setEditingDraft(event.target.value)}
                            autoFocus
                          />
                          <button onClick={() => void saveMessageEdit(message.id)}>Save</button>
                          <button
                            className="ghost"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditingDraft('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <MessageContent message={message} />
                      )}

                      {!message.deletedAt ? (
                        <MessageAttachments
                          attachments={message.attachments ?? []}
                          onPreview={setPreviewAttachment}
                        />
                      ) : null}

                      {!message.deletedAt ? (
                        <div className="reaction-row">
                          {message.reactions.map((reaction) => (
                            <button
                              key={reaction.emoji}
                              type="button"
                              className={reaction.me ? 'active' : ''}
                              onClick={() => void toggleReaction(message, reaction.emoji)}
                              title={`React ${reaction.emoji}`}
                            >
                              <span>{reaction.emoji}</span>
                              <strong>{reaction.count}</strong>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {!message.deletedAt && !isEditing ? (
                        <div className="message-actions">
                          <button title="Reply" onClick={() => setReplyingToMessage(message)}>
                            <Reply size={14} />
                          </button>
                          <button
                            title={
                              pinnedMessageIds.includes(message.id)
                                ? 'Unpin message'
                                : 'Pin message'
                            }
                            className={pinnedMessageIds.includes(message.id) ? 'selected' : ''}
                            onClick={() => void togglePinnedMessage(message)}
                          >
                            <Pin size={14} />
                          </button>
                          <div className="quick-reactions" title="Quick reactions">
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => void toggleReaction(message, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="emoji-picker-trigger"
                              title="More reactions"
                              onClick={() =>
                                setEmojiPickerMessageId((current) =>
                                  current === message.id ? null : message.id,
                                )
                              }
                            >
                              <SmilePlus size={14} />
                            </button>
                            {emojiPickerMessageId === message.id ? (
                              <div className="emoji-picker-popover">
                                {emojiOptions.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => {
                                      setEmojiPickerMessageId(null);
                                      void toggleReaction(message, emoji);
                                    }}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {canManage ? (
                            <>
                              <button
                                title="Edit message"
                                onClick={() => {
                                  setEditingMessageId(message.id);
                                  setEditingDraft(message.content);
                                }}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                title="Delete message"
                                onClick={() => void deleteMessage(message.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                </div>
              );
            })}
          </>
        )}
      </div>

      {typingUsers.length ? (
        <div className="typing-indicator">
          {typingUsers.length === 1
            ? `${typingUsers[0].displayName} is typing...`
            : `${typingUsers
                .slice(0, 2)
                .map((user) => user.displayName)
                .join(
                  ', ',
                )}${typingUsers.length > 2 ? ` and ${typingUsers.length - 2} more` : ''} are typing...`}
        </div>
      ) : null}

      <form onSubmit={sendMessage} className="composer">
        {replyingToMessage ? (
          <div className="composer-reply">
            <Reply size={14} />
            <span>
              Replying to <strong>{replyingToMessage.author.displayName}</strong>
            </span>
            <button type="button" onClick={() => setReplyingToMessage(null)} title="Cancel reply">
              <X size={14} />
            </button>
          </div>
        ) : null}
        {selectedFiles.length ? (
          <div className="pending-attachments">
            {selectedFiles.map((file, index) => {
              const isImage = file.type.startsWith('image/');
              const isAudio = file.type.startsWith('audio/');
              return (
                <button
                  key={`${file.name}-${file.lastModified}-${index}`}
                  type="button"
                  className="pending-file"
                  onClick={() => removeSelectedFile(index)}
                  title="Remove attachment"
                >
                  {isImage ? (
                    <Image size={17} />
                  ) : isAudio ? (
                    <FileAudio2 size={17} />
                  ) : (
                    <FileText size={17} />
                  )}
                  <span>{file.name}</span>
                  <small>{formatBytes(file.size)}</small>
                </button>
              );
            })}
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          multiple
          accept="image/*,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm,application/pdf,text/plain,application/zip,.zip"
          onChange={selectFiles}
          disabled={!channel || pendingAction === 'send-message'}
        />
        <button
          type="button"
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!channel || pendingAction === 'send-message'}
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>
        <button
          type="button"
          className={`voice-record-button ${isRecordingVoice ? 'recording' : ''}`}
          onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
          disabled={!channel || (pendingAction === 'send-message' && !isRecordingVoice)}
          title={isRecordingVoice ? 'Stop voice message' : 'Record voice message'}
        >
          {isRecordingVoice ? <Square size={15} /> : <Mic size={18} />}
        </button>
        <input
          name="content"
          data-testid="composer-input"
          placeholder={
            channel ? `Message #${channel.name}, paste a link, or attach media` : 'Select a channel'
          }
          disabled={!channel || pendingAction === 'send-message'}
          onChange={handleComposerInput}
        />
        <button
          data-testid="composer-send"
          disabled={!channel || pendingAction === 'send-message'}
          title="Send message"
        >
          {pendingAction === 'send-message' ? (
            <Loader2 className="spin" size={18} />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>

      {previewAttachment ? (
        <div className="media-preview-overlay" onClick={() => setPreviewAttachment(null)}>
          <div className="media-preview" onClick={(event) => event.stopPropagation()}>
            <div className="media-preview-header">
              <strong>{previewAttachment.fileName}</strong>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                title="Close preview"
              >
                <X size={18} />
              </button>
            </div>
            {previewAttachment.kind === 'image' ? (
              <img src={previewAttachment.url} alt={previewAttachment.fileName} />
            ) : (
              <video src={previewAttachment.url} controls autoPlay />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
