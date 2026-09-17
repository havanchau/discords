import { useRef, useState } from 'react';
import { Bot, Copy, Link, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { BOT_MAX_PER_OWNER, BOT_NAME_MAX_LENGTH, BOT_NAME_MIN_LENGTH } from '@discord-clone/shared';
import { assetUrl, type OwnedBot } from '@/api';
import { Avatar, Button, IconButton, TextField } from '@/components/ui';
import { botAuthorizeUrl, useOwnedBots } from '@/hooks/useOwnedBots';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { initials } from '@/helpers';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './BotsSection.module.css';

const AVATAR_MIME_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];

type PendingConfirm = { botId: string; action: 'regenerate' | 'delete' } | null;

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/**
 * The signed-in user's bots. A new token is shown once, then only the bot's name and its authorize
 * link remain; the link is not a secret, it only opens the authorize dialog for a server admin.
 */
export function BotsSection() {
  const t = useTranslation();
  const dates = useDateFormat();
  const bots = useOwnedBots();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [secretToken, setSecretToken] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [error, setError] = useState<string | null>(null);
  const isFull = bots.bots.length >= BOT_MAX_PER_OWNER;
  const trimmedName = name.trim();

  async function create() {
    if (trimmedName.length < BOT_NAME_MIN_LENGTH) return;
    setError(null);
    try {
      setSecretToken(await bots.createBot(trimmedName, avatar));
      setName('');
      setAvatar(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    } catch (err) {
      setError(errorText(err, t('error.fallback.cannot-create-bot')));
    }
  }

  async function runConfirmed(bot: OwnedBot) {
    if (!confirm) return;
    const { action } = confirm;
    setConfirm(null);
    setError(null);
    try {
      if (action === 'regenerate') {
        setSecretToken(await bots.regenerateToken(bot.id));
      } else {
        await bots.deleteBot(bot.id);
      }
    } catch (err) {
      setError(
        errorText(
          err,
          action === 'regenerate'
            ? t('error.fallback.cannot-regenerate-bot-token')
            : t('error.fallback.cannot-delete-bot'),
        ),
      );
    }
  }

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="account-bots-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="account-bots-title">
          <Bot size={14} aria-hidden="true" />{' '}
          {t('bot.section.title', { count: bots.bots.length, max: BOT_MAX_PER_OWNER })}
        </strong>
        <span>{t('bot.section.hint')}</span>
      </div>

      <div className={styles.createRow}>
        <TextField
          fieldClassName={styles.name}
          label={t('bot.field.name')}
          value={name}
          maxLength={BOT_NAME_MAX_LENGTH}
          disabled={isFull}
          onChange={(event) => setName(event.target.value)}
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
          aria-label={t('bot.field.avatar')}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            if (selected && !AVATAR_MIME_TYPES.includes(selected.type)) {
              setError(t('bot.error.avatarType'));
              setAvatar(null);
              return;
            }
            setAvatar(selected);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={isFull}
          onClick={() => avatarInputRef.current?.click()}
        >
          {avatar ? avatar.name : t('bot.action.chooseAvatar')}
        </Button>
        <Button
          type="button"
          disabled={isFull || trimmedName.length < BOT_NAME_MIN_LENGTH || bots.isBusy}
          onClick={() => void create()}
        >
          {bots.isBusy ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('bot.action.create')}
        </Button>
      </div>

      {secretToken ? (
        <div className={settingsStyles.recoveryCodes} role="status">
          <strong>{t('bot.secret.warning')}</strong>
          <TextField
            label={t('bot.secret.tokenLabel')}
            value={secretToken}
            readOnly
            className={settingsStyles.readonlyInput}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(secretToken)}
            >
              <Copy size={14} aria-hidden="true" />
              {t('bot.action.copyToken')}
            </Button>
            <Button type="button" size="sm" onClick={() => setSecretToken(null)}>
              {t('bot.action.dismiss')}
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
        {bots.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('bot.loading')}
          </p>
        ) : bots.error ? (
          <p className="empty-note" role="alert">
            {errorText(bots.error, t('error.fallback.cannot-load-bots'))}
          </p>
        ) : bots.bots.length ? (
          bots.bots.map((bot) => {
            const pending = confirm?.botId === bot.id ? confirm : null;
            return (
              <div className={settingsStyles.inviteRow} key={bot.id}>
                <span className={styles.identity}>
                  <Avatar
                    size="sm"
                    src={bot.avatarUrl ? assetUrl(bot.avatarUrl) : null}
                    alt={bot.name}
                    fallback={initials(bot.name)}
                  />
                  <span className={styles.identityText}>
                    <strong>{bot.name}</strong>
                    <small>
                      {t('bot.summary', {
                        date: dates.absolute(bot.createdAt),
                        count: bot.serverCount,
                      })}
                    </small>
                  </span>
                </span>
                {pending ? (
                  <>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={bots.isBusy}
                      onClick={() => void runConfirmed(bot)}
                    >
                      {pending.action === 'regenerate'
                        ? t('bot.action.confirmRegenerate')
                        : t('bot.action.confirmDelete')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirm(null)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </>
                ) : (
                  <>
                    <IconButton
                      label={t('bot.action.copyAuthorizeLink', { name: bot.name })}
                      size="sm"
                      onClick={() => void navigator.clipboard?.writeText(botAuthorizeUrl(bot.id))}
                    >
                      <Link size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={t('bot.action.regenerate', { name: bot.name })}
                      size="sm"
                      onClick={() => setConfirm({ botId: bot.id, action: 'regenerate' })}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={t('bot.action.delete', { name: bot.name })}
                      variant="danger"
                      size="sm"
                      onClick={() => setConfirm({ botId: bot.id, action: 'delete' })}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </IconButton>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <p className="empty-note">{t('bot.empty')}</p>
        )}
      </div>
    </section>
  );
}
