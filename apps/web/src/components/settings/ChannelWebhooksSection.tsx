import { useRef, useState, type FormEvent } from 'react';
import { Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { WEBHOOK_MAX_PER_CHANNEL, WEBHOOK_NAME_MAX_LENGTH } from '@discord-clone/shared';
import { assetUrl, type ChannelWebhook } from '@/api';
import { Avatar, Button, IconButton, TextField } from '@/components/ui';
import { useChannelWebhooks } from '@/hooks/useChannelWebhooks';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { initials } from '@/helpers';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ChannelWebhooksSection.module.css';

const AVATAR_MIME_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];

type PendingConfirm = { webhookId: string; action: 'regenerate' | 'delete' } | null;

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Incoming webhooks of one text channel. It sits inside the channel settings form but saves on its
 * own, so its buttons never submit that form. A new URL is shown once, then only its name remains.
 */
export function ChannelWebhooksSection({
  serverId,
  channelId,
}: {
  serverId: string;
  channelId: string;
}) {
  const t = useTranslation();
  const dates = useDateFormat();
  const hooks = useChannelWebhooks(serverId, channelId);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [secretUrl, setSecretUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [error, setError] = useState<string | null>(null);
  const isFull = hooks.webhooks.length >= WEBHOOK_MAX_PER_CHANNEL;

  async function create(event?: FormEvent) {
    event?.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      setSecretUrl(await hooks.createWebhook(name.trim(), avatar));
      setName('');
      setAvatar(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    } catch (err) {
      setError(errorText(err, t('error.fallback.cannot-create-webhook')));
    }
  }

  async function runConfirmed(webhook: ChannelWebhook) {
    if (!confirm) return;
    setConfirm(null);
    setError(null);
    try {
      if (confirm.action === 'regenerate') {
        setSecretUrl(await hooks.regenerateWebhook(webhook.id));
      } else {
        await hooks.deleteWebhook(webhook.id);
      }
    } catch (err) {
      setError(
        errorText(
          err,
          confirm.action === 'regenerate'
            ? t('error.fallback.cannot-regenerate-webhook')
            : t('error.fallback.cannot-delete-webhook'),
        ),
      );
    }
  }

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="channel-webhooks-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="channel-webhooks-title">
          {t('webhook.section.title', {
            count: hooks.webhooks.length,
            max: WEBHOOK_MAX_PER_CHANNEL,
          })}
        </strong>
        <span>{t('webhook.section.hint')}</span>
      </div>

      <div className={styles.createRow}>
        <TextField
          fieldClassName={styles.name}
          label={t('webhook.field.name')}
          value={name}
          maxLength={WEBHOOK_NAME_MAX_LENGTH}
          disabled={isFull}
          onChange={(event) => setName(event.target.value)}
          // Enter would submit the surrounding channel settings form.
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void create();
          }}
        />
        <input
          ref={avatarInputRef}
          className={settingsStyles.hiddenInput}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          aria-label={t('webhook.field.avatar')}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            if (selected && !AVATAR_MIME_TYPES.includes(selected.type)) {
              setError(t('webhook.error.avatarType'));
              setAvatar(null);
              return;
            }
            setAvatar(selected);
          }}
        />
        <Button
          variant="secondary"
          disabled={isFull}
          onClick={() => avatarInputRef.current?.click()}
        >
          {avatar ? avatar.name : t('webhook.action.chooseAvatar')}
        </Button>
        <Button disabled={isFull || !name.trim() || hooks.isBusy} onClick={() => void create()}>
          {hooks.isBusy ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('webhook.action.create')}
        </Button>
      </div>

      {secretUrl ? (
        <div className={settingsStyles.recoveryCodes} role="status">
          <strong>{t('webhook.secret.warning')}</strong>
          <TextField
            label={t('webhook.secret.urlLabel')}
            value={secretUrl}
            readOnly
            className={settingsStyles.readonlyInput}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(secretUrl)}
            >
              <Copy size={14} aria-hidden="true" />
              {t('webhook.action.copyUrl')}
            </Button>
            <Button size="sm" onClick={() => setSecretUrl(null)}>
              {t('webhook.action.dismiss')}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}

      <div className={settingsStyles.inviteList}>
        {hooks.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('webhook.loading')}
          </p>
        ) : hooks.error ? (
          <p className="empty-note" role="alert">
            {errorText(hooks.error, t('error.fallback.cannot-load-webhooks'))}
          </p>
        ) : hooks.webhooks.length ? (
          hooks.webhooks.map((webhook) => {
            const pending = confirm?.webhookId === webhook.id ? confirm : null;
            return (
              <div className={settingsStyles.inviteRow} key={webhook.id}>
                <span className={styles.identity}>
                  <Avatar
                    size="sm"
                    src={webhook.avatarUrl ? assetUrl(webhook.avatarUrl) : null}
                    alt={webhook.name}
                    fallback={initials(webhook.name)}
                  />
                  <span className={styles.identityText}>
                    <strong>{webhook.name}</strong>
                    <small>
                      {t('webhook.createdAt', { date: dates.absolute(webhook.createdAt) })}
                    </small>
                  </span>
                </span>
                {pending ? (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={hooks.isBusy}
                      onClick={() => void runConfirmed(webhook)}
                    >
                      {pending.action === 'regenerate'
                        ? t('webhook.action.confirmRegenerate')
                        : t('webhook.action.confirmDelete')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                      {t('common.cancel')}
                    </Button>
                  </>
                ) : (
                  <>
                    <IconButton
                      label={t('webhook.action.regenerate', { name: webhook.name })}
                      size="sm"
                      onClick={() => setConfirm({ webhookId: webhook.id, action: 'regenerate' })}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={t('webhook.action.delete', { name: webhook.name })}
                      variant="danger"
                      size="sm"
                      onClick={() => setConfirm({ webhookId: webhook.id, action: 'delete' })}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </IconButton>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <p className="empty-note">{t('webhook.empty')}</p>
        )}
      </div>
    </section>
  );
}
