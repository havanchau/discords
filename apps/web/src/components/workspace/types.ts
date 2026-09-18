import type { ChangeEvent, FormEvent, RefObject } from 'react';
import type { AuthState, Channel, ServerDetail, ServerSummary } from '@/api';
import type { ActiveCallSummary } from '@/helpers';
import type { ServerEventsState } from '@/hooks/useServerEvents';
import type { ActiveDialog } from '@/components/ChatPanel';

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
  createCategory: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  updateCategory: (
    categoryId: string,
    changes: { name: string; position: number },
  ) => Promise<boolean>;
  deleteCategory: (categoryId: string) => Promise<boolean>;
  createInvite: () => Promise<void>;
  updateProfileAvatar: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  logout: () => void;
  selectChannel: (channel: Channel) => void;
  setChannelQuery: (query: string) => void;
  setActiveDialog: (dialog: ActiveDialog) => void;
}

export interface WorkspaceSidebarProps {
  workspace: WorkspaceSidebarState;
  serverEvents: ServerEventsState;
  profileAvatarInputRef: RefObject<HTMLInputElement | null>;
  actions: WorkspaceSidebarActions;
}

export type ChannelCreateType = 'TEXT' | 'VOICE' | 'FORUM' | 'STAGE';
export type ServerAction = 'create' | 'join';
