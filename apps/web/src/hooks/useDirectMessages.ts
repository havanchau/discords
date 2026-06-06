import { FormEvent, useCallback, useState } from 'react';
import {
  apiRequest,
  AuthState,
  DirectConversation,
  DirectMessage,
  FriendRequestEntry,
  FriendsSummary,
} from '../api';

interface UseDirectMessagesOptions {
  auth: AuthState | null;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

export function useDirectMessages({
  auth,
  setPendingAction,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseDirectMessagesOptions) {
  const [friendsSummary, setFriendsSummary] = useState<FriendsSummary | null>(null);
  const [directConversations, setDirectConversations] = useState<DirectConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<DirectConversation | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);

  const clearDirectMessages = useCallback(() => {
    setFriendsSummary(null);
    setDirectConversations([]);
    setActiveConversation(null);
    setDirectMessages([]);
  }, []);

  async function loadFriends(token = auth?.accessToken) {
    if (!token) return;
    try {
      const result = await apiRequest<FriendsSummary>('/friends', {}, token);
      setFriendsSummary(result);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot load friends');
    }
  }

  async function loadDirectConversations(token = auth?.accessToken) {
    if (!token) return;
    try {
      const result = await apiRequest<{ conversations: DirectConversation[] }>(
        '/direct-conversations',
        {},
        token,
      );
      setDirectConversations(result.conversations);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot load direct messages');
    }
  }

  async function requestFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPendingAction('friend-request');
    setWorkspaceError(null);
    try {
      await apiRequest(
        '/friends/requests',
        {
          method: 'POST',
          body: JSON.stringify({ usernameOrEmail: String(form.get('usernameOrEmail') || '') }),
        },
        auth.accessToken,
      );
      formElement.reset();
      await loadFriends(auth.accessToken);
      setWorkspaceNotice('Friend request sent.');
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot send friend request');
    } finally {
      setPendingAction(null);
    }
  }

  async function respondFriendRequest(
    request: FriendRequestEntry,
    status: 'ACCEPTED' | 'REJECTED' | 'BLOCKED',
  ) {
    if (!auth) return;
    setPendingAction(`friend-${request.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest(
        `/friends/requests/${request.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
        auth.accessToken,
      );
      await loadFriends(auth.accessToken);
      setWorkspaceNotice(
        status === 'ACCEPTED' ? 'Friend request accepted.' : 'Friend request updated.',
      );
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update friend request');
    } finally {
      setPendingAction(null);
    }
  }

  async function openDirectConversation(conversation: DirectConversation) {
    if (!auth) return;
    setActiveConversation(conversation);
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ messages: DirectMessage[] }>(
        `/direct-conversations/${conversation.id}/messages`,
        {},
        auth.accessToken,
      );
      setDirectMessages(result.messages);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot open conversation');
    }
  }

  async function startDirectConversation(userId: string) {
    if (!auth) return;
    setPendingAction(`dm-${userId}`);
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ conversation: DirectConversation }>(
        `/friends/${userId}/dm`,
        { method: 'POST' },
        auth.accessToken,
      );
      await loadDirectConversations(auth.accessToken);
      await openDirectConversation(result.conversation);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot start direct message');
    } finally {
      setPendingAction(null);
    }
  }

  async function sendDirectMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !activeConversation) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const content = String(form.get('content') || '').trim();
    if (!content) return;
    setPendingAction('direct-message');
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ message: DirectMessage }>(
        `/direct-conversations/${activeConversation.id}/messages`,
        { method: 'POST', body: JSON.stringify({ content }) },
        auth.accessToken,
      );
      formElement.reset();
      setDirectMessages((current) => [...current, result.message]);
      await loadDirectConversations(auth.accessToken);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot send direct message');
    } finally {
      setPendingAction(null);
    }
  }

  return {
    friendsSummary,
    directConversations,
    activeConversation,
    directMessages,
    setActiveConversation,
    setDirectMessages,
    clearDirectMessages,
    loadFriends,
    loadDirectConversations,
    requestFriend,
    respondFriendRequest,
    openDirectConversation,
    startDirectConversation,
    sendDirectMessage,
  };
}
