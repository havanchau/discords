import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ChannelBadgeState } from './components/WorkspaceSidebar';
import { useSyncAccountLocale, useTranslation } from './i18n/LocaleProvider';
import { buildMemberIdentityMap } from './utils/memberIdentity';
import { useAuthSession } from './hooks/useAuthSession';
import { useChannelEncryption } from './hooks/useChannelEncryption';
import { useDeviceKeys } from './hooks/useDeviceKeys';
import { useChannelReadState } from './hooks/useChannelReadState';
import { useChannelCall } from './hooks/useChannelCall';
import { useChannelOpening } from './hooks/useChannelOpening';
import { useAgeConfirmation } from './hooks/useAgeConfirmation';
import { useComposerAttachments } from './hooks/useComposerAttachments';
import { useComposerRestrictions } from './hooks/useComposerRestrictions';
import { useDirectCall } from './hooks/useDirectCall';
import { useHomeWorkspace } from './hooks/useHomeWorkspace';
import { usePersistentDraft } from './hooks/usePersistentDrafts';
import { useMessageComposerActions } from './hooks/useMessageComposerActions';
import { useMessageHistory } from './hooks/useMessageHistory';
import { useNotifications } from './hooks/useNotifications';
import { useRealtimeSocket } from './hooks/useRealtimeSocket';
import { useRoleAppearanceActions } from './hooks/useRoleAppearanceActions';
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
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { ActiveCallSummary } from './helpers';
import { updateFaviconBadge } from './utils/faviconBadge';
import { channelNeedsAgeConfirmation } from './utils/ageGate';
import type { VoiceAttachmentMetadata } from '@discord-clone/shared';
import type { ActiveDialog, ActivePanel } from './components/chat/types';
import { AuthGate } from './components/app/AuthGate';
import { AuthenticatedWorkspace } from './components/app/AuthenticatedWorkspace';
import { buildChatAndSettingsProps } from './components/app/buildChatAndSettingsProps';
import { buildWorkspaceShellProps } from './components/app/buildWorkspaceShellProps';
import { conversationDisplayName } from './components/home/conversationDisplay';
import { KeyboardShortcuts } from './components/shortcuts/KeyboardShortcuts';

