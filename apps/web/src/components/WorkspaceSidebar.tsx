import {
  ChevronDown,
  Edit3,
  Hash,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, RefObject, useState } from 'react';
import { assetUrl, AuthState, Channel, ServerDetail, ServerSummary } from '../api';
import { accentClass, ActiveCallSummary, initials } from '../helpers';
import { ActiveDialog } from './ChatPanel';

export interface ChannelBadgeState {
  count: number;
  mentions: number;
}

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
  activeCalls: Record<string, ActiveCallSummary>;
  channelBadges: Record<string, ChannelBadgeState>;
  profileAvatarInputRef: RefObject<HTMLInputElement | null>;
  openHome: () => void;
  openServer: (serverId: string) => Promise<void>;
  createServer: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  joinInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createInvite: () => Promise<void>;
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
  activeCalls,
  channelBadges,
  profileAvatarInputRef,
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
}: WorkspaceSidebarProps) {
  const [serverAction, setServerAction] = useState<'create' | 'join' | null>(null);
  const [channelCreateType, setChannelCreateType] = useState<'TEXT' | 'VOICE' | null>(null);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  async function submitCreateServer(event: FormEvent<HTMLFormElement>) {
    await createServer(event);
    setServerAction(null);
  }

  async function submitJoinInvite(event: FormEvent<HTMLFormElement>) {
    await joinInvite(event);
    setServerAction(null);
  }

  async function submitCreateChannel(event: FormEvent<HTMLFormElement>) {
    await createChannel(event);
    setChannelCreateType(null);
  }

  return (
    <>
      <aside className="server-rail">
        <button
          type="button"
          className={`server-orb home ${!server ? 'active' : ''}`}
          title="Direct Messages"
          onClick={openHome}
        >
          <MessageSquare size={20} />
          <span className="server-tooltip">Direct Messages</span>
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
            <span className="server-tooltip">{item.name}</span>
          </button>
        ))}
        <button
          type="button"
          className="server-orb add-server"
          title="Add a Server"
          onClick={() => setServerAction('create')}
        >
          <Plus size={24} />
          <span className="server-tooltip">Add a Server</span>
        </button>
      </aside>

      <aside className={`channel-sidebar ${server ? '' : 'home-mode'}`}>
        <div className="server-header">
          {server ? (
            <button
              type="button"
              className={`server-dropdown-button ${serverMenuOpen ? 'menu-open' : ''}`}
              onClick={() => setServerMenuOpen((current) => !current)}
              title="Open server menu"
              aria-expanded={serverMenuOpen}
            >
              <strong>{server.name}</strong>
              <span className="server-dropdown-indicator" aria-hidden="true">
                <ChevronDown size={15} />
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="server-dropdown-button home-title"
              onClick={openHome}
              title="Direct Messages"
            >
              <MessageSquare size={18} />
              <strong>Direct Messages</strong>
            </button>
          )}
          {serverMenuOpen && server ? (
            <div className="server-menu">
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  setActiveDialog('server-settings');
                }}
              >
                <Settings size={16} />
                Server Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  void createInvite();
                }}
                disabled={pendingAction === 'create-invite'}
              >
                {pendingAction === 'create-invite' ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <UserPlus size={16} />
                )}
                Invite People
              </button>
              {inviteCode ? (
                <span className="server-menu-hint">Invite is ready to paste</span>
              ) : null}
            </div>
          ) : null}
          {isLoadingServers ? (
            <Loader2 className="spin" size={16} />
          ) : server ? (
            <button
              type="button"
              className={`server-search-button ${isSearchOpen ? 'selected' : ''}`}
              title="Search channels"
              onClick={() => setIsSearchOpen((current) => !current)}
            >
              <Search size={16} />
            </button>
          ) : null}
        </div>

        <div className="sidebar-scroll">
          {server ? (
            <>
              <div className={`channel-search ${isSearchOpen ? 'open' : ''}`}>
                <Search size={14} />
                <input
                  value={channelQuery}
                  onChange={(event) => setChannelQuery(event.target.value)}
                  placeholder="Find channel"
                />
              </div>
              <section className="sidebar-card">
                <div className="section-title">
                  Text Channels
                  <button
                    type="button"
                    title="Create text channel"
                    onClick={() => setChannelCreateType('TEXT')}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="channel-list">
                  {visibleTextChannels.map((item) => (
                    <button
                      key={item.id}
                      className={channel?.id === item.id ? 'selected' : ''}
                      onClick={() => setChannel(item)}
                    >
                      <Hash size={16} />
                      <span>{item.name}</span>
                      {activeCalls[item.id] ? (
                        <span className="channel-live-badge">
                          {activeCalls[item.id].mode === 'screen' ? 'Live' : 'Call'}
                        </span>
                      ) : null}
                      {channelBadges[item.id]?.mentions ? (
                        <span className="channel-mention-badge">
                          {channelBadges[item.id].mentions}
                        </span>
                      ) : channelBadges[item.id]?.count ? (
                        <span className="channel-unread-dot" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>

              <section className="sidebar-card">
                <div className="section-title">
                  Voice Channels
                  <button
                    type="button"
                    title="Create voice channel"
                    onClick={() => setChannelCreateType('VOICE')}
                  >
                    <Plus size={16} />
                  </button>
                </div>
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
              <span className={`avatar small ${accentClass(auth.user.id)}`}>
                {initials(auth.user.displayName)}
              </span>
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

      {serverAction ? (
        <div className="server-add-modal" onClick={() => setServerAction(null)}>
          <div className="server-add-card" onClick={(event) => event.stopPropagation()}>
            <div className="server-add-header">
              <strong>{serverAction === 'create' ? 'Create a server' : 'Join a server'}</strong>
              <button type="button" onClick={() => setServerAction(null)} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="server-action-tabs">
              <button
                type="button"
                className={serverAction === 'create' ? 'active' : ''}
                onClick={() => setServerAction('create')}
              >
                <Plus size={16} />
                Create
              </button>
              <button
                type="button"
                className={serverAction === 'join' ? 'active' : ''}
                onClick={() => setServerAction('join')}
              >
                <UserPlus size={16} />
                Join
              </button>
            </div>
            {serverAction === 'create' ? (
              <form onSubmit={submitCreateServer} className="modal-form">
                <label>
                  Server name
                  <input name="name" placeholder="New server" required />
                </label>
                <label>
                  Description
                  <input name="description" placeholder="Optional description" />
                </label>
                <button
                  className="primary"
                  data-testid="create-server-button"
                  disabled={pendingAction === 'create-server'}
                >
                  {pendingAction === 'create-server' ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    'Create Server'
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={submitJoinInvite} className="modal-form">
                <label>
                  Invite code
                  <input
                    name="code"
                    placeholder="Paste invite code"
                    aria-label="Invite code"
                    required
                  />
                </label>
                <button
                  className="primary"
                  data-testid="join-invite-button"
                  disabled={pendingAction === 'join-invite'}
                >
                  {pendingAction === 'join-invite' ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    'Join Server'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {channelCreateType ? (
        <div className="channel-create-modal" onClick={() => setChannelCreateType(null)}>
          <form
            className="channel-create-card"
            onSubmit={submitCreateChannel}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="server-add-header">
              <strong>Create {channelCreateType === 'TEXT' ? 'text' : 'voice'} channel</strong>
              <button type="button" onClick={() => setChannelCreateType(null)} title="Close">
                <X size={18} />
              </button>
            </div>
            <label>
              Channel name
              <input
                data-testid={
                  channelCreateType === 'TEXT' ? 'create-channel-input' : 'create-voice-input'
                }
                name="name"
                placeholder={channelCreateType === 'TEXT' ? 'new-channel' : 'New voice'}
                required
              />
            </label>
            <input name="type" type="hidden" value={channelCreateType} readOnly />
            <button
              className="primary"
              data-testid={
                channelCreateType === 'TEXT' ? 'create-channel-button' : 'create-voice-button'
              }
              disabled={pendingAction === 'create-channel'}
            >
              {pendingAction === 'create-channel' ? (
                <Loader2 className="spin" size={16} />
              ) : (
                'Create Channel'
              )}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
