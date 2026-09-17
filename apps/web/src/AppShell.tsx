import {
  FormEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChannelBadgeState } from './components/WorkspaceSidebar';
import { useSyncAccountLocale, useTranslation } from './i18n/LocaleProvider';
import { buildMemberIdentityMap } from './utils/memberIdentity';
import { useAuthSession } from './hooks/useAuthSession';
import { useChannelEncryption } from './hooks/useChannelEncryption';
import { useChannelReadState } from './hooks/useChannelReadState';
import { useChannelCall } from './hooks/useChannelCall';
import { useComposerAttachments } from './hooks/useComposerAttachments';
import { useComposerRestrictions } from './hooks/useComposerRestrictions';
import { useDirectCall } from './hooks/useDirectCall';
import { useHomeWorkspace } from './hooks/useHomeWorkspace';
import { usePersistentDraft } from './hooks/usePersistentDrafts';
import { useMessageHistory } from './hooks/useMessageHistory';
import { useNotifications } from './hooks/useNotifications';
import { useRealtimeSocket } from './hooks/useRealtimeSocket';
import { useServerEmojis } from './hooks/useServerEmojis';
import { useServerEvents } from './hooks/useServerEvents';
import { useServerModeration } from './hooks/useServerModeration';
import { useSettingsActions } from './hooks/useSettingsActions';
import { useSoundboardPlayback } from './hooks/useSoundboardPlayback';
import { useTheme } from './hooks/useTheme';
import { useThreadPanel } from './hooks/useThreadPanel';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';
import { useChatOrchestrator } from './hooks/useChatOrchestrator';
import { useChannelMessageActions } from './hooks/useChannelMessageActions';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { apiRequest, assetUrl, Message, uploadMessageAttachments } from './api';
import type { VoiceAttachmentMetadata } from '@discord-clone/shared';
import { encryptChannelMessage } from './e2ee';
import { ActiveCallSummary } from './helpers';
import { updateFaviconBadge } from './utils/faviconBadge';
import { executeSlashCommand } from './utils/executeSlashCommand';
import { memberHasServerPermission } from './utils/serverPermissions';
import type { ActiveDialog, ActivePanel } from './components/chat/types';
import { AuthGate } from './components/app/AuthGate';
import { AuthenticatedWorkspace } from './components/app/AuthenticatedWorkspace';
import { conversationDisplayName } from './components/home/conversationDisplay';
import { KeyboardShortcuts } from './components/shortcuts/KeyboardShortcuts';

// Shared empty value so channels without pins pass the same array to memoized rows each render.
const NO_PINNED_MESSAGE_IDS: string[] = [];