export function AppShell() {
  const t = useTranslation();
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [isSavedMessagesOpen, setIsSavedMessagesOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeCalls, setActiveCalls] = useState<Record<string, ActiveCallSummary>>({});
  const [channelBadges, setChannelBadges] = useState<Record<string, ChannelBadgeState>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  // Broken cycle: useComposerAttachments' voice-message callback needs sendChatMessage, which is
  // itself produced by useMessageComposerActions, a hook that needs composer attachments' state.
  // The ref always holds the latest sendChatMessage (see the effect near its declaration below).
  const sendChatMessageRef = useRef<
    (
      content: string,
      files: File[],
      voice?: VoiceAttachmentMetadata | null,
      stickerId?: string,
    ) => Promise<boolean | undefined>
  >(() => Promise.resolve(undefined));

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
    deleteChannel,
    reorderChannels,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
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

  // One instance for the whole shell: it registers this browser's key and polls for pending wraps.
  const deviceKeys = useDeviceKeys({ auth });

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
    deviceKeys,
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

  const { uiTheme, resolvedTheme, setUiTheme } = useTheme();

  const {
    panel: encryptionPanel,
    isChannelEncrypted,
    clearChannelKeys,
    encryptForChannel,
    decryptMessagesForDisplay,
    decryptMessageForDisplay,
  } = useChannelEncryption({
    auth,
    server,
    servers,
    channel,
    messages,
    setMessages,
    deviceKeys,
    patchServer,
    patchServers,
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

  const settingsActions = useSettingsActions({
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

  const roleAppearance = useRoleAppearanceActions({
    auth,
    serverId: server?.id ?? null,
    setPendingAction,
    setWorkspaceError,
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
    encryptForChannel,
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
    sendVoiceMessage: (file, voice) => sendChatMessageRef.current('', [file], voice),
    setWorkspaceError,
  });

  const loadAccountData = useEffectEvent((token: string) => {
    void loadFriends(token);
    void loadDirectConversations(token);
    void settingsActions.loadNotificationPreferences();
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

  const confirmAge = useAgeConfirmation({ auth, setAuth });
  // The gate replaces the message view, so nothing is fetched or joined until it lifts.
  const isAgeGated = Boolean(channel && auth && channelNeedsAgeConfirmation(channel, auth.user));

  const { firstUnreadMessageId } = useChannelOpening({
    channel,
    isAgeGated,
    auth,
    socket,
    activeChannelIdRef,
    decryptMessagesForDisplay,
    setMessages,
    setIsLoadingMessages,
    setMessageCursor,
    setTypingUsers,
    setChannelBadges,
    setReplyingToMessage,
    closeThread: threadPanel.close,
    setSearchResults,
    setWorkspaceError,
    loadPinnedMessages,
    setActiveCalls,
    t,
  });

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

  const { sendChatMessage, sendMessage, messageActions, botCommands, pendingInteractionLabel } =
    useMessageComposerActions({
      auth,
      channel,
      server,
      socket,
      messages,
      encryptForChannel,
      channelDraft,
      selectedFiles,
      setSelectedFiles,
      replyingToMessage,
      setReplyingToMessage,
      decryptMessageForDisplay,
      setMessages,
      setPendingAction,
      setWorkspaceError,
      setWorkspaceNotice,
      markMessageSent,
      openServer,
      editingMessageId,
      editingDraft,
      setEditingMessageId,
      setEditingDraft,
      openThread: threadPanel.openThread,
      togglePinnedMessage,
      t,
    });

  useEffect(() => {
    sendChatMessageRef.current = sendChatMessage;
  });

  function logout() {
    endDirectCall();
    clearAuth();
  }

  if (!auth || !homeProps) {
    return (
      <AuthGate
        auth={auth}
        uiTheme={uiTheme}
        resolvedTheme={resolvedTheme}
        setUiTheme={setUiTheme}
        authScreen={authScreen}
      >
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
    isChannelEncrypted,
    openSavedMessages: () => setIsSavedMessagesOpen(true),
    openMobileNav: () => setIsMobileNavOpen(true),
    openMemberList: () => setIsMemberListOpen(true),
    clearWorkspaceError: () => setWorkspaceError(null),
    clearWorkspaceNotice: () => setWorkspaceNotice(null),
  };

  const {
    workspace,
    members,
    home,
    savedMessages,
    incomingCall: incomingCallProps,
  } = buildWorkspaceShellProps({
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
    settingsActions,
    serverEvents,
    openHome,
    openServer,
    createServer,
    joinInvite,
    createChannel,
    reorderChannels,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    logout,
    selectChannel,
    setChannelQuery,
    setActiveDialog,
    setSelectedMemberId,
    startDirectConversation,
    sendFriendRequest,
    homeProps,
    callState,
    remoteMedia,
    localVideoRef,
    outgoingCall,
    startDirectCall,
    toggleMute,
    toggleCamera,
    endDirectCall,
    isSavedMessagesOpen,
    setIsSavedMessagesOpen,
    incomingCall,
    conversationLabel,
    acceptIncomingCall,
    declineIncomingCall,
  });

  const { chat, settings } = buildChatAndSettingsProps({
    auth,
    channel,
    server,
    memberIdentities,
    confirmAge,
    selectedMember,
    messages,
    visibleMessages,
    isLoadingMessages,
    isLoadingMoreMessages,
    messageCursor,
    firstUnreadMessageId,
    typingUsers,
    pinnedMessages,
    pinnedMessageIds,
    notifications,
    notificationUnreadCount,
    isLoadingNotifications,
    searchQuery,
    parsedSearch,
    loadMoreMessages,
    workspaceError,
    workspaceNotice,
    setWorkspaceError,
    setWorkspaceNotice,
    activePanel,
    activeDialog,
    setActivePanel,
    setActiveDialog,
    setSearchQuery,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    openMobileNav: () => setIsMobileNavOpen(true),
    encryption: encryptionPanel,
    callState,
    activeCalls,
    remoteMedia,
    localVideoRef,
    startCall,
    toggleMute,
    toggleCamera,
    endDirectCall,
    soundboard,
    messageActions,
    startDirectConversation,
    sendFriendRequest,
    composerRestriction,
    replyingToMessage,
    setReplyingToMessage,
    selectedFiles,
    setSelectedFiles,
    isRecordingVoice,
    pendingAction,
    channelDraftValue: channelDraft.value,
    setChannelDraft: channelDraft.setValue,
    clearChannelDraft: channelDraft.clear,
    fileInputRef,
    sendMessage,
    botCommands,
    pendingInteractionLabel,
    sendChatMessage,
    startVoiceRecording,
    stopVoiceRecording,
    removeSelectedFile,
    selectFiles,
    handleComposerInput,
    threadPanel,
    markChannelRead,
    moderation,
    serverEmojis,
    settingsActions,
    roleAppearance,
    uiTheme,
    setUiTheme,
    logout,
    setSelectedMemberId,
    deleteChannel,
  });

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
        resolvedTheme={resolvedTheme}
        setUiTheme={setUiTheme}
        server={server}
        workspace={workspace}
        chat={chat}
        members={members}
        home={home}
        serverEmojis={serverEmojis.emojis}
        savedMessages={savedMessages}
        incomingCall={incomingCallProps}
        settings={settings}
        mobileNav={{ open: isMobileNavOpen, onOpenChange: setIsMobileNavOpen }}
        memberList={{ open: isMemberListOpen, onOpenChange: setIsMemberListOpen }}
      />
    </WorkspaceProvider>
  );
}
