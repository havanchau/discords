import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthScreen } from './components/AuthScreen';
import { ChatPanel } from './components/ChatPanel';
import { MemberSidebar } from './components/MemberSidebar';
import { SettingsModal } from './components/SettingsModal';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { useChannelCall } from './hooks/useChannelCall';
import {
  apiRequest,
  assetUrl,
  AuthState,
  Channel,
  configureAuthRefresh,
  Message,
  Role,
  ServerDetail,
  ServerSummary,
  uploadFile,
} from './api';
import { ActiveCallSummary, AUTH_KEY, SOCKET_URL } from './helpers';

export function AppShell() {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationHint, setVerificationHint] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [activePanel, setActivePanel] = useState<'notifications' | 'search' | null>(null);
  const [activeDialog, setActiveDialog] = useState<
    'profile' | 'server-settings' | 'channel-settings' | 'roles' | 'member-roles' | null
  >(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [activeCalls, setActiveCalls] = useState<Record<string, ActiveCallSummary>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const { callState, remoteMedia, localVideoRef, startCall, endCall, toggleMute, toggleCamera } =
    useChannelCall({
      auth,
      channel,
      socket,
      setWorkspaceError,
    });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (window.location.pathname === '/verify-email' && token) {
      setVerificationToken(token);
      setVerificationHint('Email token loaded. Confirm verification to continue.');
      setMode('login');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    configureAuthRefresh({
      getAuth: () => {
        const raw = localStorage.getItem(AUTH_KEY);
        return raw ? (JSON.parse(raw) as AuthState) : null;
      },
      setAuth: (nextAuth) => {
        localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
        setAuth(nextAuth);
      },
      clearAuth: () => {
        localStorage.removeItem(AUTH_KEY);
        setAuth(null);
        setServers([]);
        setServer(null);
        setChannel(null);
        setMessages([]);
        setActiveCalls({});
      },
    });
  }, []);

  useEffect(() => {
    if (!auth) return;
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    void loadServers(auth.accessToken);
  }, [auth]);

  useEffect(() => {
    if (!auth) {
      socket?.disconnect();
      setSocket(null);
      return;
    }

    const nextSocket = io(SOCKET_URL, {
      auth: { token: auth.accessToken },
    });

    nextSocket.on('message:created', (message: Message) => {
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message],
      );
    });

    nextSocket.on('reaction:updated', (payload: { message: Message }) => {
      setMessages((current) =>
        current.map((message) => (message.id === payload.message.id ? payload.message : message)),
      );
    });

    nextSocket.on('typing:start', (payload: { channelId: string; userId: string }) => {
      if (payload.userId === auth.user.id) return;
      setTypingUsers((current) =>
        current.includes(payload.userId) ? current : [...current, payload.userId],
      );
    });

    nextSocket.on('typing:stop', (payload: { channelId: string; userId: string }) => {
      setTypingUsers((current) => current.filter((userId) => userId !== payload.userId));
    });

    nextSocket.on('presence:update', (payload: { userId: string; status: string }) => {
      setServer((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.user.id === payload.userId
                  ? { ...member, user: { ...member.user, status: payload.status } }
                  : member,
              ),
            }
          : current,
      );
    });

    nextSocket.on('voice:active', (activeCall: ActiveCallSummary) => {
      setActiveCalls((current) => ({ ...current, [activeCall.channelId]: activeCall }));
    });

    nextSocket.on('voice:ended', (payload: { channelId: string }) => {
      setActiveCalls((current) => {
        const next = { ...current };
        delete next[payload.channelId];
        return next;
      });
    });

    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [auth?.accessToken]);

  useEffect(() => {
    if (!channel || !auth) return;
    setIsLoadingMessages(true);
    setTypingUsers([]);
    setReplyingToMessage(null);
    setWorkspaceError(null);
    void apiRequest<{ messages: Message[] }>(
      `/channels/${channel.id}/messages`,
      {},
      auth.accessToken,
    )
      .then((result) => setMessages(result.messages))
      .catch((err) =>
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot load messages'),
      )
      .finally(() => setIsLoadingMessages(false));
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
    if (callState && channel?.id !== callState.channelId) {
      endCall();
    }
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

  const visibleMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return messages;
    return messages.filter((message) => message.content.toLowerCase().includes(query));
  }, [messages, searchQuery]);

  const selectedMember = useMemo(
    () => server?.members.find((member) => member.id === selectedMemberId) ?? null,
    [server?.members, selectedMemberId],
  );

  const activeCall = channel ? (activeCalls[channel.id] ?? null) : null;

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

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get('email')),
      username: String(form.get('username') || ''),
      displayName: String(form.get('displayName') || ''),
      password: String(form.get('password')),
    };

    try {
      const result = await apiRequest<AuthState>(
        mode === 'login' ? '/auth/login' : '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(
            mode === 'login' ? { email: payload.email, password: payload.password } : payload,
          ),
        },
      );
      if ('verificationRequired' in result) {
        const verification = result as AuthState & { verificationToken?: string; message?: string };
        setVerificationHint(verification.message || 'Check your email to verify this account.');
        if (verification.verificationToken) {
          setVerificationToken(verification.verificationToken);
        }
        setMode('login');
        return;
      }
      setAuth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await apiRequest<AuthState>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verificationToken.trim() }),
      });
      setVerificationToken('');
      setVerificationHint(null);
      setAuth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
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
      const result = await apiRequest<{ invite: { code: string } }>(
        `/servers/${server.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ channelId: channel?.id }),
        },
        auth.accessToken,
      );
      setInviteCode(result.invite.code);
      setWorkspaceNotice('Invite created. Click the code to copy it.');
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !channel) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const content = String(form.get('content') || '').trim();
    const files = selectedFiles;
    if (!content && files.length === 0) return;

    setPendingAction('send-message');
    setWorkspaceError(null);

    try {
      const attachments = await Promise.all(
        files.map((file) => uploadFile(file, auth.accessToken)),
      );
      formElement.reset();
      setSelectedFiles([]);
      setReplyingToMessage(null);

      const payload = {
        channelId: channel.id,
        content,
        attachments,
        replyToMessageId: replyingToMessage?.id,
      };
      socket?.emit('typing:stop', { channelId: channel.id });

      if (socket?.connected) {
        socket
          .timeout(5000)
          .emit('message:create', payload, (err: Error | null, result?: { message: Message }) => {
            if (err || !result?.message) {
              setWorkspaceError('Message was not acknowledged. Try again.');
              return;
            }
            setMessages((current) =>
              current.some((item) => item.id === result.message.id)
                ? current
                : [...current, result.message],
            );
          });
        return;
      }

      const result = await apiRequest<{ message: Message }>(
        `/channels/${channel.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content, attachments, replyToMessageId: replyingToMessage?.id }),
        },
        auth.accessToken,
      );
      setMessages((current) => [...current, result.message]);
      setReplyingToMessage(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot send message');
    } finally {
      setPendingAction(null);
    }
  }

  function handleComposerInput() {
    if (!channel || !socket?.connected) return;
    socket.emit('typing:start', { channelId: channel.id });
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit('typing:stop', { channelId: channel.id });
    }, 1400);
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setSelectedFiles((current) => [...current, ...files].slice(0, 6));
    event.target.value = '';
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function updateProfileAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!auth) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingAction('profile-avatar');
    try {
      const attachment = await uploadFile(file, auth.accessToken);
      const result = await apiRequest<{ user: AuthState['user'] }>(
        '/users/me',
        {
          method: 'PATCH',
          body: JSON.stringify({ avatarUrl: attachment.url }),
        },
        auth.accessToken,
      );
      setAuth({ ...auth, user: { ...auth.user, ...result.user } });
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update avatar');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateChannelAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!auth || !channel || !server) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingAction('channel-avatar');
    try {
      const attachment = await uploadFile(file, auth.accessToken);
      const result = await apiRequest<{ channel: Channel }>(
        `/channels/${channel.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ avatarUrl: attachment.url }),
        },
        auth.accessToken,
      );
      setChannel(result.channel);
      setServer({
        ...server,
        channels: server.channels.map((item) =>
          item.id === result.channel.id ? result.channel : item,
        ),
      });
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update channel avatar');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    const form = new FormData(event.currentTarget);
    setPendingAction('profile-update');
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ user: AuthState['user'] }>(
        '/users/me',
        {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: String(form.get('displayName') || '').trim(),
            bio: String(form.get('bio') || '').trim(),
          }),
        },
        auth.accessToken,
      );
      setAuth({ ...auth, user: { ...auth.user, ...result.user } });
      setActiveDialog(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update profile');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateServerSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server) return;
    const form = new FormData(event.currentTarget);
    setPendingAction('server-update');
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ server: ServerDetail }>(
        `/servers/${server.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: String(form.get('name') || '').trim(),
            description: String(form.get('description') || '').trim(),
          }),
        },
        auth.accessToken,
      );
      setServer(result.server);
      setServers((current) =>
        current.map((item) =>
          item.id === result.server.id
            ? {
                ...item,
                name: result.server.name,
                description: result.server.description,
                channels: result.server.channels,
              }
            : item,
        ),
      );
      setActiveDialog(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update server');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateChannelSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server || !channel) return;
    const form = new FormData(event.currentTarget);
    setPendingAction('channel-update');
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ channel: Channel }>(
        `/channels/${channel.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: String(form.get('name') || '').trim(),
            topic: String(form.get('topic') || '').trim(),
          }),
        },
        auth.accessToken,
      );
      setChannel(result.channel);
      setServer({
        ...server,
        channels: server.channels.map((item) =>
          item.id === result.channel.id ? result.channel : item,
        ),
      });
      setActiveDialog(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update channel');
    } finally {
      setPendingAction(null);
    }
  }

  async function reloadCurrentServer(preferredChannelId = channel?.id) {
    if (!auth || !server) return;
    await openServer(server.id, auth.accessToken, preferredChannelId);
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPendingAction('role-create');
    setWorkspaceError(null);
    try {
      await apiRequest<{ role: Role }>(
        `/servers/${server.id}/roles`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: String(form.get('name') || '').trim(),
            color: String(form.get('color') || '').trim() || undefined,
            permissions: form.getAll('permissions').map(String),
          }),
        },
        auth.accessToken,
      );
      formElement.reset();
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot create role');
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleRolePermission(role: Role, permission: string, enabled: boolean) {
    if (!auth) return;
    const permissions = enabled
      ? [...new Set([...role.permissions, permission])]
      : role.permissions.filter((item) => item !== permission);
    setPendingAction(`role-${role.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ role: Role }>(
        `/roles/${role.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ permissions }),
        },
        auth.accessToken,
      );
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update role');
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteRole(role: Role) {
    if (!auth) return;
    setPendingAction(`role-${role.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ ok: true }>(
        `/roles/${role.id}`,
        {
          method: 'DELETE',
        },
        auth.accessToken,
      );
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot delete role');
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleMemberRole(memberId: string, roleId: string, enabled: boolean) {
    if (!auth || !server) return;
    setPendingAction(`member-role-${memberId}-${roleId}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ ok: true }>(
        `/servers/${server.id}/members/${memberId}/roles/${roleId}`,
        {
          method: enabled ? 'POST' : 'DELETE',
        },
        auth.accessToken,
      );
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update member roles');
    } finally {
      setPendingAction(null);
    }
  }

  async function copyInviteCode() {
    if (!inviteCode) return;
    await navigator.clipboard?.writeText(inviteCode);
    setWorkspaceNotice('Invite code copied.');
    window.setTimeout(() => setWorkspaceNotice(null), 1600);
  }

  async function saveMessageEdit(messageId: string) {
    if (!auth || !editingDraft.trim()) return;
    const result = await apiRequest<{ message: Message }>(
      `/messages/${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content: editingDraft.trim() }),
      },
      auth.accessToken,
    );
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? result.message : message)),
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
    setMessages((current) =>
      current.map((currentMessage) =>
        currentMessage.id === message.id ? result.message : currentMessage,
      ),
    );
  }

  function logout() {
    endCall();
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    setServers([]);
    setServer(null);
    setChannel(null);
    setMessages([]);
    setActiveCalls({});
  }

  if (!auth) {
    return (
      <AuthScreen
        error={error}
        mode={mode}
        setMode={setMode}
        submitAuth={submitAuth}
        submitVerification={submitVerification}
        verificationHint={verificationHint}
        verificationToken={verificationToken}
        setVerificationToken={setVerificationToken}
      />
    );
  }

  return (
    <main className="app-shell">
      <WorkspaceSidebar
        auth={auth}
        servers={servers}
        server={server}
        channel={channel}
        visibleTextChannels={visibleTextChannels}
        visibleVoiceChannels={visibleVoiceChannels}
        channelQuery={channelQuery}
        inviteCode={inviteCode}
        isLoadingServers={isLoadingServers}
        pendingAction={pendingAction}
        profileAvatarInputRef={profileAvatarInputRef}
        openServer={openServer}
        createServer={createServer}
        joinInvite={joinInvite}
        createChannel={createChannel}
        createInvite={createInvite}
        copyInviteCode={copyInviteCode}
        updateProfileAvatar={updateProfileAvatar}
        logout={logout}
        setChannel={setChannel}
        setChannelQuery={setChannelQuery}
        setActiveDialog={setActiveDialog}
      />

      <ChatPanel
        auth={auth}
        channel={channel}
        messages={messages}
        visibleMessages={visibleMessages}
        isLoadingMessages={isLoadingMessages}
        workspaceError={workspaceError}
        workspaceNotice={workspaceNotice}
        callState={callState}
        activeCall={activeCall}
        remoteMedia={remoteMedia}
        activePanel={activePanel}
        activeDialog={activeDialog}
        searchQuery={searchQuery}
        typingUsers={typingUsers}
        replyingToMessage={replyingToMessage}
        selectedFiles={selectedFiles}
        pendingAction={pendingAction}
        editingMessageId={editingMessageId}
        editingDraft={editingDraft}
        channelAvatarInputRef={channelAvatarInputRef}
        localVideoRef={localVideoRef}
        fileInputRef={fileInputRef}
        setActiveDialog={setActiveDialog}
        setActivePanel={setActivePanel}
        setSearchQuery={setSearchQuery}
        setWorkspaceError={setWorkspaceError}
        setWorkspaceNotice={setWorkspaceNotice}
        setReplyingToMessage={setReplyingToMessage}
        setEditingMessageId={setEditingMessageId}
        setEditingDraft={setEditingDraft}
        updateChannelAvatar={updateChannelAvatar}
        startCall={startCall}
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        endCall={endCall}
        saveMessageEdit={saveMessageEdit}
        deleteMessage={deleteMessage}
        toggleReaction={toggleReaction}
        sendMessage={sendMessage}
        removeSelectedFile={removeSelectedFile}
        selectFiles={selectFiles}
        handleComposerInput={handleComposerInput}
      />

      <MemberSidebar
        assetUrl={assetUrl}
        server={server}
        onManageMember={(memberId) => {
          setSelectedMemberId(memberId);
          setActiveDialog('member-roles');
        }}
      />

      <SettingsModal
        activeDialog={activeDialog}
        auth={auth}
        server={server}
        channel={channel}
        selectedMember={selectedMember}
        pendingAction={pendingAction}
        profileAvatarInputRef={profileAvatarInputRef}
        channelAvatarInputRef={channelAvatarInputRef}
        setActiveDialog={setActiveDialog}
        updateProfile={updateProfile}
        updateServerSettings={updateServerSettings}
        updateChannelSettings={updateChannelSettings}
        createRole={createRole}
        toggleRolePermission={toggleRolePermission}
        deleteRole={deleteRole}
        toggleMemberRole={toggleMemberRole}
      />
    </main>
  );
}
