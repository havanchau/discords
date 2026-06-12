import type { FormEvent } from 'react';
import type {
  AuthState,
  DirectConversation,
  DirectMessage,
  FriendEntry,
  FriendRequestEntry,
  FriendsSummary,
} from '../../api';

export interface HomePanelState {
  auth: AuthState;
  friendsSummary: FriendsSummary | null;
  conversations: DirectConversation[];
  activeConversation: DirectConversation | null;
  directMessages: DirectMessage[];
  directMessageDraft: string;
  pendingAction: string | null;
}

export interface HomePanelActions {
  requestFriend: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  respondFriendRequest: (
    request: FriendRequestEntry,
    status: 'ACCEPTED' | 'REJECTED' | 'BLOCKED',
  ) => Promise<void>;
  removeFriend: (friend: FriendEntry) => Promise<void>;
  removeFriendRequest: (request: FriendRequestEntry) => Promise<void>;
  openDirectConversation: (conversation: DirectConversation) => Promise<void>;
  startDirectConversation: (userId: string) => Promise<void>;
  sendDirectMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setDirectMessageDraft: (value: string) => void;
}

export interface HomePanelProps {
  home: HomePanelState;
  actions: HomePanelActions;
}
