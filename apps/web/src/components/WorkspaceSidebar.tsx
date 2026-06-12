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
} from 'lucide-react';
import { ChangeEvent, FormEvent, RefObject, type ReactNode, useState } from 'react';
import { assetUrl, AuthState, Channel, ServerDetail, ServerSummary } from '../api';
import { accentClass, ActiveCallSummary, initials } from '../helpers';
import { cn } from '../utils/cn';
import { ActiveDialog } from './ChatPanel';
import styles from './WorkspaceSidebar.module.css';
import {
  Button,
  DialogContent,
  DialogRoot,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  TextField,
  Tooltip,
} from './ui';

export interface ChannelBadgeState {
  count: number;
  mentions: number;
}

export interface WorkspaceSidebarState {
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
}

export interface WorkspaceSidebarActions {
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

export interface WorkspaceSidebarProps {
  workspace: WorkspaceSidebarState;
  profileAvatarInputRef: RefObject<HTMLInputElement | null>;
  actions: WorkspaceSidebarActions;
}

export function WorkspaceSidebar({
  workspace,
  profileAvatarInputRef,
  actions,
}: WorkspaceSidebarProps) {
  const {
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
  } = workspace;
  const {
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
  } = actions;
  const [serverAction, setServerAction] = useState<'create' | 'join' | null>(null);
  const [channelCreateType, setChannelCreateType] = useState<'TEXT' | 'VOICE' | null>(null);
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
      <aside className={cn(styles.serverRail, 'server-rail')} aria-label="Servers">
        <Tooltip content="Direct Messages" side="right">
          <Button
            type="button"
            className={cn(
              styles.serverButton,
              styles.serverHome,
              !server && styles.serverButtonActive,
            )}
            aria-current={!server ? 'page' : undefined}
            onClick={openHome}
          >
            <MessageSquare size={20} aria-hidden="true" />
          </Button>
        </Tooltip>
        <div className={styles.railDivider} />
        {servers.map((item) => (
          <Tooltip key={item.id} content={item.name} side="right">
            <Button
              type="button"
              className={cn(
                styles.serverButton,
                server?.id === item.id && styles.serverButtonActive,
              )}
              aria-label={item.name}
              aria-current={server?.id === item.id ? 'page' : undefined}
              onClick={() => void openServer(item.id)}
            >
              {initials(item.name)}
            </Button>
          </Tooltip>
        ))}
        <Tooltip content="Add a Server" side="right">
          <Button
            type="button"
            className={cn(styles.serverButton, styles.serverAdd)}
            aria-label="Add a Server"
            onClick={() => setServerAction('create')}
          >
            <Plus size={24} aria-hidden="true" />
          </Button>
        </Tooltip>
      </aside>

      <aside
        className={cn(styles.channelSidebar, !server && styles.homeMode, 'channel-sidebar')}
        aria-label={server ? `${server.name} channels` : 'Direct Messages'}
      >
        <div className={styles.serverHeader}>
          {server ? (
            <DropdownMenuRoot>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" className={styles.serverDropdownButton}>
                  <strong>{server.name}</strong>
                  <ChevronDown size={16} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom">
                <DropdownMenuItem onSelect={() => setActiveDialog('server-settings')}>
                  <Settings size={16} aria-hidden="true" />
                  Server Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={pendingAction === 'create-invite'}
                  onSelect={() => void createInvite()}
                >
                  {pendingAction === 'create-invite' ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : (
                    <UserPlus size={16} aria-hidden="true" />
                  )}
                  Invite People
                </DropdownMenuItem>
                {inviteCode ? (
                  <>
                    <DropdownMenuSeparator />
                    <span className={styles.menuHint}>Invite is ready to paste</span>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenuRoot>
          ) : (
            <Button type="button" variant="ghost" className={styles.homeButton} onClick={openHome}>
              <MessageSquare size={18} aria-hidden="true" />
              <strong>Direct Messages</strong>
            </Button>
          )}
          {isLoadingServers ? (
            <Loader2 className="spin" size={16} aria-hidden="true" />
          ) : server ? (
            <IconButton
              className={styles.headerAction}
              label="Search channels"
              aria-pressed={isSearchOpen}
              onClick={() => setIsSearchOpen((current) => !current)}
            >
              <Search size={16} aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>

        {server ? (
          <div className={styles.serverBanner} aria-hidden="true">
            <div>
              <strong>{server.name}</strong>
              <span>Public</span>
            </div>
            <i />
            <b />
          </div>
        ) : null}

        <div className={styles.sidebarScroll}>
          {server ? (
            <>
              <TextField
                fieldClassName={styles.channelSearchField}
                shellClassName={cn(styles.channelSearch, isSearchOpen && styles.channelSearchOpen)}
                value={channelQuery}
                onChange={(event) => setChannelQuery(event.target.value)}
                placeholder="Browse Channels"
                aria-label="Browse channels"
                leadingIcon={<Search size={14} aria-hidden="true" />}
              />

              <ChannelGroup
                title="Text Channels"
                createLabel="Create text channel"
                onCreate={() => setChannelCreateType('TEXT')}
              >
                {visibleTextChannels.map((item) => (
                  <ChannelRow
                    key={item.id}
                    channel={item}
                    icon={<Hash size={16} aria-hidden="true" />}
                    active={channel?.id === item.id}
                    badge={channelBadges[item.id]}
                    activeCall={activeCalls[item.id]}
                    onClick={() => setChannel(item)}
                  />
                ))}
              </ChannelGroup>

              <ChannelGroup
                title="Voice Channels"
                createLabel="Create voice channel"
                onCreate={() => setChannelCreateType('VOICE')}
              >
                {visibleVoiceChannels.length ? (
                  visibleVoiceChannels.map((item) => (
                    <div className={styles.voiceBlock} key={item.id}>
                      <ChannelRow
                        channel={item}
                        icon={<Volume2 size={16} aria-hidden="true" />}
                        muted
                        activeCall={activeCalls[item.id]}
                      />
                      {activeCalls[item.id]?.participants.length ? (
                        <div className={styles.voiceOccupants}>
                          {activeCalls[item.id].participants.map((participant) => (
                            <span key={participant.socketId}>
                              {participant.displayName}
                              {participant.isMuted ? ' muted' : ''}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className={styles.emptyNote}>No voice channels yet.</p>
                )}
              </ChannelGroup>
            </>
          ) : null}
        </div>

        <div className={styles.userStrip}>
          <input
            ref={profileAvatarInputRef}
            className={styles.hiddenFileInput}
            type="file"
            accept="image/*"
            onChange={updateProfileAvatar}
          />
          <Button
            type="button"
            className={styles.avatarButton}
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
          </Button>
          <div>
            <strong>{auth.user.displayName}</strong>
            <span>@{auth.user.username}</span>
          </div>
          <IconButton label="Edit profile" onClick={() => setActiveDialog('profile')}>
            <Edit3 size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Logout" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </aside>

      <DialogRoot
        open={Boolean(serverAction)}
        onOpenChange={(open) => !open && setServerAction(null)}
      >
        <DialogContent title={serverAction === 'join' ? 'Join a server' : 'Create a server'}>
          <div className={styles.dialogTabs}>
            <Button
              variant={serverAction === 'create' ? 'primary' : 'secondary'}
              onClick={() => setServerAction('create')}
            >
              <Plus size={16} aria-hidden="true" />
              Create
            </Button>
            <Button
              variant={serverAction === 'join' ? 'primary' : 'secondary'}
              onClick={() => setServerAction('join')}
            >
              <UserPlus size={16} aria-hidden="true" />
              Join
            </Button>
          </div>
          {serverAction === 'join' ? (
            <form onSubmit={submitJoinInvite} className={styles.dialogForm}>
              <TextField
                name="code"
                label="Invite code"
                placeholder="Paste invite code"
                aria-label="Invite code"
                required
              />
              <Button
                type="submit"
                fullWidth
                data-testid="join-invite-button"
                disabled={pendingAction === 'join-invite'}
              >
                {pendingAction === 'join-invite' ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  'Join Server'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitCreateServer} className={styles.dialogForm}>
              <TextField name="name" label="Server name" placeholder="New server" required />
              <TextField
                name="description"
                label="Description"
                placeholder="Optional description"
              />
              <Button
                type="submit"
                fullWidth
                data-testid="create-server-button"
                disabled={pendingAction === 'create-server'}
              >
                {pendingAction === 'create-server' ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  'Create Server'
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </DialogRoot>

      <DialogRoot
        open={Boolean(channelCreateType)}
        onOpenChange={(open) => !open && setChannelCreateType(null)}
      >
        <DialogContent title={`Create ${channelCreateType === 'VOICE' ? 'voice' : 'text'} channel`}>
          <form onSubmit={submitCreateChannel} className={styles.dialogForm}>
            <TextField
              data-testid={
                channelCreateType === 'VOICE' ? 'create-voice-input' : 'create-channel-input'
              }
              name="name"
              label="Channel name"
              placeholder={channelCreateType === 'VOICE' ? 'New voice' : 'new-channel'}
              required
            />
            <input name="type" type="hidden" value={channelCreateType ?? 'TEXT'} readOnly />
            <Button
              type="submit"
              fullWidth
              data-testid={
                channelCreateType === 'VOICE' ? 'create-voice-button' : 'create-channel-button'
              }
              disabled={pendingAction === 'create-channel'}
            >
              {pendingAction === 'create-channel' ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                'Create Channel'
              )}
            </Button>
          </form>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

type ChannelGroupProps = {
  title: string;
  createLabel: string;
  onCreate: () => void;
  children: ReactNode;
};

function ChannelGroup({ title, createLabel, onCreate, children }: ChannelGroupProps) {
  return (
    <section className={styles.channelGroup}>
      <div className={styles.sectionTitle}>
        {title}
        <IconButton label={createLabel} size="sm" onClick={onCreate}>
          <Plus size={16} aria-hidden="true" />
        </IconButton>
      </div>
      <div className={styles.channelList}>{children}</div>
    </section>
  );
}

type ChannelRowProps = {
  channel: Channel;
  icon: ReactNode;
  active?: boolean;
  muted?: boolean;
  badge?: ChannelBadgeState;
  activeCall?: ActiveCallSummary;
  onClick?: () => void;
};

function ChannelRow({ channel, icon, active, muted, badge, activeCall, onClick }: ChannelRowProps) {
  const callLabel = activeCall
    ? activeCall.mode === 'screen'
      ? 'Live'
      : activeCall.participants.length || 'Call'
    : null;

  return (
    <Button
      type="button"
      className={cn(
        styles.channelRow,
        active && styles.channelRowActive,
        muted && styles.channelRowMuted,
      )}
      aria-current={active ? 'page' : undefined}
      aria-disabled={!onClick && muted ? true : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{channel.name}</span>
      {callLabel ? <span className={styles.liveBadge}>{callLabel}</span> : null}
      {badge?.mentions ? (
        <span className={styles.mentionBadge}>{badge.mentions}</span>
      ) : badge?.count ? (
        <span className={styles.unreadDot} aria-label={`${badge.count} unread messages`} />
      ) : null}
    </Button>
  );
}
