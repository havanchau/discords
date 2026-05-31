import { Copy, Edit3, Hash, Loader2, LogOut, MessageSquare, Plus, Search, UserPlus, Volume2 } from 'lucide-react';
import { ChangeEvent, FormEvent, RefObject } from 'react';
import { assetUrl, AuthState, Channel, ServerDetail, ServerSummary } from '../api';
import { accentClass, initials } from '../helpers';
import { ActiveDialog } from './ChatPanel';

interface WorkspaceSidebarProps {
  auth: AuthState;
  servers: ServerSummary[];
  server: ServerDetail | null;
  channel: Channel | null;
  visibleTextChannels: Channel[];
  visibleVoiceChannels: Channel[];
  channelQuery: string;
  inviteCode: string | null;
  isLoadingServers: boolean;
  pendingAction: string | null;
  profileAvatarInputRef: RefObject<HTMLInputElement | null>;
  openServer: (serverId: string) => Promise<void>;
  createServer: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  joinInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createInvite: () => Promise<void>;
  copyInviteCode: () => Promise<void>;
  updateProfileAvatar: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  logout: () => void;
  setChannel: (channel: Channel) => void;
  setChannelQuery: (query: string) => void;
  setActiveDialog: (dialog: ActiveDialog) => void;
}

export function WorkspaceSidebar({
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
  profileAvatarInputRef,
  openServer,
  createServer,
  joinInvite,
  createChannel,
  createInvite,
  copyInviteCode,
  updateProfileAvatar,
  logout,
  setChannel,
  setChannelQuery,
  setActiveDialog
}: WorkspaceSidebarProps) {
  return (
    <>
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
          {isLoadingServers ? (
            <Loader2 className="spin" size={16} />
          ) : server ? (
            <button type="button" title="Server settings" onClick={() => setActiveDialog('server-settings')}>
              <Edit3 size={16} />
            </button>
          ) : null}
        </div>

        <div className="sidebar-scroll">
          <section className="sidebar-card">
            <div className="section-title">Workspace</div>
            <form onSubmit={createServer} className="compact-form">
              <input name="name" placeholder="New server" required />
              <input name="description" placeholder="Description" />
              <button data-testid="create-server-button" title="Create server" disabled={pendingAction === 'create-server'}>
                {pendingAction === 'create-server' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
              </button>
            </form>
          </section>

          <section className="sidebar-card">
            <div className="section-title">Join Server</div>
            <form onSubmit={joinInvite} className="compact-form one-line">
              <input name="code" placeholder="Paste invite code" aria-label="Invite code" />
              <button data-testid="join-invite-button" title="Join server with invite code" disabled={pendingAction === 'join-invite'}>
                {pendingAction === 'join-invite' ? <Loader2 className="spin" size={16} /> : <UserPlus size={16} />}
              </button>
            </form>
          </section>

          {server ? (
            <>
              <div className="channel-search">
                <Search size={14} />
                <input
                  value={channelQuery}
                  onChange={(event) => setChannelQuery(event.target.value)}
                  placeholder="Find channel"
                />
              </div>
              <section className="sidebar-card">
                <div className="section-title">Text Channels</div>
                <form onSubmit={createChannel} className="compact-form one-line">
                  <input data-testid="create-channel-input" name="name" placeholder="Create channel" required />
                  <input name="type" type="hidden" value="TEXT" readOnly />
                  <button data-testid="create-channel-button" title="Create text channel" disabled={pendingAction === 'create-channel'}>
                    {pendingAction === 'create-channel' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  </button>
                </form>
                <div className="channel-list">
                  {visibleTextChannels.map((item) => (
                    <button key={item.id} className={channel?.id === item.id ? 'selected' : ''} onClick={() => setChannel(item)}>
                      <Hash size={16} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="sidebar-card">
                <div className="section-title">Voice Channels</div>
                <form onSubmit={createChannel} className="compact-form one-line">
                  <input data-testid="create-voice-input" name="name" placeholder="Create voice" required />
                  <input name="type" type="hidden" value="VOICE" readOnly />
                  <button data-testid="create-voice-button" title="Create voice channel" disabled={pendingAction === 'create-channel'}>
                    {pendingAction === 'create-channel' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  </button>
                </form>
                <div className="channel-list muted-list">
                  {visibleVoiceChannels.length ? (
                    visibleVoiceChannels.map((item) => (
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
                <div className="section-title">Invite People</div>
                <button
                  className="wide-command"
                  data-testid="create-invite-button"
                  onClick={createInvite}
                  disabled={pendingAction === 'create-invite'}
                >
                  {pendingAction === 'create-invite' ? <Loader2 className="spin" size={15} /> : <Copy size={15} />}
                  Create invite
                </button>
                {inviteCode ? (
                  <button type="button" className="invite-code" onClick={() => void copyInviteCode()}>
                    {inviteCode}
                    <Copy size={13} />
                  </button>
                ) : null}
              </section>
            </>
          ) : null}
        </div>

        <div className="user-strip">
          <input
            ref={profileAvatarInputRef}
            className="file-input"
            type="file"
            accept="image/*"
            onChange={updateProfileAvatar}
          />
          <button
            type="button"
            className="avatar-button"
            onClick={() => profileAvatarInputRef.current?.click()}
            title="Change profile avatar"
            disabled={pendingAction === 'profile-avatar'}
          >
            {auth.user.avatarUrl ? (
              <img src={assetUrl(auth.user.avatarUrl)} alt={auth.user.displayName} />
            ) : (
              <span className={`avatar small ${accentClass(auth.user.id)}`}>{initials(auth.user.displayName)}</span>
            )}
          </button>
          <div>
            <strong>{auth.user.displayName}</strong>
            <span>@{auth.user.username}</span>
          </div>
          <button type="button" onClick={() => setActiveDialog('profile')} title="Edit profile">
            <Edit3 size={16} />
          </button>
          <button onClick={logout} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
