import { Hash, LogOut, MessageSquare, Plus, Send, Server as ServerIcon, Users } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  apiRequest,
  AuthState,
  Channel,
  Message,
  ServerDetail,
  ServerSummary
} from './api';

const AUTH_KEY = 'discord-clone-auth';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

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
    void apiRequest<{ messages: Message[] }>(
      `/channels/${channel.id}/messages`,
      {},
      auth.accessToken
    ).then((result) => setMessages(result.messages));
    socket?.emit('channel:join', { channelId: channel.id });
  }, [channel?.id, auth?.accessToken, socket]);

  const activeTextChannels = useMemo(
    () => server?.channels.filter((item) => item.type === 'TEXT') ?? [],
    [server]
  );

  async function loadServers(token: string) {
    const result = await apiRequest<{ servers: ServerSummary[] }>('/servers', {}, token);
    setServers(result.servers);
    if (!server && result.servers[0]) {
      await openServer(result.servers[0].id, token);
    }
  }

  async function openServer(serverId: string, token = auth?.accessToken) {
    if (!token) return;
    const result = await apiRequest<{ server: ServerDetail }>(`/servers/${serverId}`, {}, token);
    setServer(result.server);
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
          body: JSON.stringify(mode === 'login' ? { email: payload.email, password: payload.password } : payload)
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
    const form = new FormData(event.currentTarget);
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
    event.currentTarget.reset();
    await loadServers(auth.accessToken);
    await openServer(result.server.id);
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server) return;
    const form = new FormData(event.currentTarget);
    const result = await apiRequest<{ channel: Channel }>(
      `/servers/${server.id}/channels`,
      {
        method: 'POST',
        body: JSON.stringify({ name: String(form.get('name')), type: 'TEXT' })
      },
      auth.accessToken
    );
    event.currentTarget.reset();
    await openServer(server.id);
    setChannel(result.channel);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !channel) return;
    const form = new FormData(event.currentTarget);
    const content = String(form.get('content') || '').trim();
    if (!content) return;
    event.currentTarget.reset();

    if (socket?.connected) {
      socket.emit('message:create', { channelId: channel.id, content });
      return;
    }

    const result = await apiRequest<{ message: Message }>(
      `/channels/${channel.id}/messages`,
      { method: 'POST', body: JSON.stringify({ content }) },
      auth.accessToken
    );
    setMessages((current) => [...current, result.message]);
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
          <div>
            <h1>Discord Clone</h1>
            <p>Realtime server chat MVP</p>
          </div>
          <div className="segmented">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Login
            </button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
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
        <button className="round active" title="Home">
          <MessageSquare size={22} />
        </button>
        {servers.map((item) => (
          <button
            key={item.id}
            className={`round ${server?.id === item.id ? 'active' : ''}`}
            title={item.name}
            onClick={() => void openServer(item.id)}
          >
            {item.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
      </aside>

      <aside className="channel-sidebar">
        <div className="sidebar-header">
          <ServerIcon size={18} />
          <strong>{server?.name || 'No server'}</strong>
        </div>

        <form onSubmit={createServer} className="compact-form">
          <input name="name" placeholder="New server" required />
          <input name="description" placeholder="Description" />
          <button title="Create server">
            <Plus size={16} />
          </button>
        </form>

        {server ? (
          <form onSubmit={createChannel} className="compact-form">
            <input name="name" placeholder="New channel" required />
            <button title="Create channel">
              <Hash size={16} />
            </button>
          </form>
        ) : null}

        <div className="channel-list">
          {activeTextChannels.map((item) => (
            <button
              key={item.id}
              className={channel?.id === item.id ? 'selected' : ''}
              onClick={() => setChannel(item)}
            >
              <Hash size={16} />
              {item.name}
            </button>
          ))}
        </div>

        <div className="user-strip">
          <span>{auth.user.displayName}</span>
          <button onClick={logout} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <Hash size={18} />
          <strong>{channel?.name || 'Select a channel'}</strong>
        </header>
        <div className="message-list">
          {messages.map((message) => (
            <article key={message.id} className="message">
              <div className="avatar">{message.author.displayName.slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="message-meta">
                  <strong>{message.author.displayName}</strong>
                  <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                </div>
                <p>{message.deletedAt ? 'Message deleted' : message.content}</p>
              </div>
            </article>
          ))}
        </div>
        <form onSubmit={sendMessage} className="composer">
          <input name="content" placeholder={channel ? `Message #${channel.name}` : 'Select a channel'} disabled={!channel} />
          <button disabled={!channel} title="Send message">
            <Send size={18} />
          </button>
        </form>
      </section>

      <aside className="member-sidebar">
        <div className="member-title">
          <Users size={16} />
          Members
        </div>
        {server?.members.map((member) => (
          <div key={member.id} className="member">
            <div className="avatar small">{member.user.displayName.slice(0, 1).toUpperCase()}</div>
            <span>{member.user.displayName}</span>
          </div>
        ))}
      </aside>
    </main>
  );
}
