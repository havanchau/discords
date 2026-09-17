import { useState } from 'react';
import { ChannelSidebar } from './workspace/ChannelSidebar';
import { ServerRail } from './workspace/ServerRail';
import { ServerEventsDialog } from './events/ServerEventsDialog';
import { EditCategoryDialog } from './workspace/EditCategoryDialog';
import { memberHasServerPermission } from '@/utils/serverPermissions';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { WorkspaceDialogs } from './workspace/WorkspaceDialogs';
import type { ChannelCategory } from '@/api';
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
export function WorkspaceSidebar({
  workspace,
  serverEvents,
  profileAvatarInputRef,
  actions,
}: WorkspaceSidebarProps) {
  const [serverAction, setServerAction] = useState<ServerAction | null>(null);
  const [channelCreateType, setChannelCreateType] = useState<ChannelCreateType | null>(null);
  const [channelCreateCategoryId, setChannelCreateCategoryId] = useState<string | null>(null);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ChannelCategory | null>(null);
  const [isEventsOpen, setIsEventsOpen] = useState(false);
  const { server } = workspace;
  const { openSavedMessages } = useWorkspace();

  return (
    <>
      <ServerRail
        servers={workspace.servers}
        server={workspace.server}
        openHome={actions.openHome}
        openServer={actions.openServer}
        onAddServer={() => setServerAction('create')}
        onOpenSavedMessages={openSavedMessages}
      />

      <ChannelSidebar
        workspace={workspace}
        serverEvents={serverEvents}
        onOpenEvents={() => setIsEventsOpen(true)}
        profileAvatarInputRef={profileAvatarInputRef}
        actions={actions}
        onCreateChannel={(type, categoryId) => {
          setChannelCreateCategoryId(categoryId ?? null);
          setChannelCreateType(type);
        }}
        onCreateCategory={() => setIsCreateCategoryOpen(true)}
        onEditCategory={setEditingCategory}
      />

      {server ? (
        <ServerEventsDialog
          open={isEventsOpen}
          server={server}
          canManage={memberHasServerPermission(server, workspace.auth.user.id, 'MANAGE_SERVER')}
          serverEvents={serverEvents}
          onOpenChange={setIsEventsOpen}
        />
      ) : null}

      <EditCategoryDialog
        category={editingCategory}
        pendingAction={workspace.pendingAction}
        onClose={() => setEditingCategory(null)}
        onSave={actions.updateCategory}
        onDelete={actions.deleteCategory}
      />

      <WorkspaceDialogs
        serverAction={serverAction}
        setServerAction={setServerAction}
        channelCreateType={channelCreateType}
        channelCreateCategoryId={channelCreateCategoryId}
        setChannelCreateType={setChannelCreateType}
        isCreateCategoryOpen={isCreateCategoryOpen}
        setIsCreateCategoryOpen={setIsCreateCategoryOpen}
        createCategory={actions.createCategory}
        pendingAction={workspace.pendingAction}
        createServer={actions.createServer}
        joinInvite={actions.joinInvite}
        createChannel={actions.createChannel}
      />
    </>
  );
}
