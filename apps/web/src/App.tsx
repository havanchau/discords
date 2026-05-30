import {
  Bell,
  Copy,
  Edit3,
  FileArchive,
  FileText,
  Hash,
  Image,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Paperclip,
  Phone,
  PhoneOff,
  Plus,
  Reply,
  Search,
  Send,
  Server as ServerIcon,
  Shield,
  SmilePlus,
  Trash2,
  UserPlus,
  Video,
  VideoOff,
  Users,
  Volume2,
  X
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  apiRequest,
  assetUrl,
  AuthState,
  Channel,
  configureAuthRefresh,
  Message,
  MessageAttachment,
  ServerDetail,
  ServerSummary,
  uploadFile
} from './api';

const AUTH_KEY = 'discord-clone-auth';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
const QUICK_REACTIONS = ['👍', '🔥', '😂', '❤️'];

function initials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function accentClass(indexOrValue: number | string) {
  const value =
    typeof indexOrValue === 'number'
      ? indexOrValue
      : [...indexOrValue].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `accent-${Math.abs(value) % 6}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  if (isToday) return `Today at ${formatTime(value)}`;
  if (isYesterday) return `Yesterday at ${formatTime(value)}`;
  return new Intl.DateTimeFormat('en', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  }).format(date) + ' ' + formatTime(value);
}

function extractLinks(value: string) {
  return value.match(/https?:\/\/[^\s]+/gi) ?? [];
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentKind(attachment: MessageAttachment) {
  if (attachment.mimeType.startsWith('image/')) return 'image';
  if (attachment.mimeType.startsWith('video/')) return 'video';
  if (attachment.mimeType.includes('zip')) return 'archive';
  return 'file';
}

function previewText(message: Message) {
  if (message.deletedAt) return 'Message deleted';
  if (message.content) return message.content.slice(0, 120);
  if (message.attachments?.length) return `Attachment: ${message.attachments[0].fileName}`;
  return 'Message';
}

type CallMode = 'voice' | 'video' | 'screen';

interface CallParticipant {
  socketId: string;
  userId: string;
  username: string;
  displayName: string;
  mode: CallMode;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
}

interface RemoteMedia extends CallParticipant {
  stream?: MediaStream;
}

interface CallState {
  channelId: string;
  mode: CallMode;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
}

function RemoteVideoTile({ participant }: { participant: RemoteMedia }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = participant.stream ?? null;
    }
  }, [participant.stream]);

  return (
    <div className="call-tile">
      {participant.stream ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : (
        <div className={`avatar call-avatar ${accentClass(participant.userId)}`}>
          {initials(participant.displayName)}
        </div>
      )}
      <div className="call-label">
        <strong>{participant.displayName}</strong>
        <span>
          {participant.isSharingScreen ? 'Sharing screen' : participant.isMuted ? 'Muted' : 'In call'}
        </span>
      </div>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [activePanel, setActivePanel] = useState<'notifications' | 'search' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMedia[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const callStateRef = useRef<CallState | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

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
      }
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
      auth: { token: auth.accessToken }
    });

    nextSocket.on('message:created', (message: Message) => {
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message]
      );
    });

    nextSocket.on('reaction:updated', (payload: { message: Message }) => {
      setMessages((current) =>
        current.map((message) => (message.id === payload.message.id ? payload.message : message))
      );
    });

    nextSocket.on('typing:start', (payload: { channelId: string; userId: string }) => {
      if (payload.userId === auth.user.id) return;
      setTypingUsers((current) =>
        current.includes(payload.userId) ? current : [...current, payload.userId]
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
                  : member
              )
            }
          : current
      );
    });

    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [auth?.accessToken]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState]);

  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = (payload: { channelId: string; participant: CallParticipant }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      setRemoteMedia((current) => upsertRemote(current, payload.participant));
    };

    const handleUserUpdated = (payload: { channelId: string; participant: CallParticipant }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      setRemoteMedia((current) => upsertRemote(current, payload.participant));
    };

    const handleUserLeft = (payload: { channelId: string; socketId: string }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      closePeer(payload.socketId);
      setRemoteMedia((current) => current.filter((item) => item.socketId !== payload.socketId));
    };

    const handleOffer = async (payload: {
      channelId: string;
      fromSocketId: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      if (payload.channelId !== callStateRef.current?.channelId || !localStreamRef.current) return;
      const peer = createPeer(payload.fromSocketId, payload.channelId);
      await peer.setRemoteDescription(new RTCSessionDescription(payload.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('webrtc:answer', {
        channelId: payload.channelId,
        targetSocketId: payload.fromSocketId,
        answer
      });
    };

    const handleAnswer = async (payload: {
      channelId: string;
      fromSocketId: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      const peer = peersRef.current.get(payload.fromSocketId);
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(payload.answer));
    };

    const handleIceCandidate = async (payload: {
      channelId: string;
      fromSocketId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      const peer = peersRef.current.get(payload.fromSocketId);
      if (!peer) return;
      await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
    };

    socket.on('voice:user-joined', handleUserJoined);
    socket.on('voice:user-updated', handleUserUpdated);
    socket.on('voice:user-left', handleUserLeft);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('voice:user-joined', handleUserJoined);
      socket.off('voice:user-updated', handleUserUpdated);
      socket.off('voice:user-left', handleUserLeft);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
    };
  }, [socket]);

  useEffect(() => {
    if (!channel || !auth) return;
    setIsLoadingMessages(true);
    setTypingUsers([]);
    setReplyingToMessage(null);
    setWorkspaceError(null);
    void apiRequest<{ messages: Message[] }>(
      `/channels/${channel.id}/messages`,
      {},
      auth.accessToken
    )
      .then((result) => setMessages(result.messages))
      .catch((err) => setWorkspaceError(err instanceof Error ? err.message : 'Cannot load messages'))
      .finally(() => setIsLoadingMessages(false));
    socket?.emit('channel:join', { channelId: channel.id });
  }, [channel?.id, auth?.accessToken, socket]);

  useEffect(() => {
    if (callState && channel?.id !== callState.channelId) {
      endCall();
    }
  }, [channel?.id]);

  const textChannels = useMemo(
    () => server?.channels.filter((item) => item.type === 'TEXT') ?? [],
    [server]
  );

  const voiceChannels = useMemo(
    () => server?.channels.filter((item) => item.type === 'VOICE') ?? [],
    [server]
  );

  const visibleMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return messages;
    return messages.filter((message) => message.content.toLowerCase().includes(query));
  }, [messages, searchQuery]);

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

  async function openServer(serverId: string, token = auth?.accessToken) {
    if (!token) return;
    setWorkspaceError(null);
    const result = await apiRequest<{ server: ServerDetail }>(`/servers/${serverId}`, {}, token);
    setServer(result.server);
    setInviteCode(null);
    setChannel(result.server.channels.find((item) => item.type === 'TEXT') ?? null);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get('email')),
      username: String(form.get('username') || ''),
      displayName: String(form.get('displayName') || ''),
      password: String(form.get('password'))
    };

    try {
      const result = await apiRequest<AuthState>(
        mode === 'login' ? '/auth/login' : '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(
            mode === 'login' ? { email: payload.email, password: payload.password } : payload
          )
        }
      );
      setAuth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
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
            description: String(form.get('description') || '')
          })
        },
        auth.accessToken
      );
      formElement.reset();
      setServers((current) => [
        {
          id: result.server.id,
          name: result.server.name,
          description: result.server.description,
          channels: result.server.channels
        },
        ...current.filter((item) => item.id !== result.server.id)
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
            type: String(form.get('type')) || 'TEXT'
          })
        },
        auth.accessToken
      );
      formElement.reset();
      setServer((current) =>
        current
          ? {
              ...current,
              channels: [...current.channels, result.channel]
            }
          : current
      );
      setServers((current) =>
        current.map((item) =>
          item.id === server.id ? { ...item, channels: [...item.channels, result.channel] } : item
        )
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
          body: JSON.stringify({ channelId: channel?.id })
        },
        auth.accessToken
      );
      setInviteCode(result.invite.code);
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
    if (!code) return;
    try {
      const result = await apiRequest<{ serverId: string }>(
        `/invites/${code}/join`,
        { method: 'POST' },
        auth.accessToken
      );
      formElement.reset();
      await loadServers(auth.accessToken);
      await openServer(result.serverId);
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
      const attachments = await Promise.all(files.map((file) => uploadFile(file, auth.accessToken)));
      formElement.reset();
      setSelectedFiles([]);
      setReplyingToMessage(null);

      const payload = {
        channelId: channel.id,
        content,
        attachments,
        replyToMessageId: replyingToMessage?.id
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
                : [...current, result.message]
            );
          });
        return;
      }

      const result = await apiRequest<{ message: Message }>(
        `/channels/${channel.id}/messages`,
        { method: 'POST', body: JSON.stringify({ content, attachments, replyToMessageId: replyingToMessage?.id }) },
        auth.accessToken
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

  function renderMessageContent(message: Message) {
    const links = extractLinks(message.content);
    const parts = message.content.split(/(https?:\/\/[^\s]+)/gi);

    return (
      <>
        {message.replyToMessage ? (
          <button
            type="button"
            className="reply-preview"
            onClick={() =>
              document.querySelector(`[data-message-id="${message.replyToMessage?.id}"]`)?.scrollIntoView()
            }
          >
            <Reply size={13} />
            <strong>{message.replyToMessage.author.displayName}</strong>
            <span>{previewText(message.replyToMessage)}</span>
          </button>
        ) : null}
        {message.content ? (
          <p>
            {parts.map((part, index) => {
              if (/^https?:\/\//i.test(part)) {
                return (
                  <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
                    {part}
                  </a>
                );
              }

              return part.split(/(@[\w.-]+)/g).map((segment, segmentIndex) =>
                /^@[\w.-]+$/.test(segment) ? (
                  <span className="mention" key={`${part}-${index}-${segmentIndex}`}>
                    {segment}
                  </span>
                ) : (
                  <span key={`${part}-${index}-${segmentIndex}`}>{segment}</span>
                )
              );
            })}
          </p>
        ) : null}
        {links.map((link) => (
          <a key={link} className="link-preview" href={link} target="_blank" rel="noreferrer">
            <LinkIcon size={18} />
            <span>{link.replace(/^https?:\/\//i, '')}</span>
          </a>
        ))}
      </>
    );
  }

  function renderAttachments(attachments: MessageAttachment[]) {
    if (!attachments.length) return null;

    return (
      <div className="attachment-grid">
        {attachments.map((attachment) => {
          const kind = attachmentKind(attachment);
          const url = assetUrl(attachment.url);

          if (kind === 'image') {
            return (
              <a
                key={attachment.id ?? attachment.url}
                className="attachment image-attachment"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                <img src={url} alt={attachment.fileName} />
              </a>
            );
          }

          if (kind === 'video') {
            return (
              <div key={attachment.id ?? attachment.url} className="attachment video-attachment">
                <video src={url} controls preload="metadata" />
                <span>{attachment.fileName}</span>
              </div>
            );
          }

          const Icon = kind === 'archive' ? FileArchive : FileText;
          return (
            <a
              key={attachment.id ?? attachment.url}
              className="attachment file-attachment"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              <Icon size={22} />
              <span>
                <strong>{attachment.fileName}</strong>
                <small>{formatBytes(attachment.byteSize)}</small>
              </span>
            </a>
          );
        })}
      </div>
    );
  }

  async function saveMessageEdit(messageId: string) {
    if (!auth || !editingDraft.trim()) return;
    const result = await apiRequest<{ message: Message }>(
      `/messages/${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content: editingDraft.trim() })
      },
      auth.accessToken
    );
    setMessages((current) => current.map((message) => (message.id === messageId ? result.message : message)));
    setEditingMessageId(null);
    setEditingDraft('');
  }

  async function deleteMessage(messageId: string) {
    if (!auth) return;
    await apiRequest<{ message: Message }>(
      `/messages/${messageId}`,
      { method: 'DELETE' },
      auth.accessToken
    );
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, content: '', deletedAt: new Date().toISOString() } : message
      )
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
        body: JSON.stringify({ emoji })
      },
      auth.accessToken
    );
    setMessages((current) =>
      current.map((currentMessage) => (currentMessage.id === message.id ? result.message : currentMessage))
    );
  }

  async function startCall(mode: CallMode) {
    if (!channel || !socket?.connected) {
      setWorkspaceError('Realtime connection is not ready yet.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setWorkspaceError('This browser does not support media calls.');
      return;
    }

    try {
      if (callState) {
        endCall();
      }

      const stream =
        mode === 'screen'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: mode === 'video'
            });
      const nextState: CallState = {
        channelId: channel.id,
        mode,
        isMuted: false,
        isCameraOff: mode === 'voice',
        isSharingScreen: mode === 'screen'
      };

      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (callStateRef.current?.isSharingScreen) {
            endCall();
          }
        };
      });

      localStreamRef.current = stream;
      setCallState(nextState);
      setRemoteMedia([]);

      socket
        .timeout(5000)
        .emit(
          'voice:join',
          {
            channelId: channel.id,
            mode,
            isMuted: false,
            isCameraOff: mode === 'voice',
            isSharingScreen: mode === 'screen'
          },
          async (err: Error | null, result?: { participants: CallParticipant[] }) => {
            if (err) {
              setWorkspaceError('Cannot join call. Try again.');
              endCall();
              return;
            }

            const participants = result?.participants ?? [];
            setRemoteMedia(participants);
            await Promise.all(participants.map((participant) => createOffer(participant.socketId, channel.id)));
          }
        );
    } catch (err) {
      stopLocalStream();
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot start call');
    }
  }

  function endCall() {
    const activeChannelId = callStateRef.current?.channelId;
    if (activeChannelId) {
      socket?.emit('voice:leave', { channelId: activeChannelId });
    }
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    stopLocalStream();
    setRemoteMedia([]);
    setCallState(null);
  }

  function toggleMute() {
    if (!callState) return;
    const isMuted = !callState.isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    updateCallState({ isMuted });
  }

  function toggleCamera() {
    if (!callState || callState.mode === 'voice') return;
    const isCameraOff = !callState.isCameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOff;
    });
    updateCallState({ isCameraOff });
  }

  function updateCallState(patch: Partial<CallState>) {
    setCallState((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      socket?.emit('voice:state', next);
      return next;
    });
  }

  async function createOffer(targetSocketId: string, channelId: string) {
    if (!socket) return;
    const peer = createPeer(targetSocketId, channelId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('webrtc:offer', { channelId, targetSocketId, offer });
  }

  function createPeer(targetSocketId: string, channelId: string) {
    const existingPeer = peersRef.current.get(targetSocketId);
    if (existingPeer) return existingPeer;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    localStreamRef.current?.getTracks().forEach((track) => {
      const stream = localStreamRef.current;
      if (stream) {
        peer.addTrack(track, stream);
      }
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('webrtc:ice-candidate', {
          channelId,
          targetSocketId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      setRemoteMedia((current) =>
        current.map((item) => (item.socketId === targetSocketId ? { ...item, stream } : item))
      );
    };

    peer.onconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(peer.connectionState)) {
        closePeer(targetSocketId);
      }
    };

    peersRef.current.set(targetSocketId, peer);
    return peer;
  }

  function closePeer(socketId: string) {
    peersRef.current.get(socketId)?.close();
    peersRef.current.delete(socketId);
  }

  function stopLocalStream() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }

  function upsertRemote(current: RemoteMedia[], participant: CallParticipant) {
    const existing = current.find((item) => item.socketId === participant.socketId);
    if (!existing) return [...current, participant];
    return current.map((item) =>
      item.socketId === participant.socketId ? { ...item, ...participant, stream: item.stream } : item
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
  }

  if (!auth) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="brand-lockup">
            <h1>Welcome back!</h1>
            <p>We're so excited to see you again!</p>
          </div>

          <div className="segmented" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Register
            </button>
          </div>

          <form onSubmit={submitAuth} className="stack">
            <label>
              Email
              <input name="email" type="email" required placeholder="demo@example.com" />
            </label>
            {mode === 'register' ? (
              <>
                <label>
                  Username
                  <input name="username" required minLength={3} placeholder="demo" />
                </label>
                <label>
                  Display name
                  <input name="displayName" placeholder="Demo User" />
                </label>
              </>
            ) : null}
            <label>
              Password
              <input name="password" type="password" required minLength={8} placeholder="Demo@123456" />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button className="primary" type="submit">
              {mode === 'login' ? 'Log In' : 'Continue'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="server-rail">
        <button className="server-orb home active" title="Direct Messages">
          <MessageSquare size={20} />
        </button>
        <div className="rail-divider" />
        {servers.map((item, index) => (
          <button
            key={item.id}
            className={`server-orb ${accentClass(index)} ${server?.id === item.id ? 'active' : ''}`}
            title={item.name}
            onClick={() => void openServer(item.id)}
          >
            {initials(item.name)}
          </button>
        ))}
      </aside>

      <aside className="channel-sidebar">
        <div className="server-header">
          <div>
            <strong>{server?.name || 'Create a server'}</strong>
            <span>{server?.description || 'Realtime workspace'}</span>
          </div>
          {isLoadingServers ? <Loader2 className="spin" size={16} /> : null}
        </div>

        <div className="sidebar-scroll">
          <section className="sidebar-card">
            <div className="section-title">
              Workspace
            </div>
            <form onSubmit={createServer} className="compact-form">
              <input name="name" placeholder="New server" required />
              <input name="description" placeholder="Description" />
              <button
                data-testid="create-server-button"
                title="Create server"
                disabled={pendingAction === 'create-server'}
              >
                {pendingAction === 'create-server' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
              </button>
            </form>
            <form onSubmit={joinInvite} className="compact-form one-line">
              <input name="code" placeholder="Invite code" />
              <button
                data-testid="join-invite-button"
                title="Join invite"
                disabled={pendingAction === 'join-invite'}
              >
                {pendingAction === 'join-invite' ? <Loader2 className="spin" size={16} /> : <UserPlus size={16} />}
              </button>
            </form>
          </section>

          {server ? (
            <>
              <section className="sidebar-card">
                <div className="section-title">
                  Text Channels
                </div>
                <form onSubmit={createChannel} className="compact-form one-line">
                  <input data-testid="create-channel-input" name="name" placeholder="Create channel" required />
                  <input name="type" type="hidden" value="TEXT" readOnly />
                  <button
                    data-testid="create-channel-button"
                    title="Create text channel"
                    disabled={pendingAction === 'create-channel'}
                  >
                    {pendingAction === 'create-channel' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  </button>
                </form>
                <div className="channel-list">
                  {textChannels.map((item) => (
                    <button
                      key={item.id}
                      className={channel?.id === item.id ? 'selected' : ''}
                      onClick={() => setChannel(item)}
                    >
                      <Hash size={16} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="sidebar-card">
                <div className="section-title">
                  Voice Channels
                </div>
                <form onSubmit={createChannel} className="compact-form one-line">
                  <input data-testid="create-voice-input" name="name" placeholder="Create voice" required />
                  <input name="type" type="hidden" value="VOICE" readOnly />
                  <button
                    data-testid="create-voice-button"
                    title="Create voice channel"
                    disabled={pendingAction === 'create-channel'}
                  >
                    {pendingAction === 'create-channel' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  </button>
                </form>
                <div className="channel-list muted-list">
                  {voiceChannels.length ? (
                    voiceChannels.map((item) => (
                      <button key={item.id} type="button">
                        <Volume2 size={16} />
                        <span>{item.name}</span>
                      </button>
                    ))
                  ) : (
                    <p className="empty-note">No voice channels yet.</p>
                  )}
                </div>
              </section>

              <section className="sidebar-card">
                <div className="section-title">
                  Invite People
                </div>
                <button
                  className="wide-command"
                  data-testid="create-invite-button"
                  onClick={createInvite}
                  disabled={pendingAction === 'create-invite'}
                >
                  {pendingAction === 'create-invite' ? <Loader2 className="spin" size={15} /> : <Copy size={15} />}
                  Create invite
                </button>
                {inviteCode ? <code className="invite-code">{inviteCode}</code> : null}
              </section>
            </>
          ) : null}
        </div>

        <div className="user-strip">
          <div className={`avatar small ${accentClass(auth.user.id)}`}>{initials(auth.user.displayName)}</div>
          <div>
            <strong>{auth.user.displayName}</strong>
            <span>@{auth.user.username}</span>
          </div>
          <button onClick={logout} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div className="chat-title">
            <Hash size={20} />
            <div>
              <strong>{channel?.name || 'Select a channel'}</strong>
              <span>{channel ? 'Text channel' : 'Choose a workspace channel to start.'}</span>
            </div>
          </div>
          <div className="toolbar">
            <button
              className={callState?.mode === 'voice' ? 'selected' : ''}
              data-testid="voice-call-button"
              title="Start voice call"
              onClick={() => void startCall('voice')}
              disabled={!channel || Boolean(callState)}
            >
              <Phone size={18} />
            </button>
            <button
              className={callState?.mode === 'video' ? 'selected' : ''}
              data-testid="video-call-button"
              title="Start video call"
              onClick={() => void startCall('video')}
              disabled={!channel || Boolean(callState)}
            >
              <Video size={18} />
            </button>
            <button
              className={callState?.mode === 'screen' ? 'selected' : ''}
              data-testid="screen-share-button"
              title="Share screen"
              onClick={() => void startCall('screen')}
              disabled={!channel || Boolean(callState)}
            >
              <MonitorUp size={18} />
            </button>
            <button
              className={activePanel === 'notifications' ? 'selected' : ''}
              data-testid="notifications-button"
              title="Notifications"
              onClick={() => setActivePanel((current) => (current === 'notifications' ? null : 'notifications'))}
            >
              <Bell size={18} />
            </button>
            <button
              className={activePanel === 'search' ? 'selected' : ''}
              data-testid="search-button"
              title="Search"
              onClick={() => setActivePanel((current) => (current === 'search' ? null : 'search'))}
            >
              <Search size={18} />
            </button>
          </div>
        </header>

        <div className={`utility-panel ${activePanel ? 'open' : ''}`}>
          {activePanel === 'search' ? (
            <label>
              Search messages
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Keyword in current channel"
              />
            </label>
          ) : activePanel === 'notifications' ? (
            <div className="notification-empty">No new notifications.</div>
          ) : null}
        </div>

        {workspaceError ? (
          <div className="banner error-banner">
            {workspaceError}
            <button onClick={() => setWorkspaceError(null)}>Dismiss</button>
          </div>
        ) : null}

        {callState ? (
          <section className="call-stage" data-testid="call-stage">
            <div className="call-stage-header">
              <div>
                <strong>
                  {callState.isSharingScreen
                    ? 'Screen share'
                    : callState.mode === 'video'
                      ? 'Video call'
                      : 'Voice call'}
                </strong>
                <span>
                  #{channel?.name} · {remoteMedia.length + 1} participant
                  {remoteMedia.length ? 's' : ''}
                </span>
              </div>
              <div className="call-controls">
                <button
                  type="button"
                  className={callState.isMuted ? 'danger' : ''}
                  onClick={toggleMute}
                  title={callState.isMuted ? 'Unmute' : 'Mute'}
                >
                  {callState.isMuted ? <MicOff size={17} /> : <Mic size={17} />}
                </button>
                <button
                  type="button"
                  onClick={toggleCamera}
                  disabled={callState.mode === 'voice'}
                  title={callState.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {callState.isCameraOff ? <VideoOff size={17} /> : <Video size={17} />}
                </button>
                <button type="button" className="danger" onClick={endCall} title="Leave call">
                  <PhoneOff size={17} />
                </button>
              </div>
            </div>
            <div className="call-grid">
              <div className="call-tile local">
                {callState.mode !== 'voice' && !callState.isCameraOff ? (
                  <video ref={localVideoRef} autoPlay muted playsInline />
                ) : (
                  <div className={`avatar call-avatar ${accentClass(auth.user.id)}`}>
                    {initials(auth.user.displayName)}
                  </div>
                )}
                <div className="call-label">
                  <strong>{auth.user.displayName}</strong>
                  <span>
                    {callState.isSharingScreen ? 'Sharing screen' : callState.isMuted ? 'Muted' : 'You'}
                  </span>
                </div>
              </div>
              {remoteMedia.map((participant) => (
                <RemoteVideoTile key={participant.socketId} participant={participant} />
              ))}
            </div>
          </section>
        ) : null}

        <div className="message-list" data-testid="message-list">
          {isLoadingMessages ? (
            <div className="state-panel">
              <Loader2 className="spin" size={22} />
              Loading messages
            </div>
          ) : !channel ? (
            <div className="state-panel">
              <Hash size={24} />
              Select a channel from the sidebar.
            </div>
          ) : messages.length === 0 ? (
            <div className="state-panel">
              <MessageSquare size={24} />
              <strong>Welcome to #{channel.name}</strong>
              <span>This is the start of the channel.</span>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="state-panel">
              <Search size={24} />
              No messages match the current search.
            </div>
          ) : (
            visibleMessages.map((message) => {
              const canManage = message.authorId === auth.user.id && !message.deletedAt;
              const isEditing = editingMessageId === message.id;

              return (
                <article key={message.id} className="message" data-testid="message" data-message-id={message.id}>
                  <div className={`avatar ${accentClass(message.authorId)}`}>
                    {initials(message.author.displayName)}
                  </div>
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>{message.author.displayName}</strong>
                      <span>{formatDate(message.createdAt)}</span>
                      {message.editedAt ? <span>edited</span> : null}
                    </div>

                    {message.deletedAt ? (
                      <p className="deleted-message">Message deleted</p>
                    ) : isEditing ? (
                      <div className="edit-row">
                        <input
                          value={editingDraft}
                          onChange={(event) => setEditingDraft(event.target.value)}
                          autoFocus
                        />
                        <button onClick={() => void saveMessageEdit(message.id)}>Save</button>
                        <button
                          className="ghost"
                          onClick={() => {
                            setEditingMessageId(null);
                            setEditingDraft('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      renderMessageContent(message)
                    )}

                    {!message.deletedAt ? renderAttachments(message.attachments ?? []) : null}

                    {!message.deletedAt ? (
                      <div className="reaction-row">
                        {message.reactions.map((reaction) => (
                          <button
                            key={reaction.emoji}
                            type="button"
                            className={reaction.me ? 'active' : ''}
                            onClick={() => void toggleReaction(message, reaction.emoji)}
                            title={`React ${reaction.emoji}`}
                          >
                            <span>{reaction.emoji}</span>
                            <strong>{reaction.count}</strong>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {!message.deletedAt && !isEditing ? (
                      <div className="message-actions">
                        <button title="Reply" onClick={() => setReplyingToMessage(message)}>
                          <Reply size={14} />
                        </button>
                        <button title="React" onClick={() => void toggleReaction(message, QUICK_REACTIONS[0])}>
                          <SmilePlus size={14} />
                        </button>
                        {canManage ? (
                          <>
                            <button
                              title="Edit message"
                              onClick={() => {
                                setEditingMessageId(message.id);
                                setEditingDraft(message.content);
                              }}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button title="Delete message" onClick={() => void deleteMessage(message.id)}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {typingUsers.length ? (
          <div className="typing-indicator">
            {typingUsers.length === 1 ? 'Someone is typing...' : `${typingUsers.length} people are typing...`}
          </div>
        ) : null}

        <form onSubmit={sendMessage} className="composer">
          {replyingToMessage ? (
            <div className="composer-reply">
              <Reply size={14} />
              <span>
                Replying to <strong>{replyingToMessage.author.displayName}</strong>
              </span>
              <button type="button" onClick={() => setReplyingToMessage(null)} title="Cancel reply">
                <X size={14} />
              </button>
            </div>
          ) : null}
          {selectedFiles.length ? (
            <div className="pending-attachments">
              {selectedFiles.map((file, index) => {
                const isImage = file.type.startsWith('image/');
                return (
                  <button
                    key={`${file.name}-${file.lastModified}-${index}`}
                    type="button"
                    className="pending-file"
                    onClick={() => removeSelectedFile(index)}
                    title="Remove attachment"
                  >
                    {isImage ? <Image size={17} /> : <FileText size={17} />}
                    <span>{file.name}</span>
                    <small>{formatBytes(file.size)}</small>
                  </button>
                );
              })}
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,application/pdf,text/plain,application/zip,.zip"
            onChange={selectFiles}
            disabled={!channel || pendingAction === 'send-message'}
          />
          <button
            type="button"
            className="attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!channel || pendingAction === 'send-message'}
            title="Attach file"
          >
            <Paperclip size={18} />
          </button>
          <input
            name="content"
            data-testid="composer-input"
            placeholder={channel ? `Message #${channel.name}, paste a link, or attach media` : 'Select a channel'}
            disabled={!channel || pendingAction === 'send-message'}
            onChange={handleComposerInput}
          />
          <button
            data-testid="composer-send"
            disabled={!channel || pendingAction === 'send-message'}
            title="Send message"
          >
            {pendingAction === 'send-message' ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          </button>
        </form>
      </section>

      <aside className="member-sidebar">
        <div className="member-title">
          Members — {server?.members.length ?? 0}
        </div>
        <div className="member-list">
          {server?.members.map((member) => (
            <div key={member.id} className="member">
              <div className="avatar-wrap">
                <div className={`avatar small ${accentClass(member.user.id)}`}>
                  {initials(member.user.displayName)}
                </div>
                <span className={`status-dot ${member.user.status?.toLowerCase() || 'offline'}`} />
              </div>
              <div>
                <strong>{member.user.displayName}</strong>
                <span>{member.kind === 'OWNER' ? 'Owner' : member.user.status || 'Member'}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}
