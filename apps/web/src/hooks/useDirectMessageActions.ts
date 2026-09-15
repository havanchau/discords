import { Dispatch, SetStateAction, useCallback, useRef, useState } from 'react';
import { apiRequest, AuthState, DirectConversation, DirectMessage } from '../api';
import { replaceConversationPreview, replaceDirectMessage } from '../utils/directMessages';

interface UseDirectMessageActionsOptions {
  auth: AuthState | null;
  setDirectMessages: Dispatch<SetStateAction<DirectMessage[]>>;
  setDirectConversations: Dispatch<SetStateAction<DirectConversation[]>>;
  setWorkspaceError: (message: string | null) => void;
}

export function useDirectMessageActions({
  auth,
  setDirectMessages,
  setDirectConversations,
  setWorkspaceError,
}: UseDirectMessageActionsOptions) {
  const [pinnedDirectMessages, setPinnedDirectMessages] = useState<DirectMessage[]>([]);
  const [isLoadingPins, setIsLoadingPins] = useState(false);
  const [pinsError, setPinsError] = useState<string | null>(null);
  // The pinned list belongs to one conversation; updates for other conversations must not leak in.
  const pinsConversationIdRef = useRef<string | null>(null);

  // Shared by API responses and realtime events so both reconcile the same way.
  const applyDirectMessageUpdate = useCallback(
    (message: DirectMessage) => {
      setDirectMessages((current) => replaceDirectMessage(current, message));
      setDirectConversations((current) => replaceConversationPreview(current, message));
      if (message.conversationId !== pinsConversationIdRef.current) return;
      setPinnedDirectMessages((current) => {
        const withoutMessage = current.filter((item) => item.id !== message.id);
        if (!message.pinnedAt || message.deletedAt) {
          return withoutMessage.length === current.length ? current : withoutMessage;
        }
        return current.some((item) => item.id === message.id)
          ? current.map((item) => (item.id === message.id ? message : item))
          : [message, ...current];
      });
    },
    [setDirectConversations, setDirectMessages],
  );

  async function runMessageAction(path: string, init: RequestInit, fallbackError: string) {
    if (!auth) return;
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ message: DirectMessage }>(path, init, auth.accessToken);
      applyDirectMessageUpdate(result.message);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : fallbackError);
    }
  }

  function editDirectMessage(messageId: string, content: string) {
    return runMessageAction(
      `/direct-messages/${messageId}`,
      { method: 'PATCH', body: JSON.stringify({ content }) },
      'Cannot edit message',
    );
  }

  function deleteDirectMessage(messageId: string) {
    return runMessageAction(
      `/direct-messages/${messageId}`,
      { method: 'DELETE' },
      'Cannot delete message',
    );
  }

  function toggleDirectReaction(messageId: string, emoji: string) {
    return runMessageAction(
      `/direct-messages/${messageId}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji }) },
      'Cannot update reaction',
    );
  }

  function toggleDirectPin(messageId: string) {
    return runMessageAction(
      `/direct-messages/${messageId}/pins`,
      { method: 'POST' },
      'Cannot update pin',
    );
  }

  async function loadDirectPins(conversationId: string) {
    if (!auth) return;
    if (pinsConversationIdRef.current !== conversationId) setPinnedDirectMessages([]);
    pinsConversationIdRef.current = conversationId;
    setIsLoadingPins(true);
    setPinsError(null);
    try {
      const result = await apiRequest<{ messages: DirectMessage[] }>(
        `/direct-conversations/${conversationId}/pins`,
        {},
        auth.accessToken,
      );
      if (pinsConversationIdRef.current === conversationId) {
        setPinnedDirectMessages(result.messages);
      }
    } catch (err) {
      setPinsError(err instanceof Error ? err.message : 'Cannot load pinned messages');
    } finally {
      setIsLoadingPins(false);
    }
  }

  return {
    pinnedDirectMessages,
    isLoadingPins,
    pinsError,
    applyDirectMessageUpdate,
    editDirectMessage,
    deleteDirectMessage,
    toggleDirectReaction,
    toggleDirectPin,
    loadDirectPins,
  };
}
