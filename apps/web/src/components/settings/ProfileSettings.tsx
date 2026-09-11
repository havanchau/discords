import { assetUrl } from '../../api';
import { accentClass, initials } from '../../helpers';
import { Button, TextArea, TextField } from '../ui';
import { SettingsSelect } from './SettingsSelect';
import { SwitchRow } from './SettingsRows';
import type { SettingsModalFields, SettingsSelectOption, UiTheme } from './types';
import styles from '../SettingsModal.module.css';
import { cn } from '../../utils/cn';

const STATUS_OPTIONS: SettingsSelectOption<'ONLINE' | 'IDLE' | 'DND' | 'INVISIBLE'>[] = [
  { value: 'ONLINE', label: 'Online' },
  { value: 'IDLE', label: 'Idle' },
  { value: 'DND', label: 'Do Not Disturb' },
  { value: 'INVISIBLE', label: 'Invisible' },
];

const THEME_OPTIONS: SettingsSelectOption<UiTheme>[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type ProfileSettingsProps = Pick<
  SettingsModalFields,
  | 'auth'
  | 'notificationPreferences'
  | 'pendingAction'
  | 'profileAvatarInputRef'
  | 'setActiveDialog'
  | 'setUiTheme'
  | 'uiTheme'
  | 'updateNotificationPreference'
  | 'updateProfile'
>;

export function ProfileSettings({
  auth,
  notificationPreferences,
  pendingAction,
  profileAvatarInputRef,
  setActiveDialog,
  setUiTheme,
  uiTheme,
  updateNotificationPreference,
  updateProfile,
}: ProfileSettingsProps) {
  const globalNotificationPreference = notificationPreferences.find(
    (preference) => !preference.serverId && !preference.channelId,
  );

  return (
    <form className={styles.settingsForm} onSubmit={updateProfile}>
      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>Profile</strong>
          <span>How other members see you across servers.</span>
        </div>
        <div className={styles.settingsAvatarRow}>
          <Button
            type="button"
            variant="ghost"
            className={cn('avatar-button', styles.modalAvatar)}
            onClick={() => profileAvatarInputRef.current?.click()}
          >
            {auth.user.avatarUrl ? (
              <img src={assetUrl(auth.user.avatarUrl)} alt={auth.user.displayName} />
            ) : (
              <span className={`avatar ${accentClass(auth.user.id)}`}>
                {initials(auth.user.displayName)}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => profileAvatarInputRef.current?.click()}
          >
            Change avatar
          </Button>
        </div>
        <TextField
          label="Display name"
          name="displayName"
          defaultValue={auth.user.displayName}
          maxLength={64}
          required
        />
        <TextArea
          label="Bio"
          name="bio"
          defaultValue={auth.user.bio ?? ''}
          maxLength={280}
          placeholder="Short profile note"
        />
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>Account</strong>
          <span>Identity and presence controls.</span>
        </div>
        <div className={styles.settingsGrid}>
          <TextField
            label="Username"
            value={auth.user.username}
            readOnly
            className={styles.readonlyInput}
          />
          <TextField
            label="Email"
            value={auth.user.email}
            readOnly
            className={styles.readonlyInput}
          />
        </div>
        <SettingsSelect
          name="status"
          label="Status"
          defaultValue={auth.user.status ?? 'ONLINE'}
          options={STATUS_OPTIONS}
        />
        <SettingsSelect
          name="uiTheme"
          label="App theme"
          defaultValue={uiTheme}
          options={THEME_OPTIONS}
          onValueChange={setUiTheme}
        />
        <div className={styles.profilePreview}>
          <div className={`avatar small ${accentClass(auth.user.id)}`}>
            {auth.user.avatarUrl ? (
              <img src={assetUrl(auth.user.avatarUrl)} alt={auth.user.displayName} />
            ) : (
              initials(auth.user.displayName)
            )}
          </div>
          <div>
            <strong>{auth.user.displayName}</strong>
            <span>@{auth.user.username}</span>
          </div>
        </div>
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>Notifications</strong>
          <span>Global delivery preferences for this browser session.</span>
        </div>
        <SwitchRow
          title="Mute notifications"
          description="Keep unread badges, but silence non-critical notifications."
          checked={Boolean(globalNotificationPreference?.muted)}
          disabled={pendingAction === 'notification-preference'}
          onCheckedChange={(checked) =>
            void updateNotificationPreference({
              serverId: null,
              channelId: null,
              muted: checked,
              mentionOnly: Boolean(globalNotificationPreference?.mentionOnly),
              desktopEnabled: Boolean(globalNotificationPreference?.desktopEnabled),
            })
          }
        />
        <SwitchRow
          title="Mentions only"
          description="Only surface notifications that mention you directly."
          checked={Boolean(globalNotificationPreference?.mentionOnly)}
          disabled={pendingAction === 'notification-preference'}
          onCheckedChange={(checked) =>
            void updateNotificationPreference({
              serverId: null,
              channelId: null,
              muted: Boolean(globalNotificationPreference?.muted),
              mentionOnly: checked,
              desktopEnabled: Boolean(globalNotificationPreference?.desktopEnabled),
            })
          }
        />
        <SwitchRow
          title="Desktop notifications"
          description="Store consent preference for future browser notifications."
          checked={Boolean(globalNotificationPreference?.desktopEnabled)}
          disabled={pendingAction === 'notification-preference'}
          onCheckedChange={(checked) =>
            void updateNotificationPreference({
              serverId: null,
              channelId: null,
              muted: Boolean(globalNotificationPreference?.muted),
              mentionOnly: Boolean(globalNotificationPreference?.mentionOnly),
              desktopEnabled: checked,
            })
          }
        />
      </section>
      <footer className={styles.settingsModalFooter}>
        <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pendingAction === 'profile-update'}>
          Save changes
        </Button>
      </footer>
    </form>
  );
}
