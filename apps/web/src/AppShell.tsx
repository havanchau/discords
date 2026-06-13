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
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [pinnedMessagesByChannel, setPinnedMessagesByChannel] = useState<Record<string, Message[]>>(
    {},
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const channelDraft = usePersistentDraft({
    storageKey: 'discord-clone-channel-drafts',
    draftKey: channel ? `channel:${channel.id}` : null,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState<{ userId: string; displayName: string }[]>([]);
  const [activeCalls, setActiveCalls] = useState<Record<string, ActiveCallSummary>>({});
  const [channelBadges, setChannelBadges] = useState<Record<string, ChannelBadgeState>>({});
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Record<string, string[]>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const clearWorkspaceState = useCallback(() => {
    setServers([]);
    setServer(null);
    setChannel(null);
    setMessages([]);
    setMessageCursor(null);
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
    if (!auth || !channel) return;
    const query = searchQuery.trim();
    const { parsed, params } = buildMessageSearchParams(query);
    const hasFilters =
      Boolean(parsed.from || parsed.in || parsed.before || parsed.after) || parsed.has.length > 0;
    if (parsed.invalid.length > 0) {
      setSearchResults([]);
      return;
    }
    if (query.length < 2 && !hasFilters) {
      setSearchResults(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      void apiRequest<{ messages: Message[] }>(
        `/channels/${channel.id}/messages?${params.toString()}`,
        {},
        auth.accessToken,
      )
        .then(async (result) => setSearchResults(await decryptMessagesForDisplay(result.messages)))
        .catch((err) =>
          setWorkspaceError(err instanceof Error ? err.message : 'Cannot search messages'),
        );
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchQuery, channel?.id, auth?.accessToken]);
  useEffect(() => {
    const totalUnread = Object.values(channelBadges).reduce(
      (total, badge) => total + badge.count,
      0,
    );
    updateFaviconBadge(totalUnread);
  }, [channelBadges]);
  useEffect(() => {
    if (!auth) return;
    const handler = (event: MessageEvent<{ type?: string; url?: string }>) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        void navigateToNotificationUrl(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [auth?.accessToken, servers]);
  useEffect(() => {
    if (!auth || !servers.length) return;
    if (window.location.pathname.startsWith('/channels/')) {
      void navigateToNotificationUrl(window.location.pathname);
      window.history.replaceState({}, '', '/');
    }
  }, [auth?.accessToken, servers.length]);
  useEffect(() => {
    if (callState && channel?.id !== callState.channelId) endCall();
  }, [channel?.id]);
  const textChannels = useMemo(
    () => server?.channels.filter((item) => item.type === 'TEXT') ?? [],
    [server],
  );
  const visibleTextChannels = useMemo(() => {
    const query = channelQuery.trim().toLowerCase();
    if (!query) return textChannels;
    return textChannels.filter((item) => item.name.toLowerCase().includes(query));
  }, [channelQuery, textChannels]);
  const voiceChannels = useMemo(
    () => server?.channels.filter((item) => item.type === 'VOICE') ?? [],
    [server],
  );
  const visibleVoiceChannels = useMemo(() => {
    const query = channelQuery.trim().toLowerCase();
    if (!query) return voiceChannels;
    return voiceChannels.filter((item) => item.name.toLowerCase().includes(query));
  }, [channelQuery, voiceChannels]);
  const parsedSearch = useMemo(() => parseMessageSearchQuery(searchQuery), [searchQuery]);
  const visibleMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length >= 2 && searchResults) return searchResults;
    if (!query) return messages;
    return messages.filter(
      (message) => !message.decryptionFailed && message.content.toLowerCase().includes(query),
    );
  }, [messages, searchQuery, searchResults]);
  const selectedMember = useMemo(
    () => server?.members.find((member) => member.id === selectedMemberId) ?? null,
    [server?.members, selectedMemberId],
  );
  const activeCall = channel ? (activeCalls[channel.id] ?? null) : null;
  const pinnedMessages = channel ? (pinnedMessagesByChannel[channel.id] ?? []) : [];
  function openMemberRoleEditor(memberId: string) {
    setSelectedMemberId(memberId);
    setActiveDialog('member-roles');
  }
  async function togglePinnedMessage(message: Message) {
    if (!auth) return;
    setPendingAction(`pin-${message.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ pinned: boolean; message: Message }>(
        `/messages/${message.id}/pins`,
        { method: 'POST' },
        auth.accessToken,
      );
      await loadPinnedMessages(message.channelId, auth.accessToken);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update pinned message');
    } finally {
      setPendingAction(null);
    }
  }
  async function loadServers(token: string) {
    setIsLoadingServers(true);
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ servers: ServerSummary[] }>('/servers', {}, token);
      setServers(result.servers);
      if (!server && result.servers[0]) {
        await openServer(result.servers[0].id, token);
      }
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot load servers');
    } finally {
      setIsLoadingServers(false);
    }
  }
  async function navigateToNotificationUrl(url: string) {
    if (!auth) return;
    const channelId = url.match(/\/channels\/([^/?#]+)/)?.[1];
    if (!channelId) return;
    const serverWithChannel = servers.find((item) =>
      item.channels.some((serverChannel) => serverChannel.id === channelId),
    );
    if (serverWithChannel) {
      await openServer(serverWithChannel.id, auth.accessToken, channelId);
      return;
    }
    await loadServers(auth.accessToken);
  }
  function openHome() {
    setServer(null);
    setChannel(null);
    setMessages([]);
    setMessageCursor(null);
    setReplyingToMessage(null);
    setActiveDialog(null);
    setActivePanel(null);
    if (auth) {
      void loadFriends(auth.accessToken);
      void loadDirectConversations(auth.accessToken);
    }
  }
  async function loadPinnedMessages(channelId: string, token = auth?.accessToken) {
    if (!token) return;
    try {
      const result = await apiRequest<{ messages: Message[] }>(
        `/channels/${channelId}/pins`,
        {},
        token,
      );
      const displayMessages = await decryptMessagesForDisplay(result.messages);
      setPinnedMessagesByChannel((current) => ({ ...current, [channelId]: displayMessages }));
      setPinnedMessageIds((current) => ({
        ...current,
        [channelId]: displayMessages.map((message) => message.id),
      }));
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot load pinned messages');
    }
  }
  async function openServer(
    serverId: string,
    token = auth?.accessToken,
    preferredChannelId?: string | null,
  ) {
    if (!token) return;
    setWorkspaceError(null);
    setWorkspaceNotice(null);
    const result = await apiRequest<{ server: ServerDetail }>(`/servers/${serverId}`, {}, token);
    setServer(result.server);
    setActiveConversation(null);
    setDirectMessages([]);
    setInviteCode(null);
    const preferredChannel = preferredChannelId
      ? result.server.channels.find(
          (item) => item.id === preferredChannelId && item.type === 'TEXT',
        )
      : null;
    setChannel(
      preferredChannel ?? result.server.channels.find((item) => item.type === 'TEXT') ?? null,
    );
  }
  async function createServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setPendingAction('create-server');
    setWorkspaceError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await apiRequest<{ server: ServerDetail }>(
        '/servers',
        {
          method: 'POST',
          body: JSON.stringify({
            name: String(form.get('name')),
            description: String(form.get('description') || ''),
          }),
        },
        auth.accessToken,
      );
      formElement.reset();
      setServers((current) => [
        {
          id: result.server.id,
          name: result.server.name,
          description: result.server.description,
          channels: result.server.channels,
        },
        ...current.filter((item) => item.id !== result.server.id),
      ]);
      setServer(result.server);
      hydratePersistentChannelBadges(result.server);
      setChannel(result.server.channels.find((item) => item.type === 'TEXT') ?? null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot create server');
    } finally {
      setPendingAction(null);
    }
  }
  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server) return;
    setPendingAction('create-channel');
    setWorkspaceError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await apiRequest<{ channel: Channel }>(
        `/servers/${server.id}/channels`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: String(form.get('name')),
            type: String(form.get('type')) || 'TEXT',
          }),
        },
        auth.accessToken,
      );
      formElement.reset();
      setServer((current) =>
        current
          ? {
              ...current,
              channels: [...current.channels, result.channel],
            }
          : current,
      );
      setServers((current) =>
        current.map((item) =>
          item.id === server.id ? { ...item, channels: [...item.channels, result.channel] } : item,
        ),
      );
      if (result.channel.type === 'TEXT') {
        setChannel(result.channel);
        setMessages([]);
      }
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot create channel');
    } finally {
      setPendingAction(null);
    }
  }
  async function createInvite() {
    if (!auth || !server) return;
    setPendingAction('create-invite');
    setWorkspaceError(null);
    try {
      if (inviteCode) {
        await navigator.clipboard?.writeText(inviteCode);
        setWorkspaceNotice('Invite code copied.');
        window.setTimeout(() => setWorkspaceNotice(null), 1600);
        return;
      }
      const result = await apiRequest<{ invite: { code: string } }>(
        `/servers/${server.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ channelId: channel?.id }),
        },
        auth.accessToken,
      );
      setInviteCode(result.invite.code);
      await navigator.clipboard?.writeText(result.invite.code);
      setWorkspaceNotice('Invite created and copied.');
      window.setTimeout(() => setWorkspaceNotice(null), 1600);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot create invite');
    } finally {
      setPendingAction(null);
    }
  }
  async function joinInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setPendingAction('join-invite');
    setWorkspaceError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const code = String(form.get('code') || '').trim();
    if (!code) {
      setPendingAction(null);
      return;
    }
    try {
      const result = await apiRequest<{ serverId: string; channelId?: string | null }>(
        `/invites/${code}/join`,
        { method: 'POST' },
        auth.accessToken,
      );
      formElement.reset();
      await loadServers(auth.accessToken);
      await openServer(result.serverId, auth.accessToken, result.channelId);
      setWorkspaceNotice('Invite joined.');
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot join invite');
    } finally {
      setPendingAction(null);
    }
  }
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

  return (
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
          openHome,
          openServer,
          createServer,
          joinInvite,
          createChannel,
          createInvite,
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
          isChannelEncrypted: channel ? Boolean(channelKeys[channel.id]) : false,
          configure: configureChannelEncryption,
          clear: clearChannelEncryption,
        },
        call: {
          state: callState,
          active: activeCall,
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
          toggleReaction,
          togglePinned: togglePinnedMessage,
        },
        composer: {
          replyingToMessage,
          selectedFiles,
          draft: channelDraft.value,
          isRecordingVoice,
          pendingAction,
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
        server,
        onManageMember: openMemberRoleEditor,
        onDirectMessage: async (userId) => {
          openHome();
          await startDirectConversation(userId);
        },
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
          startDirectConversation,
          sendDirectMessage,
          setDirectMessageDraft,
        },
      }}
      settings={{
        dialog: { activeDialog, setActiveDialog },
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
        refs: { profileAvatarInputRef, channelAvatarInputRef },
        theme: { uiTheme },
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
          openMemberRoleEditor,
        },
      }}
    />
  );
}
