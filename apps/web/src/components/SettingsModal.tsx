import { ChannelSettings } from './settings/ChannelSettings';
import { MemberRolesSettings } from './settings/MemberRolesSettings';
import { ProfileSettings } from './settings/ProfileSettings';
import { RolesSettings } from './settings/RolesSettings';
import { ServerSettings } from './settings/ServerSettings';
import type { SettingsModalProps } from './settings/types';
import { DialogContent, DialogRoot } from './ui';

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
        className={`settings-modal ${activeDialog === 'roles' ? 'roles-modal' : ''}`}
        bodyClassName="settings-modal-body"
      >
        {activeDialog === 'profile' ? <ProfileSettings {...settingsProps} /> : null}
        {activeDialog === 'server-settings' ? <ServerSettings {...settingsProps} /> : null}
        {activeDialog === 'channel-settings' ? <ChannelSettings {...settingsProps} /> : null}
        {activeDialog === 'roles' ? <RolesSettings {...settingsProps} /> : null}
        {activeDialog === 'member-roles' ? <MemberRolesSettings {...settingsProps} /> : null}
      </DialogContent>
    </DialogRoot>
  );
}
