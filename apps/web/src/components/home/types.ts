import type { FormEvent, RefObject } from 'react';
import type {
  AuthState,
  DirectConversation,
  DirectMessage,
  FriendEntry,
  FriendRequestEntry,
  FriendsSummary,
  Poll,
} from '@/api';
import type { VoiceAttachmentMetadata } from '@discord-clone/shared';
import type { ActiveCallSummary, CallState, RemoteMedia } from '@/helpers';
import type { DirectCallMode, OutgoingDirectCall } from '@/hooks/useDirectCall';

export interface HomePanelState {
  auth: AuthState;
  friendsSummary: FriendsSummary | null;
  conversations: DirectConversation[];
  activeConversation: DirectConversation | null;
  directMessages: DirectMessage[];
  directMessageDraft: string;
  replyingToDirectMessage: DirectMessage | null;
  pinnedDirectMessages: DirectMessage[];
  isLoadingPins: boolean;
  pinsError: string | null;
  pendingAction: string | null;
}

export interface HomePanelActions {
  requestFriend: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  respondFriendRequest: (
    request: FriendRequestEntry,
    status: 'ACCEPTED' | 'REJECTED',
  ) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  removeFriend: (friend: FriendEntry) => Promise<void>;
  removeFriendRequest: (request: FriendRequestEntry) => Promise<void>;
  openDirectConversation: (conversation: DirectConversation) => Promise<void>;
  closeDirectConversation: () => void;
  startDirectConversation: (userId: string) => Promise<void>;
  sendDirectMessage: (event: FormEvent<HTMLFormElement>, files: File[]) => Promise<boolean>;
  /** `voice` is null when the browser could not decode the recording (sent as a plain audio file). */
  sendDirectVoiceMessage: (file: File, voice: VoiceAttachmentMetadata | null) => Promise<boolean>;
  /** Surfaces a composer-side failure (unsupported recorder, microphone denied) in the workspace. */
  reportComposerError: (message: string | null) => void;
  setDirectMessageDraft: (value: string) => void;
  setReplyingToDirectMessage: (message: DirectMessage | null) => void;
  editDirectMessage: (messageId: string, content: string) => Promise<void>;
  deleteDirectMessage: (messageId: string) => Promise<void>;
  toggleDirectReaction: (messageId: string, emoji: string) => Promise<void>;
  toggleDirectPin: (messageId: string) => Promise<void>;
  loadDirectPins: (conversationId: string) => Promise<void>;
  updateDirectPoll: (poll: Poll) => void;
  createGroupConversation: (userIds: string[], name: string) => Promise<boolean>;
  renameGroupConversation: (conversationId: string, name: string) => Promise<boolean>;
  addGroupMember: (conversationId: string, userId: string) => Promise<void>;
  removeGroupMember: (conversationId: string, userId: string) => Promise<void>;
}

export interface HomeDirectCall {
  state: CallState | null;
  activeCalls: Record<string, ActiveCallSummary>;
  remoteMedia: RemoteMedia[];
  localVideoRef: RefObject<HTMLVideoElement | null>;
  outgoingCall: OutgoingDirectCall | null;
  startDirectCall: (conversationId: string, mode: DirectCallMode, label: string) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  end: () => void;
}

export interface HomePanelProps {
  home: HomePanelState;
  actions: HomePanelActions;
  call: HomeDirectCall;
}
