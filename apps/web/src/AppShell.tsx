import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChannelBadgeState } from './components/WorkspaceSidebar';
import { useAuthSession } from './hooks/useAuthSession';
import { useChannelEncryption } from './hooks/useChannelEncryption';
import { useChannelReadState } from './hooks/useChannelReadState';
import { useChannelCall } from './hooks/useChannelCall';
import { useComposerAttachments } from './hooks/useComposerAttachments';
import { useDirectMessages } from './hooks/useDirectMessages';
import { usePersistentDraft } from './hooks/usePersistentDrafts';
import { useMessageHistory } from './hooks/useMessageHistory';
import { useNotifications } from './hooks/useNotifications';
import { useRealtimeSocket } from './hooks/useRealtimeSocket';
import { useSettingsActions } from './hooks/useSettingsActions';
import { useTheme } from './hooks/useTheme';
import { useThreadPanel } from './hooks/useThreadPanel';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';
import { useChatOrchestrator } from './hooks/useChatOrchestrator';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
// prettier-ignore
import { apiRequest, assetUrl, Channel, Message, ServerDetail, ServerSummary, uploadFile } from './api';
import { encryptChannelMessage } from './e2ee';
import { ActiveCallSummary } from './helpers';
import { buildMessageSearchParams, parseMessageSearchQuery } from './utils/messageSearch';
import { updateFaviconBadge } from './utils/faviconBadge';
import { executeSlashCommand } from './utils/executeSlashCommand';
import type { ActiveDialog, ActivePanel } from './components/chat/types';
import { AuthGate } from './components/app/AuthGate';
import { AuthenticatedWorkspace } from './components/app/AuthenticatedWorkspace';

