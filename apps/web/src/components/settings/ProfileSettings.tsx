import type { Locale } from '@discord-clone/shared';
import { assetUrl } from '@/api';
import { accentClass, initials } from '@/helpers';
import { useLocale, type MessageKey, type Translate } from '@/i18n/LocaleProvider';
import { Button, TextArea, TextField } from '@/components/ui';
import { SettingsSelect } from './SettingsSelect';
import { SwitchRow } from './SettingsRows';
import type { SettingsModalFields, SettingsSelectOption, UiTheme } from './types';
import styles from '@/components/SettingsModal.module.css';
import { cn } from '@/utils/cn';

function statusOptions(
  t: Translate,
): SettingsSelectOption<'ONLINE' | 'IDLE' | 'DND' | 'INVISIBLE'>[] {
  return [
    { value: 'ONLINE', label: t('profile.status.online') },
    { value: 'IDLE', label: t('profile.status.idle') },
    { value: 'DND', label: t('profile.status.dnd') },
    { value: 'INVISIBLE', label: t('profile.status.invisible') },
  ];
}

function themeOptions(t: Translate): SettingsSelectOption<UiTheme>[] {
  return [
    { value: 'system', label: t('profile.theme.system') },
    { value: 'light', label: t('profile.theme.light') },
    { value: 'dark', label: t('profile.theme.dark') },
  ];
}

// Each language is written in itself, so someone stuck in the wrong one can still find their own.
const LANGUAGE_OPTIONS: SettingsSelectOption<Locale>[] = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
];

const EXPIRY_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: 'keep', labelKey: 'profile.expiry.keep' },
  { value: 'never', labelKey: 'profile.expiry.never' },
  { value: '30m', labelKey: 'profile.expiry.30m' },
  { value: '1h', labelKey: 'profile.expiry.1h' },
  { value: '4h', labelKey: 'profile.expiry.4h' },
  { value: 'today', labelKey: 'profile.expiry.today' },
];

type ProfileSettingsProps = Pick<
  SettingsModalFields,
  | 'auth'
  | 'notificationPreferences'
  | 'pendingAction'
  | 'profileAvatarInputRef'
  | 'profileBannerInputRef'
  | 'setActiveDialog'
  | 'setUiTheme'
  | 'uiTheme'
  | 'updateNotificationPreference'
  | 'updateProfile'
  | 'updateProfileBanner'
>;

export function ProfileSettings({
  auth,
  notificationPreferences,
  pendingAction,
  profileAvatarInputRef,
  profileBannerInputRef,
  setActiveDialog,
  setUiTheme,
  uiTheme,
  updateNotificationPreference,
  updateProfile,
  updateProfileBanner,
}: ProfileSettingsProps) {
  const { locale, t } = useLocale();
  const globalNotificationPreference = notificationPreferences.find(
    (preference) => !preference.serverId && !preference.channelId,
  );

  return (
    <form className={styles.settingsForm} onSubmit={(event) => void updateProfile(event)}>
      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('profile.section.profile')}</strong>
          <span>{t('profile.section.profileHint')}</span>
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
            {t('profile.changeAvatar')}
          </Button>
        </div>
        <TextField
          label={t('profile.field.displayName')}
          name="displayName"
          defaultValue={auth.user.displayName}
          maxLength={64}
          required
        />
        <TextArea
          label={t('profile.field.bio')}
          name="bio"
          defaultValue={auth.user.bio ?? ''}
          maxLength={280}
          placeholder={t('profile.field.bioPlaceholder')}
        />
        <TextField
          label={t('profile.field.pronouns')}
          name="pronouns"
          defaultValue={auth.user.pronouns ?? ''}
          maxLength={40}
          placeholder={t('profile.field.pronounsPlaceholder')}
        />
        <input
          ref={profileBannerInputRef}
          className={styles.hiddenInput}
          type="file"
          accept="image/*"
          aria-label={t('profile.changeBanner')}
          onChange={(event) => void updateProfileBanner(event)}
        />
        <div className={styles.settingsButtonRow}>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={pendingAction === 'profile-banner'}
            onClick={() => profileBannerInputRef.current?.click()}
          >
            {t('profile.changeBanner')}
          </Button>
        </div>
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('profile.section.customStatus')}</strong>
          <span>{t('profile.section.customStatusHint')}</span>
        </div>
        <div className={styles.settingsGrid}>
          <TextField
            label={t('profile.field.customStatusText')}
            name="customStatusText"
            defaultValue={auth.user.customStatus?.text ?? ''}
            maxLength={128}
            placeholder={t('profile.field.customStatusTextPlaceholder')}
          />
          <TextField
            label={t('profile.field.customStatusEmoji')}
            name="customStatusEmoji"
            defaultValue={auth.user.customStatus?.emoji ?? ''}
            maxLength={64}
          />
        </div>
        <SettingsSelect
          name="customStatusExpiry"
          label={t('profile.field.customStatusExpiry')}
          defaultValue={
            auth.user.customStatus?.text || auth.user.customStatus?.emoji ? 'keep' : 'never'
          }
          options={EXPIRY_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
        />
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('profile.section.account')}</strong>
          <span>{t('profile.section.accountHint')}</span>
        </div>
        <div className={styles.settingsGrid}>
          <TextField
            label={t('profile.field.username')}
            value={auth.user.username}
            readOnly
            className={styles.readonlyInput}
          />
          <TextField
            label={t('profile.field.email')}
            value={auth.user.email}
            readOnly
            className={styles.readonlyInput}
          />
        </div>
        <SettingsSelect
          name="status"
          label={t('profile.field.status')}
          defaultValue={auth.user.status ?? 'ONLINE'}
          options={statusOptions(t)}
        />
        <SettingsSelect
          name="uiTheme"
          label={t('profile.field.theme')}
          defaultValue={uiTheme}
          options={themeOptions(t)}
          onValueChange={setUiTheme}
        />
        <SettingsSelect
          name="locale"
          label={t('profile.field.language')}
          defaultValue={locale}
          options={LANGUAGE_OPTIONS}
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
          <strong>{t('profile.section.notifications')}</strong>
          <span>{t('profile.section.notificationsHint')}</span>
        </div>
        <SwitchRow
          title={t('profile.notifications.mute')}
          description={t('profile.notifications.muteHint')}
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
          title={t('profile.notifications.mentionsOnly')}
          description={t('profile.notifications.mentionsOnlyHint')}
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
          title={t('profile.notifications.desktop')}
          description={t('profile.notifications.desktopHint')}
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
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pendingAction === 'profile-update'}>
          {t('common.saveChanges')}
        </Button>
      </footer>
    </form>
  );
}
