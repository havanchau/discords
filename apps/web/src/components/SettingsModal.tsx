import { lazy, Suspense } from 'react';
import type { SettingsModalProps } from './settings/types';
import { DialogContent, DialogRoot, Skeleton } from './ui';
import { cn } from '../utils/cn';
import styles from './SettingsModal.module.css';

// Panels load on first open; the dialog shell stays in the main bundle so open/close is instant.
const ProfileSettings = lazy(() =>
  import('./settings/ProfileSettings').then((module) => ({ default: module.ProfileSettings })),
);
const ServerSettings = lazy(() =>
  import('./settings/ServerSettings').then((module) => ({ default: module.ServerSettings })),
);
const ChannelSettings = lazy(() =>
  import('./settings/ChannelSettings').then((module) => ({ default: module.ChannelSettings })),
);
const RolesSettings = lazy(() =>
  import('./settings/RolesSettings').then((module) => ({ default: module.RolesSettings })),
);
const MemberRolesSettings = lazy(() =>
  import('./settings/MemberRolesSettings').then((module) => ({
    default: module.MemberRolesSettings,
  })),
);

function SettingsPanelFallback() {
  return (
    <div className={styles.panelLoading} role="status" aria-label="Loading settings">
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
}

function getSettingsTitle(activeDialog: SettingsModalProps['dialog']['activeDialog']) {
  if (activeDialog === 'profile') return 'Edit profile';
  if (activeDialog === 'server-settings') return 'Server settings';
  if (activeDialog === 'channel-settings') return 'Channel settings';
  if (activeDialog === 'roles') return 'Roles';
  return 'Member roles';
}

export function SettingsModal(props: SettingsModalProps) {
  const { dialog } = props;
  const { activeDialog, setActiveDialog } = dialog;
  const settingsProps = {
    ...dialog,
    ...props.data,
    ...props.refs,
    ...props.theme,
    ...props.actions,
  };

  return (
    <DialogRoot
      open={Boolean(activeDialog)}
      onOpenChange={(open) => !open && setActiveDialog(null)}
    >
      <DialogContent
        title={getSettingsTitle(activeDialog)}
        description="Tune profile, server, channel, role, and notification preferences."
        className={cn(styles.settingsModal, activeDialog === 'roles' && styles.rolesModal)}
        bodyClassName={styles.settingsModalBody}
      >
        <Suspense fallback={<SettingsPanelFallback />}>
          {activeDialog === 'profile' ? <ProfileSettings {...settingsProps} /> : null}
          {activeDialog === 'server-settings' ? <ServerSettings {...settingsProps} /> : null}
          {activeDialog === 'channel-settings' ? <ChannelSettings {...settingsProps} /> : null}
          {activeDialog === 'roles' ? <RolesSettings {...settingsProps} /> : null}
          {activeDialog === 'member-roles' ? <MemberRolesSettings {...settingsProps} /> : null}
        </Suspense>
      </DialogContent>
    </DialogRoot>
  );
}
