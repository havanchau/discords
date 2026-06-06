import type { FormEvent } from 'react';
import type {
  AuthState,
  DirectConversation,
  DirectMessage,
  FriendRequestEntry,
  FriendsSummary,
} from '../../api';

export interface HomePanelProps {
  auth: AuthState;
  friendsSummary: FriendsSummary | null;
  conversations: DirectConversation[];
  activeConversation: DirectConversation | null;
  directMessages: DirectMessage[];
  pendingAction: string | null;
  requestFriend: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  respondFriendRequest: (
    request: FriendRequestEntry,
    status: 'ACCEPTED' | 'REJECTED' | 'BLOCKED',
  ) => Promise<void>;
  openDirectConversation: (conversation: DirectConversation) => Promise<void>;
  startDirectConversation: (userId: string) => Promise<void>;
  sendDirectMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}