export function AppShell() {
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeCalls, setActiveCalls] = useState<Record<string, ActiveCallSummary>>({});
  const [channelBadges, setChannelBadges] = useState<Record<string, ChannelBadgeState>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);

  const clearWorkspaceState = useCallback(() => {
    setActiveCalls({});
    setChannelBadges({});
  }, []);

  const {
    auth,
    setAuth,
    mode,
    setMode,
    verificationToken,
    verificationHint,
    setVerificationToken,
    error,
    submitAuth,
    submitVerification,
    clearAuth,
  } = useAuthSession({ onClearAuth: clearWorkspaceState });

  const {
    servers,
    setServers,
    server,
    setServer,
    channel,
    setChannel,
    isLoadingServers,
    inviteCode,
    setInviteCode,
    channelQuery,
    setChannelQuery,
    visibleTextChannels,
    visibleVoiceChannels,
    loadServers,
    openServer,
    createServer,
    joinInvite,
    createChannel,
  } = useWorkspaceNavigation({
    auth,
    clearAuth,
    setWorkspaceError,
    setWorkspaceNotice,
    setPendingAction,
    setActiveDialog,
    setChannelBadges,
  });

  const {
    messages,
    setMessages,
    searchResults,
    setSearchResults,
    pinnedMessagesByChannel,
    isLoadingMessages,
    setIsLoadingMessages,
    isLoadingMoreMessages,
    setIsLoadingMoreMessages,
    messageCursor,
    setMessageCursor,
    editingMessageId,
    setEditingMessageId,
    editingDraft,
    setEditingDraft,
    replyingToMessage,
    setReplyingToMessage,
    searchQuery,
    setSearchQuery,
    typingUsers,
    setTypingUsers,
    pinnedMessageIds,
    setPinnedMessageIds,
    parsedSearch,
    visibleMessages,
    pinnedMessages,
    loadPinnedMessages,
    jumpToMessage,
    togglePinnedMessage,
  } = useChatOrchestrator({
    auth,
    channel,
    setPendingAction,
    setWorkspaceError,
  });

  const channelDraft = usePersistentDraft({
    storageKey: 'discord-clone-channel-drafts',
    draftKey: channel ? `channel:${channel.id}` : null,
  });

  const {
    friendsSummary,
    directConversations,
    activeConversation,
    directMessages,
    directMessageDraft,
    setActiveConversation,
    setDirectMessages,
    setDirectConversations,
    clearDirectMessages,
    loadFriends,
    loadDirectConversations,
    requestFriend,
    respondFriendRequest,
    removeFriend,
    removeFriendRequest,
    openDirectConversation,
    markDirectConversationRead,
    startDirectConversation,
    sendDirectMessage,
    setDirectMessageDraft,
  } = useDirectMessages({
    auth,
    setPendingAction,
    setWorkspaceError,
    setWorkspaceNotice,
  });

  const {
    notifications,
    notificationUnreadCount,
    isLoadingNotifications,
    setNotificationUnreadCount,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    pushNotification,
  } = useNotifications({ auth, setWorkspaceError });

  const { uiTheme, setUiTheme } = useTheme();

  const {
    channelKeys,
    channelKeysRef,
    clearChannelKeys,
    configureChannelEncryption,
    clearChannelEncryption,
    decryptMessagesForDisplay,
    decryptMessageForDisplay,
  } = useChannelEncryption({
    channel,
    messages,
    setMessages,
    setWorkspaceError,
    setWorkspaceNotice,
  });

  const { markChannelRead } = useChannelReadState({ auth, setChannelBadges });

  const { loadMoreMessages } = useMessageHistory({
    auth,
    channel,
    messageCursor,
    isLoadingMoreMessages,
    decryptMessagesForDisplay,
    setMessages,
    setMessageCursor,
    setIsLoadingMoreMessages,
    setWorkspaceError,
  });

  const {
    channelOverrides,
    auditLogs,
    invites,
    notificationPreferences,
    profileAvatarInputRef,
    channelAvatarInputRef,
    loadNotificationPreferences,
    updateNotificationPreference,
    createInviteFromSettings,
    revokeInvite,
    updateProfileAvatar,
    updateChannelAvatar,
    updateProfile,
    updateServerSettings,
    updateChannelSettings,
    toggleChannelRoleOverride,
    toggleChannelMemberOverride,
    createRole,
    toggleRolePermission,
    deleteRole,
    toggleMemberRole,
    removeMember,
    hydratePersistentChannelBadges,
  } = useSettingsActions({
    auth,
    server,
    channel,
    activeDialog,
    uiTheme,
    setAuth,
    setServer,
    setServers,
    setChannel,
    setActiveDialog,
    setUiTheme,
    setPendingAction,
    setWorkspaceError,
    setChannelBadges,
    openServer,
  });

  const socket = useRealtimeSocket({
    auth,
    activeChannelIdRef,
    activeConversationId: activeConversation?.id,
    decryptMessageForDisplay,
    markChannelRead,
    markDirectConversationRead,
    setMessages,
    setDirectMessages,
    setDirectConversations,
    setTypingUsers,
    setServer,
    setActiveCalls,
    setChannelBadges,
    loadFriends,
    loadDirectConversations,
    pushNotification,
    setNotificationUnreadCount,
  });

  const { handleComposerInput } = useTypingIndicator({ channel, socket });

  const threadPanel = useThreadPanel({
    auth,
    socket,
    channelKeysRef,
    decryptMessageForDisplay,
    decryptMessagesForDisplay,
    setMessages,
    setWorkspaceError,
  });

  const { callState, remoteMedia, localVideoRef, startCall, endCall, toggleMute, toggleCamera } =
    useChannelCall({
      auth,
      channel,
      socket,
      setWorkspaceError,
    });

  const {
    selectedFiles,
    setSelectedFiles,
    isRecordingVoice,
    fileInputRef,
    selectFiles,
    removeSelectedFile,
    startVoiceRecording,
    stopVoiceRecording,
  } = useComposerAttachments({
    auth,
    channel,
    sendChatMessage,
    setWorkspaceError,
  });

  useEffect(() => {
    activeChannelIdRef.current = channel?.id ?? null;
  }, [channel?.id]);

  useEffect(() => {
    if (!auth) return;
    void loadServers(auth.accessToken);
    void loadFriends(auth.accessToken);
    void loadDirectConversations(auth.accessToken);
    void loadNotificationPreferences(auth.accessToken);
  }, [auth]);

  useEffect(() => {
    if (auth) return;
    clearDirectMessages();
    clearChannelKeys();
  }, [auth, clearChannelKeys, clearDirectMessages]);

  useEffect(() => {
    if (!channel || !auth) return;
    setIsLoadingMessages(true);
    setMessageCursor(null);
    setTypingUsers([]);
    setChannelBadges((current) => {
      const next = { ...current };
      delete next[channel.id];
      return next;
    });
    setReplyingToMessage(null);
    threadPanel.close();
    setSearchResults(null);
    setWorkspaceError(null);
    void apiRequest<{ messages: Message[]; nextCursor?: string | null }>(
      `/channels/${channel.id}/messages`,
      {},
      auth.accessToken,
    )
      .then(async (result) => {
        const displayMessages = await decryptMessagesForDisplay(result.messages);
        setMessages(displayMessages);
        setMessageCursor(result.nextCursor ?? null);
        const lastMessage = result.messages[result.messages.length - 1];
        void markChannelRead(channel.id, lastMessage?.id);
      })
      .catch((err) =>
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot load messages'),
      )
      .finally(() => setIsLoadingMessages(false));
    void loadPinnedMessages(channel.id, auth.accessToken);
    socket?.emit(
      'channel:join',
      { channelId: channel.id },
      (result?: { activeCall?: ActiveCallSummary | null }) => {
        setActiveCalls((current) => {
          const next = { ...current };
          if (result?.activeCall) {
            next[channel.id] = result.activeCall;
          } else {
            delete next[channel.id];
          }
          return next;
        });
      },
    );
  }, [channel?.id, auth?.accessToken, socket]);

  useEffect(() => {
    const totalUnread = Object.values(channelBadges).reduce(
      (total, badge) => total + badge.count,
      0,
    );
    updateFaviconBadge(totalUnread);
  }, [channelBadges]);

  const selectedMember = useMemo(
    () => server?.members.find((member) => member.id === selectedMemberId) ?? null,
    [server?.members, selectedMemberId],
  );

  const activeCall = channel ? (activeCalls[channel.id] ?? null) : null;

  async function sendChatMessage(content: string, files: File[]) {
    if (!auth || !channel) return false;
    if (!content && files.length === 0) return;
    setPendingAction('send-message');
    setWorkspaceError(null);
    try {
      const attachments = await Promise.all(
        files.map((file) => uploadFile(file, auth.accessToken)),
      );
      const channelKey = channelKeysRef.current[channel.id];
      const messageContent =
        content && channelKey ? await encryptChannelMessage(channelKey, content) : content;
      const payload = {
        channelId: channel.id,
        content: messageContent,
        attachments,
        replyToMessageId: replyingToMessage?.id,
      };
      socket?.emit('typing:stop', { channelId: channel.id });
      if (socket?.connected) {
        const acknowledged = await new Promise<boolean>((resolve) => {
          socket
            .timeout(5000)
            .emit(
              'message:create',
              payload,
              async (err: Error | null, result?: { message: Message }) => {
                if (err || !result?.message) {
                  setWorkspaceError('Message was not acknowledged. Try again.');
                  resolve(false);
                  return;
                }
                const displayMessage = await decryptMessageForDisplay(result.message);
                setMessages((current) =>
                  current.some((item) => item.id === displayMessage.id)
                    ? current
                    : [...current, displayMessage],
                );
                resolve(true);
              },
            );
        });
        return acknowledged;
      }
      const result = await apiRequest<{ message: Message }>(
        `/channels/${channel.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: messageContent,
            attachments,
            replyToMessageId: replyingToMessage?.id,
          }),
        },
        auth.accessToken,
      );
      const displayMessage = await decryptMessageForDisplay(result.message);
      setMessages((current) => [...current, displayMessage]);
      return true;
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot send message');
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    let content = channelDraft.value.trim();
    const files = selectedFiles;
    if (!content && files.length === 0) return;
    const commandResult = await executeSlashCommand({
      content,
      auth,
      server,
      channel,
      openServer,
      clearDraft: channelDraft.clear,
      setWorkspaceError,
      setWorkspaceNotice,
    });
    if (commandResult.handled) return;
    content = commandResult.content;
    const sent = await sendChatMessage(content, files);
    if (!sent) return;
    channelDraft.clear();
    setSelectedFiles([]);
    setReplyingToMessage(null);
  }

  async function saveMessageEdit(messageId: string) {
    if (!auth || !editingDraft.trim()) return;
    const editingMessage = messages.find((message) => message.id === messageId);
    const channelKey = editingMessage ? channelKeysRef.current[editingMessage.channelId] : null;
    const content = channelKey
      ? await encryptChannelMessage(channelKey, editingDraft.trim())
      : editingDraft.trim();
    const result = await apiRequest<{ message: Message }>(
      `/messages/${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      },
      auth.accessToken,
    );
    const displayMessage = await decryptMessageForDisplay(result.message);
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? displayMessage : message)),
    );
    setEditingMessageId(null);
    setEditingDraft('');
  }

  async function deleteMessage(messageId: string) {
    if (!auth) return;
    await apiRequest<{ message: Message }>(
      `/messages/${messageId}`,
      { method: 'DELETE' },
      auth.accessToken,
    );
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, content: '', deletedAt: new Date().toISOString() }
          : message,
      ),
    );
  }

  async function toggleReaction(message: Message, emoji: string) {
    if (!auth) return;
    if (socket?.connected && channel) {
      socket.emit('reaction:toggle', { channelId: channel.id, messageId: message.id, emoji });
      return;
    }
    const result = await apiRequest<{ message: Message }>(
      `/messages/${message.id}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      },
      auth.accessToken,
    );
    const displayMessage = await decryptMessageForDisplay(result.message);
    setMessages((current) =>
      current.map((currentMessage) =>
        currentMessage.id === message.id ? displayMessage : currentMessage,
      ),
    );
  }

  function logout() {
    endCall();
    clearAuth();
  }

  if (!auth) {
    return (
      <AuthGate
        auth={auth}
        uiTheme={uiTheme}
        setUiTheme={setUiTheme}
        authScreen={{
          error,
          mode,
          setMode,
          submitAuth,
          submitVerification,
          verificationHint,
          verificationToken,
          setVerificationToken,
        }}
      >
        {null}
      </AuthGate>
    );
  }

  const workspaceContextValue = {
    servers,
    server,
    channel,
    activePanel,
    activeDialog,
    workspaceError,
    workspaceNotice,
    pendingAction,
    openServer,
    selectChannel: setChannel,
    setActivePanel,
    setActiveDialog,
    clearWorkspaceError: () => setWorkspaceError(null),
    clearWorkspaceNotice: () => setWorkspaceNotice(null),
  };

  return (
    <WorkspaceProvider value={workspaceContextValue}>
      <AuthenticatedWorkspace
        auth={auth}
        socket={socket}
        uiTheme={uiTheme}
        setUiTheme={setUiTheme}
        server={server}
        workspace={{
          workspace: {
            auth,
            servers,
            server,
            channel,
            visibleTextChannels,
            visibleVoiceChannels,
            channelQuery,
            inviteCode,
            isLoadingServers,
            pendingAction,
            activeCalls,
            channelBadges,
          },
          profileAvatarInputRef,
          actions: {
            openHome: () => {
              setServer(null);
              setChannel(null);
            },
            openServer,
            createServer,
            joinInvite,
            createChannel,
            createInvite: async () => {
              await createInviteFromSettings();
            },
            updateProfileAvatar,
            logout,
            setChannel,
            setChannelQuery,
            setActiveDialog,
          },
        }}
        chat={{
          session: { auth, channel },
          messages: {
            all: messages,
            visible: visibleMessages,
            isLoading: isLoadingMessages,
            isLoadingMore: isLoadingMoreMessages,
            hasMore: Boolean(messageCursor),
            typingUsers,
            pinned: pinnedMessages,
            mediaSource: messages,
            pinnedIds: channel ? (pinnedMessageIds[channel.id] ?? []) : [],
            notifications,
            notificationUnreadCount,
            isLoadingNotifications,
            searchQuery,
            parsedSearch,
            loadMore: loadMoreMessages,
          },
          alerts: {
            error: workspaceError,
            notice: workspaceNotice,
            setError: setWorkspaceError,
            setNotice: setWorkspaceNotice,
          },
          panels: {
            activePanel,
            activeDialog,
            setActivePanel,
            setActiveDialog,
            setSearchQuery,
            loadNotifications,
            markNotificationRead,
            markAllNotificationsRead,
          },
          encryption: {
            isChannelEncrypted: Boolean(channel && channelKeys[channel.id]),
            configure: (passphrase: string) => configureChannelEncryption(passphrase),
            clear: () => clearChannelEncryption(),
          },
          call: {
            state: callState,
            active: activeCalls[0] ?? null,
            remoteMedia,
            localVideoRef,
            start: startCall,
            toggleMute,
            toggleCamera,
            end: endCall,
          },
          messageActions: {
            editingMessageId,
            editingDraft,
            setReplyingToMessage,
            openThread: threadPanel.openThread,
            setEditingMessageId,
            setEditingDraft,
            saveEdit: saveMessageEdit,
            delete: deleteMessage,
            toggleReaction: (msg, emoji) => toggleReaction(msg, emoji),
            togglePinned: togglePinnedMessage,
          },
          composer: {
            replyingToMessage,
            selectedFiles,
            isRecordingVoice,
            pendingAction,
            draft: channelDraft.value,
            fileInputRef,
            sendMessage,
            setDraft: channelDraft.setValue,
            startVoiceRecording,
            stopVoiceRecording,
            removeSelectedFile,
            selectFiles,
            handleInput: handleComposerInput,
          },
          thread: threadPanel,
          channelAvatar: {
            inputRef: channelAvatarInputRef,
            update: updateChannelAvatar,
          },
        }}
        members={{
          assetUrl,
          onManageMember: (memberId) => {
            setSelectedMemberId(memberId);
            setActiveDialog('member-roles');
          },
          onDirectMessage: (userId) => {
            void startDirectConversation(userId);
          },
          server,
        }}
        home={{
          home: {
            auth,
            friendsSummary,
            conversations: directConversations,
            activeConversation,
            directMessages,
            directMessageDraft,
            pendingAction,
          },
          actions: {
            requestFriend,
            respondFriendRequest,
            removeFriend,
            removeFriendRequest,
            openDirectConversation,
            startDirectConversation: (userIds) => startDirectConversation(userIds),
            sendDirectMessage,
            setDirectMessageDraft,
          },
        }}
        settings={{
          dialog: {
            activeDialog,
            setActiveDialog,
          },
          data: {
            auth,
            server,
            channel,
            selectedMember,
            channelOverrides,
            auditLogs,
            invites,
            notificationPreferences,
            pendingAction,
          },
          refs: {
            profileAvatarInputRef,
            channelAvatarInputRef,
          },
          theme: {
            uiTheme,
          },
          actions: {
            setUiTheme,
            createInviteFromSettings,
            revokeInvite,
            updateProfile,
            updateNotificationPreference,
            updateServerSettings,
            updateChannelSettings,
            toggleChannelRoleOverride,
            toggleChannelMemberOverride,
            createRole,
            toggleRolePermission,
            deleteRole,
            toggleMemberRole,
            removeMember,
            openMemberRoleEditor: (memberId) => {
              setSelectedMemberId(memberId);
              setActiveDialog('member-roles');
            },
          },
        }}
      />
    </WorkspaceProvider>
  );
}
