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
  Paperclip,
  Plus,
  Search,
  Send,
  Server as ServerIcon,
  Shield,
  Trash2,
  UserPlus,
  Users,
  Volume2
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
  const [activePanel, setActivePanel] = useState<'notifications' | 'search' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [auth?.accessToken]);

  useEffect(() => {
    if (!channel || !auth) return;
    setIsLoadingMessages(true);
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

      const payload = { channelId: channel.id, content, attachments };

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
        { method: 'POST', body: JSON.stringify({ content, attachments }) },
        auth.accessToken
      );
      setMessages((current) => [...current, result.message]);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot send message');
    } finally {
      setPendingAction(null);
    }
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
        {message.content ? (
          <p>
            {parts.map((part, index) =>
              /^https?:\/\//i.test(part) ? (
                <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
                  {part}
                </a>
              ) : (
                <span key={`${part}-${index}`}>{part}</span>
              )
            )}
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

  function logout() {
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
            <div className="brand-mark">D</div>
            <div>
              <h1>Discord Clone</h1>
              <p>Realtime servers, channels, members, and messages.</p>
            </div>
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
              {mode === 'login' ? 'Login' : 'Create account'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="server-rail">
        <button className="server-orb home active" title="Direct messages">
          <MessageSquare size={22} />
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
          {isLoadingServers ? <Loader2 className="spin" size={16} /> : <Shield size={16} />}
        </div>

        <div className="sidebar-scroll">
          <section className="sidebar-card">
            <div className="section-title">
              <ServerIcon size={14} />
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
                  <Hash size={14} />
                  Text channels
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
                  <Volume2 size={14} />
                  Voice channels
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
                  <UserPlus size={14} />
                  Invite
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
              This channel is empty. Send the first message.
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
                <article key={message.id} className="message" data-testid="message">
                  <div className={`avatar ${accentClass(message.authorId)}`}>
                    {initials(message.author.displayName)}
                  </div>
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>{message.author.displayName}</strong>
                      <span>{formatTime(message.createdAt)}</span>
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

                    {canManage && !isEditing ? (
                      <div className="message-actions">
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
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>

        <form onSubmit={sendMessage} className="composer">
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
          <Users size={16} />
          Members
        </div>
        <div className="member-list">
          {server?.members.map((member) => (
            <div key={member.id} className="member">
              <div className="avatar-wrap">
                <div className={`avatar small ${accentClass(member.user.id)}`}>
                  {initials(member.user.displayName)}
                </div>
                <span className="status-dot" />
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
