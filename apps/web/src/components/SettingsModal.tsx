import { lazy, Suspense } from 'react';
import type { SettingsModalProps } from './settings/types';
import { ServerProfileSection } from './settings/ServerProfileSection';
import { DialogContent, DialogRoot, Skeleton } from './ui';
import { useTranslation, type Translate } from '../i18n/LocaleProvider';
import { cn } from '../utils/cn';
import styles from './SettingsModal.module.css';

// Panels load on first open; the dialog shell stays in the main bundle so open/close is instant.
const ProfileSettings = lazy(() =>
  import('./settings/ProfileSettings').then((module) => ({ default: module.ProfileSettings })),
);
const AccountSecuritySettings = lazy(() =>
  import('./settings/AccountSecuritySettings').then((module) => ({
    default: module.AccountSecuritySettings,
  })),
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
  const t = useTranslation();

  return (
    <div className={styles.panelLoading} role="status" aria-label={t('settings.loading')}>
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
}

function getSettingsTitle(
  t: Translate,
  activeDialog: SettingsModalProps['dialog']['activeDialog'],
) {
  if (activeDialog === 'profile') return t('settings.title.profile');
  if (activeDialog === 'server-settings') return t('settings.title.server');
  if (activeDialog === 'channel-settings') return t('settings.title.channel');
  if (activeDialog === 'roles') return t('settings.title.roles');
  return t('settings.title.memberRoles');
}

export function SettingsModal(props: SettingsModalProps) {
  const t = useTranslation();
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
        title={getSettingsTitle(t, activeDialog)}
        description={t('settings.description')}
        className={cn(styles.settingsModal, activeDialog === 'roles' && styles.rolesModal)}
        bodyClassName={styles.settingsModalBody}
      >
        <Suspense fallback={<SettingsPanelFallback />}>
          {activeDialog === 'profile' ? (
            <>
              <ProfileSettings {...settingsProps} />
              <ServerProfileSection
                auth={settingsProps.auth}
                server={settingsProps.server}
                pendingAction={settingsProps.pendingAction}
                updateServerProfile={settingsProps.updateServerProfile}
                updateServerProfileAvatar={settingsProps.updateServerProfileAvatar}
              />
              <AccountSecuritySettings {...settingsProps} />
            </>
          ) : null}
          {activeDialog === 'server-settings' ? <ServerSettings {...settingsProps} /> : null}
          {activeDialog === 'channel-settings' ? <ChannelSettings {...settingsProps} /> : null}
          {activeDialog === 'roles' ? <RolesSettings {...settingsProps} /> : null}
          {activeDialog === 'member-roles' ? <MemberRolesSettings {...settingsProps} /> : null}
        </Suspense>
      </DialogContent>
    </DialogRoot>
  );
}