export function AppShell() {
  const t = useTranslation();
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [isSavedMessagesOpen, setIsSavedMessagesOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeCalls, setActiveCalls] = useState<Record<string, ActiveCallSummary>>({});
  const [channelBadges, setChannelBadges] = useState<Record<string, ChannelBadgeState>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);

  const clearWorkspaceState = useCallback(() => {
    setActiveCalls({});
    setChannelBadges({});
  }, []);

  const { auth, setAuth, clearAuth, authScreen } = useAuthSession({
    onClearAuth: clearWorkspaceState,
  });

  // Signing in on a new device adopts the language stored on the account.
  useSyncAccountLocale(auth?.user.locale);

  const {
    servers,
    server,
    channel,
    isLoadingServers,
    openHome,
    selectChannel,
    patchServer,
    patchServers,
    inviteCode,
    channelQuery,
    setChannelQuery,
    visibleTextChannels,
    visibleVoiceChannels,
    openServer,
    createServer,
    joinInvite,
    createChannel,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useWorkspaceNavigation({
    auth,
    clearAuth,
    setWorkspaceError,
    setWorkspaceNotice,
    setPendingAction,
    setActiveDialog,
  });

  const {
    messages,
    setMessages,
    setSearchResults,
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
    parsedSearch,
    visibleMessages,
    pinnedMessages,
    loadPinnedMessages,
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
    activeConversation,
    setDirectMessages,
    setDirectConversations,
    clearDirectMessages,
    removeDirectConversation,
    directConversations,
    loadFriends,
    loadDirectConversations,
    markDirectConversationRead,
    startDirectConversation,
    sendFriendRequest,
    applyDirectMessageUpdate,
    homeProps,
  } = useHomeWorkspace({
    auth,
    pendingAction,
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
    profileBannerInputRef,
    channelAvatarInputRef,
    loadNotificationPreferences,
    updateNotificationPreference,
    createInviteFromSettings,
    revokeInvite,
    updateProfileAvatar,
    updateProfileBanner,
    updateServerProfile,
    updateServerProfileAvatar,
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
  } = useSettingsActions({
    auth,
    server,
    channel,
    activeDialog,
    uiTheme,
    setAuth,
    patchServer,
    patchServers,
    selectChannel,
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
    patchServer,
    setActiveCalls,
    setChannelBadges,
    applyDirectMessageUpdate,
    removeDirectConversation,
    loadFriends,
    loadDirectConversations,
    pushNotification,
    setNotificationUnreadCount,
  });

  const { handleComposerInput } = useTypingIndicator({ channel, socket });

  const { restriction: composerRestriction, markMessageSent } = useComposerRestrictions({
    auth,
    server,
    channel,
  });

  const serverEmojis = useServerEmojis({ auth, socket, serverId: server?.id ?? null });
  const serverEvents = useServerEvents({ auth, socket, serverId: server?.id ?? null });

  const moderation = useServerModeration({
    auth,
    socket,
    server,
    patchServer,
    patchServers,
    openHome,
    setPendingAction,
    setWorkspaceError,
    setWorkspaceNotice,
  });

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

  const soundboard = useSoundboardPlayback(socket, callState?.channelId ?? null);

  function conversationLabel(conversationId: string, fallback: string) {
    const conversation = directConversations.find((item) => item.id === conversationId);
    return conversation && auth ? conversationDisplayName(conversation, auth.user.id) : fallback;
  }

  const {
    incomingCall,
    outgoingCall,
    startDirectCall,
    acceptIncomingCall,
    declineIncomingCall,
    endDirectCall,
  } = useDirectCall({
    socket,
    viewerId: auth?.user.id ?? null,
    callState,
    remoteMedia,
    startCall,
    endCall,
    getConversationLabel: conversationLabel,
    setWorkspaceError,
    setWorkspaceNotice,
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
    destination: channel ? { type: 'channel', id: channel.id } : null,
    sendVoiceMessage: (file, voice) => sendChatMessage('', [file], voice),
    setWorkspaceError,
  });

  useEffect(() => {
    activeChannelIdRef.current = channel?.id ?? null;
  }, [channel?.id]);

  const loadAccountData = useEffectEvent((token: string) => {
    void loadFriends(token);
    void loadDirectConversations(token);
    void loadNotificationPreferences();
  });
  useEffect(() => {
    if (!auth) return;
    loadAccountData(auth.accessToken);
  }, [auth]);

  useEffect(() => {
    if (auth) return;
    clearDirectMessages();
    clearChannelKeys();
  }, [auth, clearChannelKeys, clearDirectMessages]);

  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);

  const openChannel = useEffectEvent(() => {
    if (!channel || !auth) return;
    setIsLoadingMessages(true);
    setMessageCursor(null);
    setFirstUnreadMessageId(null);
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
    void apiRequest<{
      messages: Message[];
      nextCursor?: string | null;
      lastReadMessageId?: string | null;
      lastReadAt?: string | null;
    }>(
      `/channels/${channel.id}/messages`,
      {},
      auth.accessToken,
    )
      .then(async (result) => {
        const displayMessages = await decryptMessagesForDisplay(result.messages);
        setMessages(displayMessages);
        setMessageCursor(result.nextCursor ?? null);

        let unreadId: string | null = null;
        if (result.lastReadAt && displayMessages.length > 0) {
          const lastReadTime = new Date(result.lastReadAt).getTime();
          const firstMsgTime = new Date(displayMessages[0].createdAt).getTime();
          const lastMsgTime = new Date(displayMessages[displayMessages.length - 1].createdAt).getTime();

          if (lastReadTime >= firstMsgTime && lastReadTime < lastMsgTime) {
            const firstUnread = displayMessages.find(
              (m) => new Date(m.createdAt).getTime() > lastReadTime,
            );
            unreadId = firstUnread?.id ?? null;
          }
        } else if (result.lastReadMessageId && displayMessages.length > 0) {
          const idx = displayMessages.findIndex((m) => m.id === result.lastReadMessageId);
          if (idx !== -1 && idx < displayMessages.length - 1) {
            unreadId = displayMessages[idx + 1].id;
          }
        }
        setFirstUnreadMessageId(unreadId);

        const lastMessage = result.messages[result.messages.length - 1];
        void markChannelRead(channel.id, lastMessage?.id);
      })
      .catch((err) =>
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-load-messages'),
        ),
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
  });
  // Opening a channel resets and refetches its state, so it runs on a new channel, token or socket only.
  useEffect(() => {
    openChannel();
  }, [channel?.id, auth?.accessToken, socket]);

  useEffect(() => {
    const totalUnread = Object.values(channelBadges).reduce(
      (total, badge) => total + badge.count,
      0,
    );
    updateFaviconBadge(totalUnread);
  }, [channelBadges]);

  // Per-server nicknames and avatars, resolved once per member list change rather than per row.
  const memberIdentities = useMemo(
    () => buildMemberIdentityMap(server?.members),
    [server?.members],
  );

  const selectedMember = useMemo(
    () => server?.members.find((member) => member.id === selectedMemberId) ?? null,
    [server?.members, selectedMemberId],
  );

  async function sendChatMessage(
    content: string,
    files: File[],
    voice?: VoiceAttachmentMetadata | null,
    stickerId?: string,
  ) {
    if (!auth || !channel) return false;
    if (!content && files.length === 0 && !stickerId) return;
    setPendingAction('send-message');
    setWorkspaceError(null);
    try {
      const attachments = await uploadMessageAttachments(files, auth.accessToken, voice);
      const channelKey = channelKeysRef.current[channel.id];
      const messageContent =
        content && channelKey ? await encryptChannelMessage(channelKey, content) : content;
      const payload = {
        channelId: channel.id,
        content: messageContent,
        attachments,
        replyToMessageId: replyingToMessage?.id,
        stickerId,
      };
      socket?.emit('typing:stop', { channelId: channel.id });
      if (socket?.connected) {
        const acknowledged = await new Promise<boolean>((resolve) => {
          socket
            .timeout(5000)
            .emit(
              'message:create',
              payload,
              async (err: Error | null, result?: { message?: Message; error?: string }) => {
                if (err || !result?.message) {
                  setWorkspaceError(result?.error ?? 'Message was not acknowledged. Try again.');
                  resolve(false);
                  return;
                }
                markMessageSent(channel.id);
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
            stickerId,
          }),
        },
        auth.accessToken,
      );
      const displayMessage = await decryptMessageForDisplay(result.message);
      setMessages((current) => [...current, displayMessage]);
      markMessageSent(channel.id);
      return true;
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-send-message'),
      );
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
      isChannelEncrypted: Boolean(channel && channelKeys[channel.id]),
      auth,
      server,
      channel,
      openServer,
      clearDraft: channelDraft.clear,
      addMessage: (message) =>
        setMessages((current) =>
          current.some((item) => item.id === message.id) ? current : [...current, message],
        ),
      setWorkspaceError,
      setWorkspaceNotice,
      t,
    });
    if (commandResult.handled) return;
    content = commandResult.content;
    const sent = await sendChatMessage(content, files);
    if (!sent) return;
    channelDraft.clear();
    setSelectedFiles([]);
    setReplyingToMessage(null);
  }

  const messageActions = useChannelMessageActions({
    auth,
    socket,
    channel,
    messages,
    channelKeysRef,
    decryptMessageForDisplay,
    setMessages,
    editingMessageId,
    editingDraft,
    setEditingMessageId,
    setEditingDraft,
    setReplyingToMessage,
    openThread: threadPanel.openThread,
    togglePinnedMessage,
    canManageMessages: Boolean(
      auth && memberHasServerPermission(server, auth.user.id, 'MANAGE_MESSAGES'),
    ),
  });

  function logout() {
    endDirectCall();
    clearAuth();
  }

  if (!auth || !homeProps) {
    return (
      <AuthGate auth={auth} uiTheme={uiTheme} setUiTheme={setUiTheme} authScreen={authScreen}>
        {null}
      </AuthGate>
    );
  }

  const workspaceContextValue = {
    servers,
    directConversations,
    server,
    channel,
    activePanel,
    activeDialog,
    workspaceError,
    workspaceNotice,
    pendingAction,
    openServer,
    selectChannel,
    setActivePanel,
    setActiveDialog,
    isChannelEncrypted: (channelId: string) => Boolean(channelKeys[channelId]),
    openSavedMessages: () => setIsSavedMessagesOpen(true),
    clearWorkspaceError: () => setWorkspaceError(null),
    clearWorkspaceNotice: () => setWorkspaceNotice(null),
  };

  return (
    <WorkspaceProvider value={workspaceContextValue}>
      <KeyboardShortcuts
        viewerId={auth.user.id}
        visibleTextChannels={visibleTextChannels}
        channelBadges={channelBadges}
        activeConversation={activeConversation}
        openHome={openHome}
        openDirectConversation={homeProps.actions.openDirectConversation}
        markChannelRead={markChannelRead}
        markDirectConversationRead={markDirectConversationRead}
      />
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
          serverEvents,
          actions: {
            openHome,
            openServer,
            createServer,
            joinInvite,
            createChannel,
            createCategory,
            updateCategory,
            deleteCategory,
            createInvite: async () => {
              await createInviteFromSettings();
            },
            updateProfileAvatar,
            logout,
            selectChannel,
            setChannelQuery,
            setActiveDialog,
          },
        }}
        chat={{
          session: { auth, channel, memberIdentities },
          messages: {
            all: messages,
            visible: visibleMessages,
            isLoading: isLoadingMessages,
            isLoadingMore: isLoadingMoreMessages,
            hasMore: Boolean(messageCursor),
            firstUnreadMessageId,
            typingUsers,
            pinned: pinnedMessages,
            mediaSource: messages,
            pinnedIds: channel
              ? (pinnedMessageIds[channel.id] ?? NO_PINNED_MESSAGE_IDS)
              : NO_PINNED_MESSAGE_IDS,
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
            end: endDirectCall,
            soundboard,
          },
          messageActions: {
            ...messageActions,
            startDirectConversation: (userId: string) => void startDirectConversation(userId),
            sendFriendRequest: (usernameOrEmail: string) => void sendFriendRequest(usernameOrEmail),
          },
          composer: {
            restriction: composerRestriction,
            replyingToMessage,
            selectedFiles,
            isRecordingVoice,
            pendingAction,
            draft: channelDraft.value,
            fileInputRef,
            sendMessage,
            sendSticker: async (stickerId: string) => {
              if (await sendChatMessage('', [], null, stickerId)) setReplyingToMessage(null);
            },
            clearAfterSchedule: () => {
              channelDraft.clear();
              setSelectedFiles([]);
              setReplyingToMessage(null);
            },
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
          accessToken: auth.accessToken,
          viewerId: auth.user.id,
          onManageMember: (memberId) => {
            setSelectedMemberId(memberId);
            setActiveDialog('member-roles');
          },
          onDirectMessage: (userId) => {
            void startDirectConversation(userId);
          },
          onAddFriend: (usernameOrEmail) => {
            void sendFriendRequest(usernameOrEmail);
          },
          server,
        }}
        home={{
          ...homeProps,
          call: {
            state: callState,
            activeCalls,
            remoteMedia,
            localVideoRef,
            outgoingCall,
            startDirectCall,
            toggleMute,
            toggleCamera,
            end: endDirectCall,
          },
        }}
        serverEmojis={serverEmojis.emojis}
        savedMessages={{
          open: isSavedMessagesOpen,
          onOpenChange: setIsSavedMessagesOpen,
          conversations: homeProps.home.conversations,
          onOpenChannel: (serverId, channelId) => {
            void openServer(serverId);
            selectChannel(channelId);
          },
          onOpenConversation: (conversation) => {
            openHome();
            void homeProps.actions.openDirectConversation(conversation);
          },
        }}
        incomingCall={{
          incomingCall,
          conversationLabel: incomingCall
            ? conversationLabel(incomingCall.conversationId, incomingCall.caller.displayName)
            : null,
          onAccept: acceptIncomingCall,
          onDecline: declineIncomingCall,
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
            bans: moderation.bans,
            isLoadingBans: moderation.isLoadingBans,
            bansError: moderation.bansError,
            emojis: serverEmojis.emojis,
            isLoadingEmojis: serverEmojis.isLoading,
            emojisError: serverEmojis.error,
          },
          refs: {
            profileAvatarInputRef,
            profileBannerInputRef,
            channelAvatarInputRef,
          },
          theme: {
            uiTheme,
          },
          actions: {
            setUiTheme,
            signOut: logout,
            createInviteFromSettings,
            revokeInvite,
            updateProfile,
            updateProfileBanner,
            updateServerProfile,
            updateServerProfileAvatar,
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
            loadBans: moderation.loadBans,
            banMember: moderation.banMember,
            unbanUser: moderation.unbanUser,
            timeoutMember: moderation.timeoutMember,
            createEmoji: serverEmojis.createEmoji,
            deleteEmoji: serverEmojis.deleteEmoji,
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
