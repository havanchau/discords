import { useState } from 'react';
import { ChannelSidebar } from './workspace/ChannelSidebar';
import { ServerRail } from './workspace/ServerRail';
import { WorkspaceDialogs } from './workspace/WorkspaceDialogs';
import type { ChannelCreateType, ServerAction, WorkspaceSidebarProps } from './workspace/types';

export type {
  ChannelBadgeState,
  WorkspaceSidebarActions,
  WorkspaceSidebarProps,
  WorkspaceSidebarState,
} from './workspace/types';

/**
 * Composes the two navigation surfaces and the dialogs they open. The dialog open-state is the
 * only thing both surfaces share, so it lives here rather than in either one.
 */
export function WorkspaceSidebar({ workspace, profileAvatarInputRef, actions }: WorkspaceSidebarProps) {
  const [serverAction, setServerAction] = useState<ServerAction | null>(null);
  const [channelCreateType, setChannelCreateType] = useState<ChannelCreateType | null>(null);

  return (
    <>
      <ServerRail
        servers={workspace.servers}
        server={workspace.server}
        openHome={actions.openHome}
        openServer={actions.openServer}
        onAddServer={() => setServerAction('create')}
      />

      <ChannelSidebar
        workspace={workspace}
        profileAvatarInputRef={profileAvatarInputRef}
        actions={actions}
        onCreateChannel={setChannelCreateType}
      />

      <WorkspaceDialogs
        serverAction={serverAction}
        setServerAction={setServerAction}
        channelCreateType={channelCreateType}
        setChannelCreateType={setChannelCreateType}
        pendingAction={workspace.pendingAction}
        createServer={actions.createServer}
        joinInvite={actions.joinInvite}
        createChannel={actions.createChannel}
      />
    </>
  );
}
