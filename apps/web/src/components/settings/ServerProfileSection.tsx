import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { assetUrl, type AuthState, type ServerDetail } from '../../api';
import { accentClass, initials } from '../../helpers';
import { useTranslation } from '../../i18n/LocaleProvider';
import { resolveMemberIdentity } from '../../utils/memberIdentity';
import { Avatar, Button, TextField } from '../ui';
import styles from '../SettingsModal.module.css';

interface ServerProfileSectionProps {
  auth: AuthState;
  server: ServerDetail | null;
  pendingAction: string | null;
  updateServerProfile: (changes: {
    nickname?: string | null;
    avatarUrl?: string | null;
  }) => Promise<void>;
  updateServerProfileAvatar: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export function ServerProfileSection({
  auth,
  server,
  pendingAction,
  updateServerProfile,
  updateServerProfileAvatar,
}: ServerProfileSectionProps) {
  const t = useTranslation();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const membership = server?.members.find((member) => member.user.id === auth.user.id) ?? null;
  const [nickname, setNickname] = useState(membership?.nickname ?? '');

  // The section only makes sense while a server is selected and the viewer is a member of it.
  if (!server || !membership) return null;

  const identity = resolveMemberIdentity(auth.user, membership);
  const isPending = pendingAction === 'server-profile';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void updateServerProfile({ nickname });
  }

  return (
    <form className={styles.settingsSection} onSubmit={submit}>
      <div className={styles.settingsSectionHeading}>
        <strong>{t('serverProfile.title')}</strong>
        <span>{t('serverProfile.hint', { server: server.name })}</span>
      </div>
      <div className={styles.settingsAvatarRow}>
        <Avatar
          src={identity.avatarUrl ? assetUrl(identity.avatarUrl) : null}
          alt={identity.displayName}
          fallback={initials(identity.displayName)}
          size="lg"
          className={accentClass(auth.user.id)}
        />
        <input
          ref={avatarInputRef}
          className={styles.hiddenInput}
          type="file"
          accept="image/*"
          aria-label={t('serverProfile.changeAvatar')}
          onChange={(event) => void updateServerProfileAvatar(event)}
        />
        <Button
          type="button"
          variant="secondary"
          fullWidth
          disabled={isPending}
          onClick={() => avatarInputRef.current?.click()}
        >
          {t('serverProfile.changeAvatar')}
        </Button>
        {membership.avatarUrl ? (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => void updateServerProfile({ avatarUrl: null })}
          >
            {t('serverProfile.resetAvatar')}
          </Button>
        ) : null}
      </div>
      <TextField
        label={t('serverProfile.field.nickname')}
        value={nickname}
        maxLength={40}
        placeholder={auth.user.displayName}
        onChange={(event) => setNickname(event.target.value)}
      />
      <Button type="submit" disabled={isPending}>
        {t('serverProfile.save')}
      </Button>
    </form>
  );
}
