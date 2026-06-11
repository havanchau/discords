import type { ChangeEvent, Dispatch, FormEvent, RefObject, SetStateAction } from 'react';
import type { AuthState, Channel, Message, NotificationItem } from '../../api';
import type { ActiveCallSummary, CallMode, CallState, RemoteMedia } from '../../helpers';
import type { ParsedMessageSearch } from '../../utils/messageSearch';

export type ActivePanel = 'notifications' | 'search' | 'encryption' | null;
export type ActiveDialog =
  | 'profile'
  | 'server-settings'
  | 'channel-settings'
  | 'roles'
  | 'member-roles'
  | null;

export interface ChatPanelSession {
  auth: AuthState;
  channel: Channel | null;
}

export interface ChatPanelMessages {
  all: Message[];
  visible: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  typingUsers: Array<{ userId: string; displayName: string }>;
  pinned: Message[];
  pinnedIds: string[];
  notifications: NotificationItem[];
  notificationUnreadCount: number;
  isLoadingNotifications: boolean;
  searchQuery: string;
  parsedSearch: ParsedMessageSearch;
  loadMore: () => Promise<void>;
}

export interface ChatPanelAlerts {
  error: string | null;
  notice: string | null;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
}

export interface ChatPanelPanels {
  activePanel: ActivePanel;
  activeDialog: ActiveDialog;
  setActivePanel: Dispatch<SetStateAction<ActivePanel>>;
  setActiveDialog: (dialog: ActiveDialog) => void;
  setSearchQuery: (value: string) => void;
  loadNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

export interface ChatPanelEncryption {
  isChannelEncrypted: boolean;
  configure: (passphrase: string) => Promise<void>;
  clear: () => void;
}

export interface ChatPanelCall {
  state: CallState | null;
  active: ActiveCallSummary | null;
  remoteMedia: RemoteMedia[];
  localVideoRef: RefObject<HTMLVideoElement | null>;
  start: (mode: CallMode, options?: { receiveOnly?: boolean }) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  end: () => void;
}

export interface ChatPanelMessageActions {
  editingMessageId: string | null;
  editingDraft: string;
  setReplyingToMessage: (message: Message | null) => void;
  openThread: (message: Message) => void;
  setEditingMessageId: (messageId: string | null) => void;
  setEditingDraft: (draft: string) => void;
  saveEdit: (messageId: string) => Promise<void>;
  delete: (messageId: string) => Promise<void>;
  toggleReaction: (message: Message, emoji: string) => Promise<void>;
  togglePinned: (message: Message) => void;
}

export interface ChatPanelComposer {
  replyingToMessage: Message | null;
  selectedFiles: File[];
  isRecordingVoice: boolean;
  pendingAction: string | null;
  draft: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  sendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setDraft: (value: string) => void;
  startVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => void;
  removeSelectedFile: (index: number) => void;
  selectFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  handleInput: () => void;
}

export interface ChatPanelThread {
  rootMessage: Message | null;
  messages: Message[];
  draft: string;
  isLoading: boolean;
  isSending: boolean;
  close: () => void;
  setDraft: (value: string) => void;
  sendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export interface ChatPanelChannelAvatar {
  inputRef: RefObject<HTMLInputElement | null>;
  update: (event: ChangeEvent<HTMLInputElement>) => void;
}
