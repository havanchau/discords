import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  apiRequest,
  AuthState,
  DirectConversation,
  DirectConversationWithMute,
  DirectMessage,
  FriendEntry,
  FriendRequestEntry,
  FriendsSummary,
  MuteDuration,
  muteDirectConversation,
  uploadMessageAttachments,
} from '@/api';
import type { VoiceAttachmentMetadata } from '@discord-clone/shared';
import { useDirectMessageDecryption } from './useDirectMessageDecryption';
import type { DeviceKeysState } from './useDeviceKeys';
import { usePersistentDrafts } from './usePersistentDrafts';
import { useScopeKeys } from './useScopeKeys';
import { useTranslation } from '@/i18n/LocaleProvider';
import { formText } from '@/utils/formText';
import { parsePollCommand } from '@/utils/polls';
import { parseSlashCommand } from '@/utils/slashCommands';

/** How often an open encrypted conversation hands its key to new devices and retries locked messages. */
const MAINTENANCE_INTERVAL_MS = 20_000;
/** `DirectConversation.encryptionKeyVersion` starts at 1 (the channel counterpart starts at 0). */
const DEFAULT_CONVERSATION_KEY_VERSION = 1;

interface UseDirectMessagesOptions {
  auth: AuthState | null;
  deviceKeys: DeviceKeysState;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

export function useDirectMessages({
  auth,
  deviceKeys,
  setPendingAction,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseDirectMessagesOptions) {
  const t = useTranslation();
  const [friendsSummary, setFriendsSummary] = useState<FriendsSummary | null>(null);
  // Both lists hold what the server sent (ciphertext included); `useDirectMessageDecryption` below
  // derives the readable versions that this hook returns.
  const [rawDirectConversations, setDirectConversations] = useState<DirectConversationWithMute[]>(
    [],
  );
  const [activeConversation, setActiveConversation] = useState<DirectConversationWithMute | null>(
    null,
  );
  const [rawDirectMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [replyingToDirectMessage, setReplyingToDirectMessage] = useState<DirectMessage | null>(
    null,
  );
  const scopeKeys = useScopeKeys({ auth, deviceKeys, onError: setWorkspaceError });
  const { encryptContent, shareCurrentKey } = scopeKeys;
  const decryption = useDirectMessageDecryption({
    messages: rawDirectMessages,
    conversations: rawDirectConversations,
    decryptContent: scopeKeys.decryptContent,
    keyEpoch: scopeKeys.keyEpoch,
  });
  const directMessages = decryption.messages;
  const directConversations = decryption.conversations;
  const { retryLocked } = decryption;
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
      const result = await apiRequest<{ conversations: DirectConversationWithMute[] }>(
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

  // The newest conversation list entry wins over the open conversation's copy, which can be older.
  const findConversation = useCallback(
    (conversationId: string) =>
      rawDirectConversations.find((conversation) => conversation.id === conversationId) ??
      (activeConversation?.id === conversationId ? activeConversation : undefined),
    [rawDirectConversations, activeConversation],
  );
  const findConversationRef = useRef(findConversation);
  useEffect(() => {
    findConversationRef.current = findConversation;
  }, [findConversation]);
  const rawMessagesRef = useRef(rawDirectMessages);
  useEffect(() => {
    rawMessagesRef.current = rawDirectMessages;
  }, [rawDirectMessages]);

  /** Plaintext in, wire format out; throws (so the send fails) rather than ever sending plaintext. */
  const encryptForConversation = useCallback(
    async (conversationId: string, plaintext: string) => {
      if (plaintext === '') return plaintext;
      const conversation = findConversationRef.current(conversationId);
      if (!conversation) throw new Error(t('encryption.error.unknownChannel'));
      return encryptContent(
        {
          kind: 'conversation',
          id: conversation.id,
          isEncrypted: Boolean(conversation.isEncrypted),
          version: conversation.encryptionKeyVersion ?? DEFAULT_CONVERSATION_KEY_VERSION,
        },
        plaintext,
      );
    },
    [encryptContent, t],
  );

  /** For an edit, which only knows the message id: encrypts for the conversation it belongs to. */
  const encryptDirectMessageEdit = useCallback(
    (messageId: string, plaintext: string) => {
      const message = rawMessagesRef.current.find((item) => item.id === messageId);
      if (!message) throw new Error(t('encryption.error.unknownChannel'));
      return encryptForConversation(message.conversationId, plaintext);
    },
    [encryptForConversation, t],
  );

  const activeEncryptedConversationId = activeConversation?.isEncrypted
    ? activeConversation.id
    : null;
  const activeKeyVersion =
    activeConversation?.encryptionKeyVersion ?? DEFAULT_CONVERSATION_KEY_VERSION;
  useEffect(() => {
    if (!activeEncryptedConversationId || !deviceKeys.identity) return;
    const scope = {
      kind: 'conversation' as const,
      id: activeEncryptedConversationId,
      isEncrypted: true,
      version: activeKeyVersion,
    };
    const maintain = async () => {
      try {
        await shareCurrentKey(scope);
        retryLocked();
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('encryption.error.keyShareFailed'),
        );
      }
    };
    void maintain();
    const timer = window.setInterval(() => void maintain(), MAINTENANCE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [
    activeEncryptedConversationId,
    activeKeyVersion,
    deviceKeys.identity,
    shareCurrentKey,
    retryLocked,
    setWorkspaceError,
    t,
  ]);

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

  /**
   * `PATCH .../mute`, then refetch the list (docs/features/dm-conversation-mute.md) — the same
   * "write then refetch" shape `useGroupConversations.ts`'s `runGroupAction` uses for a
   * conversation-scoped write, generalized here since mute applies to every conversation, not only
   * groups.
   */
  async function muteDirectConversationAction(conversationId: string, muteDuration?: MuteDuration) {
    if (!auth) return;
    setPendingAction(`mute-${conversationId}`);
    setWorkspaceError(null);
    try {
      await muteDirectConversation(conversationId, { muted: true, muteDuration }, auth.accessToken);
      await loadDirectConversations(auth.accessToken);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-mute-conversation'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function unmuteDirectConversation(conversationId: string) {
    if (!auth) return;
    setPendingAction(`mute-${conversationId}`);
    setWorkspaceError(null);
    try {
      await muteDirectConversation(conversationId, { muted: false }, auth.accessToken);
      await loadDirectConversations(auth.accessToken);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-mute-conversation'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  /** Back to the friends/DM list; only the single-pane Home layout (below desktop width) offers it. */
  function closeDirectConversation() {
    activeConversationIdRef.current = null;
    setActiveConversation(null);
    setDirectMessages([]);
    setReplyingToDirectMessage(null);
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
      // Encrypt first: a failure must not leave freshly uploaded attachments behind, and it must
      // fail the send instead of falling back to plaintext. A poll carries no message content.
      const messageContent = poll ? content : await encryptForConversation(conversationId, content);
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
              : {
                  content: messageContent,
                  attachments,
                  replyToMessageId: replyingToDirectMessage?.id,
                },
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
    encryptDirectMessageEdit,
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
    closeDirectConversation,
    markDirectConversationRead,
    startDirectConversation,
    sendDirectMessage,
    sendDirectVoiceMessage,
    muteDirectConversation: muteDirectConversationAction,
    unmuteDirectConversation,
  };
}
