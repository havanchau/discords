import { Loader2, Plus, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, DialogContent, DialogRoot, TextField } from '@/components/ui';
import { TemplatePicker } from './TemplatePicker';
import styles from './WorkspaceDialogs.module.css';
import type { ChannelCreateType, ServerAction } from './types';

interface WorkspaceDialogsProps {
  serverAction: ServerAction | null;
  setServerAction: (action: ServerAction | null) => void;
  channelCreateType: ChannelCreateType | null;
  channelCreateCategoryId: string | null;
  setChannelCreateType: (type: ChannelCreateType | null) => void;
  isCreateCategoryOpen: boolean;
  setIsCreateCategoryOpen: (open: boolean) => void;
  createCategory: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  pendingAction: string | null;
  createServer: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  joinInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function WorkspaceDialogs({
  serverAction,
  setServerAction,
  channelCreateType,
  channelCreateCategoryId,
  setChannelCreateType,
  isCreateCategoryOpen,
  setIsCreateCategoryOpen,
  createCategory,
  pendingAction,
  createServer,
  joinInvite,
  createChannel,
}: WorkspaceDialogsProps) {
  const t = useTranslation();
  const [templateId, setTemplateId] = useState<string | null>(null);

  async function submitCreateServer(event: FormEvent<HTMLFormElement>) {
    await createServer(event);
    setTemplateId(null);
    setServerAction(null);
  }

  async function submitJoinInvite(event: FormEvent<HTMLFormElement>) {
    await joinInvite(event);
    setServerAction(null);
  }

  async function submitCreateCategory(event: FormEvent<HTMLFormElement>) {
    const created = await createCategory(event);
    if (created) setIsCreateCategoryOpen(false);
  }

  async function submitCreateChannel(event: FormEvent<HTMLFormElement>) {
    await createChannel(event);
    setChannelCreateType(null);
  }

  return (
    <>
      <DialogRoot
        open={Boolean(serverAction)}
        onOpenChange={(open) => !open && setServerAction(null)}
      >
        <DialogContent
          title={serverAction === 'join' ? t('server.dialog.join') : t('server.dialog.create')}
        >
          <div className={styles.tabs} role="group" aria-label={t('server.dialog.actionGroup')}>
            <Button
              variant={serverAction === 'create' ? 'primary' : 'secondary'}
              aria-pressed={serverAction === 'create'}
              onClick={() => setServerAction('create')}
            >
              <Plus size={16} aria-hidden="true" />
              {t('server.dialog.tabCreate')}
            </Button>
            <Button
              variant={serverAction === 'join' ? 'primary' : 'secondary'}
              aria-pressed={serverAction === 'join'}
              onClick={() => setServerAction('join')}
            >
              <UserPlus size={16} aria-hidden="true" />
              {t('server.dialog.tabJoin')}
            </Button>
          </div>

          {serverAction === 'join' ? (
            <form onSubmit={(event) => void submitJoinInvite(event)} className={styles.form}>
              <TextField
                name="code"
                label={t('server.field.inviteCode')}
                placeholder={t('server.field.inviteCodePlaceholder')}
                required
              />
              <Button
                type="submit"
                fullWidth
                data-testid="join-invite-button"
                disabled={pendingAction === 'join-invite'}
              >
                {pendingAction === 'join-invite' ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  t('server.action.join')
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={(event) => void submitCreateServer(event)} className={styles.form}>
              <TemplatePicker value={templateId} onChange={setTemplateId} />
              {templateId ? (
                <input name="templateId" type="hidden" value={templateId} readOnly />
              ) : null}
              <TextField
                name="name"
                label={t('server.field.name')}
                placeholder={t('server.field.namePlaceholder')}
                required
              />
              <TextField
                name="description"
                label={t('server.field.description')}
                placeholder={t('server.field.descriptionPlaceholder')}
              />
              <Button
                type="submit"
                fullWidth
                data-testid="create-server-button"
                disabled={pendingAction === 'create-server'}
              >
                {pendingAction === 'create-server' ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  t('server.action.create')
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </DialogRoot>

      <DialogRoot
        open={Boolean(channelCreateType)}
        onOpenChange={(open) => !open && setChannelCreateType(null)}
      >
        <DialogContent
          title={
            channelCreateType === 'VOICE'
              ? t('channel.dialog.createVoice')
              : channelCreateType === 'FORUM'
                ? t('channel.dialog.createForum')
                : channelCreateType === 'STAGE'
                  ? t('channel.dialog.createStage')
                  : channelCreateType === 'ANNOUNCEMENT'
                    ? t('channel.dialog.createAnnouncement')
                    : t('channel.dialog.createText')
          }
        >
          <form onSubmit={(event) => void submitCreateChannel(event)} className={styles.form}>
            <TextField
              data-testid={
                channelCreateType === 'VOICE' ? 'create-voice-input' : 'create-channel-input'
              }
              name="name"
              label={t('channel.field.name')}
              placeholder={
                channelCreateType === 'VOICE'
                  ? t('channel.field.namePlaceholderVoice')
                  : t('channel.field.namePlaceholderText')
              }
              required
            />
            <input name="type" type="hidden" value={channelCreateType ?? 'TEXT'} readOnly />
            {channelCreateCategoryId ? (
              <input name="categoryId" type="hidden" value={channelCreateCategoryId} readOnly />
            ) : null}
            <Button
              type="submit"
              fullWidth
              data-testid={
                channelCreateType === 'VOICE' ? 'create-voice-button' : 'create-channel-button'
              }
              disabled={pendingAction === 'create-channel'}
            >
              {pendingAction === 'create-channel' ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                t('channel.action.create')
              )}
            </Button>
          </form>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={isCreateCategoryOpen} onOpenChange={setIsCreateCategoryOpen}>
        <DialogContent title={t('category.dialog.create')}>
          <form onSubmit={(event) => void submitCreateCategory(event)} className={styles.form}>
            <TextField
              name="name"
              label={t('category.field.name')}
              placeholder={t('category.field.namePlaceholder')}
              maxLength={80}
              required
              data-testid="create-category-input"
            />
            <Button
              type="submit"
              fullWidth
              data-testid="create-category-button"
              disabled={pendingAction === 'create-category'}
            >
              {pendingAction === 'create-category' ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                t('category.action.create')
              )}
            </Button>
          </form>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
