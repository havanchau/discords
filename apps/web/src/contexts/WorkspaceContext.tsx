import { createContext, useContext, ReactNode } from 'react';
import type { Channel, DirectConversation, ServerDetail, ServerSummary } from '@/api';
import type { ActiveDialog, ActivePanel } from '@/components/chat/types';

export interface WorkspaceContextValue {
  servers: ServerSummary[];
  /** Loaded DM conversations; read by the forward destination picker. */
  directConversations: DirectConversation[];
  server: ServerDetail | null;
  channel: Channel | null;
  activePanel: ActivePanel;
  activeDialog: ActiveDialog;
  workspaceError: string | null;
  workspaceNotice: string | null;
  pendingAction: string | null;
  openServer: (serverId: string) => Promise<void>;
  selectChannel: (channel: Channel) => void;
  setActivePanel: (panel: ActivePanel) => void;
  setActiveDialog: (dialog: ActiveDialog) => void;
  /**
   * Whether the channel is marked end-to-end encrypted (`Channel.isEncrypted`). The server stores
   * ciphertext only, so features that would store plaintext there are blocked on the client.
   */
  isChannelEncrypted: (channelId: string) => boolean;
  /** Saved Messages is reachable from the server rail and from a reminder notification. */
  openSavedMessages: () => void;
  /** Below desktop width these surfaces live in drawers (MobileNavDrawer, MemberListDrawer). */
  openMobileNav: () => void;
  openMemberList: () => void;
  clearWorkspaceError: () => void;
  clearWorkspaceNotice: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
  children: ReactNode;
  value: WorkspaceContextValue;
}

export function WorkspaceProvider({ children, value }: WorkspaceProviderProps) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
