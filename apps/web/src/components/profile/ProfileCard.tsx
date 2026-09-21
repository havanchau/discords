import { Loader2, MessageSquare, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '@/api';
import { accentClass, initials } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { useUserNote } from '@/hooks/useUserNote';
import { useUserProfile } from '@/hooks/useUserProfile';
import { profileIdentityOf } from '@/utils/memberIdentity';
import { ReactionEmoji } from '@/components/chat/EmojiPicker';
import { Avatar, Button, TextArea } from '@/components/ui';
import styles from './ProfileCard.module.css';

const NOTE_MAX_LENGTH = 300;

interface ProfileCardProps {
  accessToken: string;
  userId: string;
  viewerId: string;
  /** Scopes the card to one server so it shows that server's nickname, avatar, and roles. */
  serverId?: string | null;
  /** The popover mounts its content before opening; nothing is fetched until this is true. */
  isOpen: boolean;
  onDirectMessage?: (userId: string) => void;
  /** The friends API is keyed on username or email, not on the user id. */
  onAddFriend?: (usernameOrEmail: string) => void;
}

export function ProfileCard({
  accessToken,
  userId,
  viewerId,
  serverId,
  isOpen,
  onDirectMessage,
  onAddFriend,
}: ProfileCardProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const { profile, isLoading, error } = useUserProfile({
    accessToken,
    userId,
    serverId,
    enabled: isOpen,
  });

  if (isLoading && !profile) {
    return (
      <div className={styles.state} role="status">
        <Loader2 className="spin" size={16} aria-hidden="true" /> {t('profileCard.loading')}
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={styles.state} role="alert">
        {error ?? t('profileCard.unavailable')}
      </div>
    );
  }

  const identity = profileIdentityOf(profile, profile.server);
  const roles = (profile.server?.roles ?? []).filter((role) => role.name !== '@everyone');
  const isSelf = profile.id === viewerId;
  // The account name is always shown when a server nickname replaces it, so a nickname cannot be
  // used to pass as someone else.
  const showsAccountName = identity.displayName !== profile.displayName;

  return (
    <div className={styles.card}>
      <div
        className={styles.banner}
        style={
          profile.bannerUrl ? { backgroundImage: `url(${assetUrl(profile.bannerUrl)})` } : undefined
        }
      />
      <div className={styles.body}>
        <Avatar
          src={identity.avatarUrl ? assetUrl(identity.avatarUrl) : null}
          alt={identity.displayName}
          fallback={initials(identity.displayName)}
          size="lg"
          className={`${styles.avatar} ${accentClass(profile.id)}`}
        />
        <strong className={styles.displayName}>{identity.displayName}</strong>
        <span className={styles.username}>@{profile.username}</span>
        {showsAccountName ? <span className={styles.username}>{profile.displayName}</span> : null}
        {profile.pronouns ? <span className={styles.pronouns}>{profile.pronouns}</span> : null}

        {profile.customStatus ? (
          <span className={styles.customStatus}>
            {profile.customStatus.emoji ? (
              <ReactionEmoji emoji={profile.customStatus.emoji} />
            ) : null}
            {profile.customStatus.text}
          </span>
        ) : null}

        {profile.bio ? <p className={styles.about}>{profile.bio}</p> : null}

        {roles.length ? (
          <>
            <span className={styles.sectionLabel}>{t('profileCard.roles')}</span>
            <div className={styles.roleChips}>
              {roles.slice(0, 6).map((role) => (
                <small
                  key={role.id}
                  className={styles.roleChip}
                  style={role.color ? { color: role.color } : undefined}
                >
                  {role.name}
                </small>
              ))}
            </div>
          </>
        ) : null}

        <div className={styles.dates}>
          <span>{t('profileCard.memberSince', { date: dates.absolute(profile.createdAt) })}</span>
          {profile.server ? (
            <span>
              {t('profileCard.joinedServer', { date: dates.absolute(profile.server.joinedAt) })}
            </span>
          ) : null}
        </div>

        {!isSelf ? (
          <ProfileNoteField accessToken={accessToken} viewerId={viewerId} userId={profile.id} />
        ) : null}

        {!isSelf && (onDirectMessage || onAddFriend) ? (
          <div className={styles.actions}>
            {onDirectMessage ? (
              <Button type="button" size="sm" fullWidth onClick={() => onDirectMessage(profile.id)}>
                <MessageSquare size={14} aria-hidden="true" />
                {t('profileCard.message')}
              </Button>
            ) : null}
            {onAddFriend ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                fullWidth
                onClick={() => onAddFriend(profile.username)}
              >
                <UserPlus size={14} aria-hidden="true" />
                {t('profileCard.addFriend')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ProfileNoteFieldProps {
  accessToken: string;
  viewerId: string;
  userId: string;
}

/** The viewer's private note about this user, saved on blur (docs/features/user-notes.md). */
function ProfileNoteField({ accessToken, viewerId, userId }: ProfileNoteFieldProps) {
  const t = useTranslation();
  const { note, isLoading, loadError, save, isSaving } = useUserNote({
    accessToken,
    viewerId,
    userId,
    enabled: true,
  });
  // `null` while untouched, so the field shows the stored note once it arrives.
  const [draft, setDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const savedContent = note?.content ?? '';

  async function commit() {
    if (draft === null || draft.trim() === savedContent) return;
    setSaveError(null);
    try {
      await save(draft.trim());
      setDraft(null);
      setIsSaved(true);
    } catch (error) {
      // The draft is kept so the text is not lost; the next blur retries.
      setSaveError(error instanceof Error ? error.message : t('profileCard.note.saveFailed'));
    }
  }

  const status = isSaving
    ? t('profileCard.note.saving')
    : isSaved
      ? t('profileCard.note.saved')
      : t('profileCard.note.hint');

  return (
    <TextArea
      label={t('profileCard.note.label')}
      placeholder={isLoading ? t('profileCard.note.loading') : t('profileCard.note.placeholder')}
      value={draft ?? savedContent}
      maxLength={NOTE_MAX_LENGTH}
      rows={2}
      disabled={isLoading || Boolean(loadError)}
      error={loadError ?? saveError}
      hint={status}
      fieldClassName={styles.note}
      onChange={(event) => {
        setDraft(event.target.value);
        setIsSaved(false);
      }}
      onBlur={() => void commit()}
    />
  );
}
