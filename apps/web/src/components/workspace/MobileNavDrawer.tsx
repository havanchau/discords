import { DialogContent, DialogRoot } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import { WorkspaceSidebar } from '@/components/WorkspaceSidebar';
import type { WorkspaceSidebarProps } from './types';
import styles from './MobileNavDrawer.module.css';

interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: WorkspaceSidebarProps;
}

/**
 * Under 720px `ChannelSidebar` hides itself and the server rail is the only way in; this drawer
 * (server rail + channel sidebar, including the user panel) is the mobile replacement, opened from
 * the chat header's menu button. It reuses `WorkspaceSidebar` as-is and only wraps the navigation
 * actions so picking a channel, a server or signing out also closes the drawer.
 */
export function MobileNavDrawer({ open, onOpenChange, workspace }: MobileNavDrawerProps) {
  const t = useTranslation();

  const actions: WorkspaceSidebarProps['actions'] = {
    ...workspace.actions,
    selectChannel: (channel) => {
      workspace.actions.selectChannel(channel);
      onOpenChange(false);
    },
    openServer: async (serverId) => {
      await workspace.actions.openServer(serverId);
      onOpenChange(false);
    },
    openHome: () => {
      workspace.actions.openHome();
      onOpenChange(false);
    },
    logout: () => {
      workspace.actions.logout();
      onOpenChange(false);
    },
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('sidebar.menu.title')}
        className={styles.drawer}
        bodyClassName={styles.drawerBody}
      >
        <WorkspaceSidebar {...workspace} actions={actions} />
      </DialogContent>
    </DialogRoot>
  );
}
