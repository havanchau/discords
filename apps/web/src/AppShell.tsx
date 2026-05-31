import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthScreen } from './components/AuthScreen';
import { ChatPanel } from './components/ChatPanel';
import { MemberSidebar } from './components/MemberSidebar';
import { SettingsModal } from './components/SettingsModal';
import { ChannelBadgeState, WorkspaceSidebar } from './components/WorkspaceSidebar';
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
import {
  decryptChannelMessage,
  deriveChannelKey,
  encryptChannelMessage,
  isEncryptedMessage,
} from './e2ee';
import { ActiveCallSummary, AUTH_KEY, SOCKET_URL } from './helpers';

interface TypingUser {
  userId: string;
  displayName: string;
}

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
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [activePanel, setActivePanel] = useState<'notifications' | 'search' | 'encryption' | null>(
    null,
  );
  const [activeDialog, setActiveDialog] = useState<
    'profile' | 'server-settings' | 'channel-settings' | 'roles' | 'member-roles' | null
  >(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [activeCalls, setActiveCalls] = useState<Record<string, ActiveCallSummary>>({});
  const [channelBadges, setChannelBadges] = useState<Record<string, ChannelBadgeState>>({});
  const [channelKeys, setChannelKeys] = useState<Record<string, CryptoKey>>({});
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Record<string, string[]>>(() => {
    const raw = localStorage.getItem('discord-clone-pinned-messages');
    return raw ? JSON.parse(raw) : {};
  });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const channelKeysRef = useRef<Record<string, CryptoKey>>({});
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const cancelVoiceRecordingRef = useRef(false);
  const { callState, remoteMedia, localVideoRef, startCall, endCall, toggleMute, toggleCamera } =
    useChannelCall({
      auth,
      channel,
      socket,
      setWorkspaceError,
    });

  useEffect(() => {
    activeChannelIdRef.current = channel?.id ?? null;
  }, [channel?.id]);

  useEffect(() => {
    channelKeysRef.current = channelKeys;
  }, [channelKeys]);

  useEffect(() => {
    localStorage.setItem('discord-clone-pinned-messages', JSON.stringify(pinnedMessageIds));
  }, [pinnedMessageIds]);

  useEffect(
    () => () => {
      cancelVoiceRecordingRef.current = true;
      if (voiceRecorderRef.current?.state !== 'inactive') {
        voiceRecorderRef.current?.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

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
        setMessageCursor(null);
        setActiveCalls({});
        setChannelBadges({});
        setChannelKeys({});
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

    nextSocket.on('message:created', async (message: Message) => {
      const displayMessage = await decryptMessageForDisplay(message);
      if (message.channelId === activeChannelIdRef.current) {
        setMessages((current) =>
          current.some((item) => item.id === displayMessage.id)
            ? current
            : [...current, displayMessage],
        );
        return;
      }

      setChannelBadges((current) => {
        const currentBadge = current[message.channelId] ?? { count: 0, mentions: 0 };
        const mentionsMe = messageMentionsUser(message, auth.user);
        return {
          ...current,
          [message.channelId]: {
            count: currentBadge.count + 1,
            mentions: currentBadge.mentions + (mentionsMe ? 1 : 0),
          },
        };
      });
    });

    nextSocket.on('reaction:updated', async (payload: { message: Message }) => {
      const displayMessage = await decryptMessageForDisplay(payload.message);
      setMessages((current) =>
        current.map((message) => (message.id === displayMessage.id ? displayMessage : message)),
      );
    });

    nextSocket.on(
      'typing:start',
      (payload: { channelId: string; userId: string; displayName?: string }) => {
        if (payload.userId === auth.user.id) return;
        setTypingUsers((current) =>
          current.some((user) => user.userId === payload.userId)
            ? current
            : [
                ...current,
                {
                  userId: payload.userId,
                  displayName: payload.displayName ?? 'Someone',
                },
              ],
        );
      },
    );

    nextSocket.on('typing:stop', (payload: { channelId: string; userId: string }) => {
      setTypingUsers((current) => current.filter((user) => user.userId !== payload.userId));
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
    setMessageCursor(null);
    setTypingUsers([]);
    setChannelBadges((current) => {
      const next = { ...current };
      delete next[channel.id];
      return next;
    });
    setReplyingToMessage(null);
    setWorkspaceError(null);
    void apiRequest<{ messages: Message[]; nextCursor?: string | null }>(
      `/channels/${channel.id}/messages`,
      {},
      auth.accessToken,
    )
      .then(async (result) => {
        setMessages(await decryptMessagesForDisplay(result.messages));
        setMessageCursor(result.nextCursor ?? null);
      })
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
    return messages.filter(
      (message) => !message.decryptionFailed && message.content.toLowerCase().includes(query),
    );
  }, [messages, searchQuery]);

  const selectedMember = useMemo(
    () => server?.members.find((member) => member.id === selectedMemberId) ?? null,
    [server?.members, selectedMemberId],
  );

  const activeCall = channel ? (activeCalls[channel.id] ?? null) : null;
  const pinnedMessages = channel
    ? (pinnedMessageIds[channel.id] ?? [])
        .map((messageId) => messages.find((message) => message.id === messageId))
        .filter((message): message is Message => Boolean(message && !message.deletedAt))
    : [];

  function togglePinnedMessage(message: Message) {
    setPinnedMessageIds((current) => {
      const channelPins = current[message.channelId] ?? [];
      const nextPins = channelPins.includes(message.id)
        ? channelPins.filter((messageId) => messageId !== message.id)
        : [message.id, ...channelPins].slice(0, 20);
      return { ...current, [message.channelId]: nextPins };
    });
  }

  async function configureChannelEncryption(passphrase: string) {
    if (!channel) return;
    const trimmedPassphrase = passphrase.trim();
    if (trimmedPassphrase.length < 8) {
      setWorkspaceError('Use at least 8 characters for the encryption passphrase.');
      return;
    }

    const key = await deriveChannelKey(channel.id, trimmedPassphrase);
    const nextKeys = { ...channelKeysRef.current, [channel.id]: key };
    channelKeysRef.current = nextKeys;
    setChannelKeys(nextKeys);
    setMessages(await Promise.all(messages.map((message) => decryptMessageForDisplay(message))));
    setWorkspaceNotice('End-to-end encryption enabled for this channel on this device.');
  }

  function clearChannelEncryption() {
    if (!channel) return;
    const nextKeys = { ...channelKeysRef.current };
    delete nextKeys[channel.id];
    channelKeysRef.current = nextKeys;
    setChannelKeys(nextKeys);
    setMessages((current) =>
      current.map((message) =>
        message.isEncrypted
          ? {
              ...message,
              content: 'Encrypted message',
              decryptionFailed: true,
            }
          : message,
      ),
    );
  }

  async function decryptMessagesForDisplay(nextMessages: Message[]) {
    return Promise.all(nextMessages.map((message) => decryptMessageForDisplay(message)));
  }

  async function decryptMessageForDisplay(message: Message): Promise<Message> {
    const encryptedContent = message.encryptedContent ?? message.content;
    const replyToMessage = message.replyToMessage
      ? await decryptMessageForDisplay(message.replyToMessage)
      : message.replyToMessage;

    if (!isEncryptedMessage(encryptedContent)) {
      return { ...message, replyToMessage };
    }

    const key = channelKeysRef.current[message.channelId];
    if (!key) {
      return {
        ...message,
        content: 'Encrypted message',
        encryptedContent,
        isEncrypted: true,
        decryptionFailed: true,
        replyToMessage,
      };
    }

    try {
      return {
        ...message,
        content: await decryptChannelMessage(key, encryptedContent),
        encryptedContent,
        isEncrypted: true,
        decryptionFailed: false,
        replyToMessage,
      };
    } catch {
      return {
        ...message,
        content: 'Encrypted message',
        encryptedContent,
        isEncrypted: true,
        decryptionFailed: true,
        replyToMessage,
      };
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
    if (!auth || !channel) return;
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
        await new Promise<void>((resolve) => {
          socket
            .timeout(5000)
            .emit(
              'message:create',
              payload,
              async (err: Error | null, result?: { message: Message }) => {
                if (err || !result?.message) {
                  setWorkspaceError('Message was not acknowledged. Try again.');
                  resolve();
                  return;
                }
                const displayMessage = await decryptMessageForDisplay(result.message);
                setMessages((current) =>
                  current.some((item) => item.id === displayMessage.id)
                    ? current
                    : [...current, displayMessage],
                );
                resolve();
              },
            );
        });
        return;
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
      setReplyingToMessage(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot send message');
    } finally {
      setPendingAction(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const content = String(form.get('content') || '').trim();
    const files = selectedFiles;
    if (!content && files.length === 0) return;

    await sendChatMessage(content, files);
    formElement.reset();
    setSelectedFiles([]);
    setReplyingToMessage(null);
  }

  async function startVoiceRecording() {
    if (!auth || !channel) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setWorkspaceError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      setWorkspaceError(null);
      cancelVoiceRecordingRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const recorder = new MediaRecorder(
        stream,
        supportedMimeType ? { mimeType: supportedMimeType } : undefined,
      );

      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = voiceChunksRef.current;
        const recordedType = recorder.mimeType || supportedMimeType || 'audio/webm';
        const uploadType = recordedType.split(';')[0] || 'audio/webm';
        const blob = new Blob(chunks, { type: uploadType });
        const shouldSend = !cancelVoiceRecordingRef.current && blob.size > 0;
        voiceChunksRef.current = [];
        voiceRecorderRef.current = null;
        setIsRecordingVoice(false);
        stream.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;

        if (!shouldSend) return;

        const extension = uploadType.includes('mp4')
          ? 'm4a'
          : uploadType.includes('ogg')
            ? 'ogg'
            : 'webm';
        const file = new File([blob], `voice-message-${Date.now()}.${extension}`, {
          type: uploadType,
        });
        void sendChatMessage('', [file]);
      };

      recorder.onerror = () => {
        setWorkspaceError('Voice recording failed. Check microphone permission and try again.');
        cancelVoiceRecordingRef.current = true;
        setIsRecordingVoice(false);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecordingVoice(true);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot start voice recording');
    }
  }

  function stopVoiceRecording() {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
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
            status: String(form.get('status') || auth.user.status || 'ONLINE'),
          }),
        },
        auth.accessToken,
      );
      setAuth({ ...auth, user: { ...auth.user, ...result.user } });
      setServer((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.user.id === auth.user.id
                  ? { ...member, user: { ...member.user, ...result.user } }
                  : member,
              ),
            }
          : current,
      );
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
      const positionValue = String(form.get('position') || '').trim();
      const result = await apiRequest<{ channel: Channel }>(
        `/channels/${channel.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: String(form.get('name') || '').trim(),
            topic: String(form.get('topic') || '').trim(),
            isPrivate: form.get('isPrivate') === 'on',
            position: positionValue ? Number(positionValue) : undefined,
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

  async function loadMoreMessages() {
    if (!auth || !channel || !messageCursor || isLoadingMoreMessages) return;
    setIsLoadingMoreMessages(true);
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ messages: Message[]; nextCursor?: string | null }>(
        `/channels/${channel.id}/messages?cursor=${encodeURIComponent(messageCursor)}`,
        {},
        auth.accessToken,
      );
      const displayMessages = await decryptMessagesForDisplay(result.messages);
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        const olderMessages = displayMessages.filter((message) => !existingIds.has(message.id));
        return [...olderMessages, ...current];
      });
      setMessageCursor(result.nextCursor ?? null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot load older messages');
    } finally {
      setIsLoadingMoreMessages(false);
    }
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
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    setServers([]);
    setServer(null);
    setChannel(null);
    setMessages([]);
    setMessageCursor(null);
    setActiveCalls({});
    setChannelBadges({});
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
        activeCalls={activeCalls}
        channelBadges={channelBadges}
        profileAvatarInputRef={profileAvatarInputRef}
        openServer={openServer}
        createServer={createServer}
        joinInvite={joinInvite}
        createChannel={createChannel}
        createInvite={createInvite}
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
        isLoadingMoreMessages={isLoadingMoreMessages}
        hasMoreMessages={Boolean(messageCursor)}
        workspaceError={workspaceError}
        workspaceNotice={workspaceNotice}
        callState={callState}
        activeCall={activeCall}
        remoteMedia={remoteMedia}
        activePanel={activePanel}
        activeDialog={activeDialog}
        searchQuery={searchQuery}
        isChannelEncrypted={channel ? Boolean(channelKeys[channel.id]) : false}
        typingUsers={typingUsers}
        pinnedMessages={pinnedMessages}
        pinnedMessageIds={channel ? (pinnedMessageIds[channel.id] ?? []) : []}
        replyingToMessage={replyingToMessage}
        selectedFiles={selectedFiles}
        isRecordingVoice={isRecordingVoice}
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
        configureChannelEncryption={configureChannelEncryption}
        clearChannelEncryption={clearChannelEncryption}
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
        togglePinnedMessage={togglePinnedMessage}
        loadMoreMessages={loadMoreMessages}
        sendMessage={sendMessage}
        startVoiceRecording={startVoiceRecording}
        stopVoiceRecording={stopVoiceRecording}
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

function messageMentionsUser(message: Message, user: AuthState['user']) {
  const content = message.content.toLowerCase();
  const handles = [`@${user.username.toLowerCase()}`, `@${user.displayName.toLowerCase()}`];
  return handles.some((handle) => content.includes(handle));
}
