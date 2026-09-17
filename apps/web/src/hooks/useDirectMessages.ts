import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  apiRequest,
  AuthState,
  DirectConversation,
  DirectMessage,
  FriendEntry,
  FriendRequestEntry,
  FriendsSummary,
  uploadMessageAttachments,
} from '@/api';
import type { VoiceAttachmentMetadata } from '@discord-clone/shared';
import { usePersistentDrafts } from './usePersistentDrafts';
import { useTranslation } from '@/i18n/LocaleProvider';
import { formText } from '@/utils/formText';
import { parsePollCommand } from '@/utils/polls';
import { parseSlashCommand } from '@/utils/slashCommands';

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
  const t = useTranslation();
  const [friendsSummary, setFriendsSummary] = useState<FriendsSummary | null>(null);
  const [directConversations, setDirectConversations] = useState<DirectConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<DirectConversation | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [replyingToDirectMessage, setReplyingToDirectMessage] = useState<DirectMessage | null>(
    null,
  );
  const directDrafts = usePersistentDrafts({ storageKey: 'discord-clone-direct-drafts' });
  const activeDraftKey = activeConversation ? `conversation:${activeConversation.id}` : null;
  const directMessageDraft = directDrafts.getDraft(activeDraftKey);

  const clearDirectMessages = useCallback(() => {
    setFriendsSummary(null);
    setDirectConversations([]);
    setActiveConversation(null);
    setDirectMessages([]);
    setReplyingToDirectMessage(null);
  }, []);

  async function loadFriends(token = auth?.accessToken) {
    if (!token) return;
    try {
      const result = await apiRequest<FriendsSummary>('/friends', {}, token);
      setFriendsSummary(result);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-load-friends'),
      );
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
      // Keep the open conversation's name and members current after group changes.
      setActiveConversation((current) =>
        current
          ? (result.conversations.find((conversation) => conversation.id === current.id) ?? current)
          : current,
      );
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-load-direct-messages'),
      );
    }
  }

  const activeConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id ?? null;
  }, [activeConversation?.id]);

  const removeDirectConversation = useCallback((conversationId: string) => {
    setDirectConversations((current) =>
      current.filter((conversation) => conversation.id !== conversationId),
    );
    if (activeConversationIdRef.current !== conversationId) return;
    setActiveConversation(null);
    setDirectMessages([]);
    setReplyingToDirectMessage(null);
  }, []);

  /** Shared by the add-friend form and the profile card, which knows a username but no form. */
  async function sendFriendRequest(usernameOrEmail: string, onSent?: () => void) {
    if (!auth || !usernameOrEmail.trim()) return;
    setPendingAction('friend-request');
    setWorkspaceError(null);
    try {
      await apiRequest(
        '/friends/requests',
        { method: 'POST', body: JSON.stringify({ usernameOrEmail }) },
        auth.accessToken,
      );
      onSent?.();
      await loadFriends(auth.accessToken);
      setWorkspaceNotice(t('notice.friendRequestSent'));
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-send-friend-request'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function requestFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await sendFriendRequest(formText(form, 'usernameOrEmail'), () => formElement.reset());
  }

  async function respondFriendRequest(
    request: FriendRequestEntry,
    status: 'ACCEPTED' | 'REJECTED',
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-friend-request'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function removeFriendRequest(request: FriendRequestEntry) {
    if (!auth) return;
    setPendingAction(`friend-remove-${request.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest(`/friends/requests/${request.id}`, { method: 'DELETE' }, auth.accessToken);
      await loadFriends(auth.accessToken);
      setWorkspaceNotice(t('notice.friendRequestRemoved'));
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-remove-friend-request'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function removeFriend(friend: FriendEntry) {
    if (!auth) return;
    setPendingAction(`friend-remove-${friend.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest(`/friends/requests/${friend.id}`, { method: 'DELETE' }, auth.accessToken);
      await Promise.all([loadFriends(auth.accessToken), loadDirectConversations(auth.accessToken)]);
      setWorkspaceNotice(t('notice.friendRemoved'));
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-remove-friend'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function blockUser(userId: string) {
    if (!auth) return;
    setPendingAction(`block-${userId}`);
    setWorkspaceError(null);
    try {
      await apiRequest(
        '/friends/blocks',
        { method: 'POST', body: JSON.stringify({ userId }) },
        auth.accessToken,
      );
      await Promise.all([loadFriends(auth.accessToken), loadDirectConversations(auth.accessToken)]);
      setWorkspaceNotice(t('notice.userBlocked'));
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : t('error.fallback.cannot-block-user'));
    } finally {
      setPendingAction(null);
    }
  }

  async function unblockUser(userId: string) {
    if (!auth) return;
    setPendingAction(`unblock-${userId}`);
    setWorkspaceError(null);
    try {
      await apiRequest(`/friends/blocks/${userId}`, { method: 'DELETE' }, auth.accessToken);
      await loadFriends(auth.accessToken);
      setWorkspaceNotice(t('notice.userUnblocked'));
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-unblock-user'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function markDirectConversationRead(conversationId: string, messageId?: string) {
    if (!auth) return;
    try {
      await apiRequest(
        `/direct-conversations/${conversationId}/read`,
        { method: 'POST', body: JSON.stringify({ messageId }) },
        auth.accessToken,
      );
      setDirectConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
        ),
      );
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-mark-direct-message-read'),
      );
    }
  }

  async function openDirectConversation(conversation: DirectConversation) {
    if (!auth) return;
    if (activeConversation?.id !== conversation.id) setReplyingToDirectMessage(null);
    // Set eagerly so a slower response for a previously opened conversation is ignored.
    activeConversationIdRef.current = conversation.id;
    setActiveConversation(conversation);
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ messages: DirectMessage[] }>(
        `/direct-conversations/${conversation.id}/messages`,
        {},
        auth.accessToken,
      );
      if (activeConversationIdRef.current !== conversation.id) return;
      setDirectMessages(result.messages);
      setDirectConversations((current) =>
        current.map((item) => (item.id === conversation.id ? { ...item, unreadCount: 0 } : item)),
      );
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-open-conversation'),
      );
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-start-direct-message'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  /** Resolves true when the message was sent, so the composer can clear its selected files. */
  async function sendDirectMessage(event: FormEvent<HTMLFormElement>, files: File[] = []) {
    event.preventDefault();
    if (!auth || !activeConversation) return false;
    const conversationId = activeConversation.id;
    const draftKey = activeDraftKey;
    const content = directMessageDraft.trim();
    if (!content && !files.length) return false;
    // `/poll` is the only slash command direct messages run; any other text is sent as typed.
    // A message with files is always sent as a message, never parsed as a command.
    const command = files.length ? null : parseSlashCommand(content);
    const poll = command?.name === 'poll' ? parsePollCommand(command.args, Date.now()) : null;
    if (poll && 'errorKey' in poll) {
      setWorkspaceError(t(poll.errorKey, poll.errorVars));
      return false;
    }
    setPendingAction('direct-message');
    setWorkspaceError(null);
    try {
      const attachments = await uploadMessageAttachments(files, auth.accessToken);
      const result = await apiRequest<{ message: DirectMessage }>(
        poll
          ? `/conversations/${conversationId}/polls`
          : `/direct-conversations/${conversationId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(
            poll
              ? poll.input
              : { content, attachments, replyToMessageId: replyingToDirectMessage?.id },
          ),
        },
        auth.accessToken,
      );
      directDrafts.clearDraft(draftKey);
      await showSentDirectMessage(auth.accessToken, conversationId, result.message);
      return true;
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-send-direct-message'),
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  /** Sends a recorded voice note on its own, leaving the typed draft untouched. */
  async function sendDirectVoiceMessage(file: File, voice: VoiceAttachmentMetadata | null) {
    if (!auth || !activeConversation) return false;
    const conversationId = activeConversation.id;
    setPendingAction('direct-message');
    setWorkspaceError(null);
    try {
      const attachments = await uploadMessageAttachments([file], auth.accessToken, voice);
      const result = await apiRequest<{ message: DirectMessage }>(
        `/direct-conversations/${conversationId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: '',
            attachments,
            replyToMessageId: replyingToDirectMessage?.id,
          }),
        },
        auth.accessToken,
      );
      await showSentDirectMessage(auth.accessToken, conversationId, result.message);
      return true;
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-send-direct-message'),
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function showSentDirectMessage(
    token: string,
    conversationId: string,
    message: DirectMessage,
  ) {
    await loadDirectConversations(token);
    // The user may have switched conversations while the request was in flight.
    if (activeConversationIdRef.current !== conversationId) return;
    setReplyingToDirectMessage(null);
    setDirectMessages((current) =>
      current.some((item) => item.id === message.id) ? current : [...current, message],
    );
  }

  return {
    friendsSummary,
    directConversations,
    activeConversation,
    directMessages,
    directMessageDraft,
    replyingToDirectMessage,
    setReplyingToDirectMessage,
    setActiveConversation,
    setDirectMessages,
    setDirectConversations,
    setDirectMessageDraft: (value: string) => directDrafts.updateDraft(activeDraftKey, value),
    clearDirectMessages,
    removeDirectConversation,
    loadFriends,
    loadDirectConversations,
    requestFriend,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
    removeFriendRequest,
    blockUser,
    unblockUser,
    openDirectConversation,
    markDirectConversationRead,
    startDirectConversation,
    sendDirectMessage,
    sendDirectVoiceMessage,
  };
}
