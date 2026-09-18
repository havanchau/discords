import { useState, type FormEvent } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import type { ServerDetail } from '@/api';
import { Banner, Button, TextField } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from '@/components/SettingsModal.module.css';
import { formText } from '@/utils/formText';
import type { SettingsModalFields } from './types';

type ServerDangerZoneSectionProps = Pick<
  SettingsModalFields,
  'pendingAction' | 'setActiveDialog' | 'leaveServer' | 'transferOwnership' | 'deleteServer'
> & {
  server: ServerDetail;
  viewerId: string;
};

type OpenForm = 'leave' | 'transfer' | 'delete' | null;

/**
 * Leave for a member; transfer or delete for the owner, both behind the password (plus a 2FA code
 * when enabled) as in account deletion. The API enforces who may do which.
 */
export function ServerDangerZoneSection({
  server,
  viewerId,
  pendingAction,
  setActiveDialog,
  leaveServer,
  transferOwnership,
  deleteServer,
}: ServerDangerZoneSectionProps) {
  const t = useTranslation();
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = server.members.some(
    (member) => member.user.id === viewerId && member.kind === 'OWNER',
  );
  // Ownership goes to a person only; the API refuses bots and webhooks too.
  const transferTargets = server.members.filter(
    (member) => member.user.id !== viewerId && member.kind === 'MEMBER',
  );

  function toggleForm(form: OpenForm) {
    setError(null);
    setOpenForm((current) => (current === form ? null : form));
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = await transferOwnership(
      formText(form, 'userId'),
      formText(form, 'password'),
      formText(form, 'code').trim(),
    );
    setError(message);
    if (!message) setOpenForm(null);
  }

  async function submitDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    closeIfDone(await deleteServer(formText(form, 'password'), formText(form, 'code').trim()));
  }

  async function leave() {
    closeIfDone(await leaveServer());
  }

  /** The server is gone from this client after a leave or delete, so its settings close too. */
  function closeIfDone(message: string | null) {
    if (message) setError(message);
    else setActiveDialog(null);
  }

  const reauthFields = (
    <>
      <TextField
        name="password"
        type="password"
        label={t('account.field.currentPassword')}
        required
        autoComplete="current-password"
        hint={t('account.field.oauthPasswordHint')}
      />
      <TextField
        name="code"
        label={t('account.delete.field.code')}
        maxLength={9}
        pattern="\d{6}|[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}"
        autoComplete="one-time-code"
        hint={t('account.delete.field.codeHint')}
      />
    </>
  );

  return (
    <section className={styles.settingsSection} aria-labelledby="server-danger-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="server-danger-title">
          <TriangleAlert size={14} aria-hidden="true" /> {t('serverSettings.danger.title')}
        </strong>
        <span>
          {isOwner ? t('serverSettings.danger.ownerHint') : t('serverSettings.danger.memberHint')}
        </span>
      </div>

      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}

      {!isOwner && openForm === 'leave' ? (
        <>
          <Banner variant="danger">
            {t('serverSettings.danger.leaveConfirm', { server: server.name })}
          </Banner>
          <div className={styles.settingsModalFooter}>
            <Button type="button" variant="ghost" onClick={() => toggleForm(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pendingAction === 'server-leave'}
              onClick={() => void leave()}
            >
              {pendingAction === 'server-leave' ? (
                <Loader2 className="spin" size={14} aria-hidden="true" />
              ) : null}
              {t('serverSettings.danger.leave')}
            </Button>
          </div>
        </>
      ) : null}

      {!isOwner && !openForm ? (
        <Button type="button" variant="danger" onClick={() => toggleForm('leave')}>
          {t('serverSettings.danger.leave')}
        </Button>
      ) : null}

      {isOwner && openForm === 'transfer' ? (
        <form className={styles.settingsForm} onSubmit={(event) => void submitTransfer(event)}>
          <label>
            {t('serverSettings.danger.transferTarget')}
            <select name="userId" required defaultValue="">
              <option value="" disabled>
                {t('serverSettings.danger.transferTargetPlaceholder')}
              </option>
              {transferTargets.map((member) => (
                <option key={member.id} value={member.user.id}>
                  {member.nickname ?? member.user.displayName} (@{member.user.username})
                </option>
              ))}
            </select>
          </label>
          {reauthFields}
          <div className={styles.settingsModalFooter}>
            <Button type="button" variant="ghost" onClick={() => toggleForm(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pendingAction === 'server-transfer'}>
              {pendingAction === 'server-transfer' ? (
                <Loader2 className="spin" size={14} aria-hidden="true" />
              ) : null}
              {t('serverSettings.danger.transferConfirm')}
            </Button>
          </div>
        </form>
      ) : null}

      {isOwner && openForm === 'delete' ? (
        <form className={styles.settingsForm} onSubmit={(event) => void submitDelete(event)}>
          <Banner variant="danger">
            {t('serverSettings.danger.deleteWarning', { server: server.name })}
          </Banner>
          {reauthFields}
          <div className={styles.settingsModalFooter}>
            <Button type="button" variant="ghost" onClick={() => toggleForm(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="danger" disabled={pendingAction === 'server-delete'}>
              {pendingAction === 'server-delete' ? (
                <Loader2 className="spin" size={14} aria-hidden="true" />
              ) : null}
              {t('serverSettings.danger.deleteConfirm')}
            </Button>
          </div>
        </form>
      ) : null}

      {isOwner && !openForm ? (
        <div className={styles.settingsModalFooter}>
          <Button
            type="button"
            disabled={!transferTargets.length}
            onClick={() => toggleForm('transfer')}
          >
            {t('serverSettings.danger.transfer')}
          </Button>
          <Button type="button" variant="danger" onClick={() => toggleForm('delete')}>
            {t('serverSettings.danger.delete')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
