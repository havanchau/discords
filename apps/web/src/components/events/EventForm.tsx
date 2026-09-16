import { useState, type FormEvent } from 'react';
import type { Channel, CreateServerEventInput } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, TextArea, TextField } from '@/components/ui';
import { SettingsSelect } from '@/components/settings/SettingsSelect';
import styles from './ServerEvents.module.css';
import { formText } from '@/utils/formText';

interface EventFormProps {
  channels: Channel[];
  isSubmitting: boolean;
  onSubmit: (input: CreateServerEventInput) => Promise<boolean>;
  onCancel: () => void;
}

/** `datetime-local` values are in the viewer's time zone; `new Date` converts them to UTC. */
function toIsoString(localValue: string) {
  return localValue ? new Date(localValue).toISOString() : undefined;
}

export function EventForm({ channels, isSubmitting, onSubmit, onCancel }: EventFormProps) {
  const t = useTranslation();
  const [channelId, setChannelId] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startAt = toIsoString(formText(form, 'startAt'));
    if (!startAt) return;
    const created = await onSubmit({
      name: formText(form, 'name').trim(),
      description: formText(form, 'description').trim() || undefined,
      location: formText(form, 'location').trim() || undefined,
      channelId: channelId || undefined,
      startAt,
      endAt: toIsoString(formText(form, 'endAt')),
    });
    if (created) onCancel();
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <TextField label={t('events.field.name')} name="name" required maxLength={100} />
      <div className={styles.formGrid}>
        <TextField label={t('events.field.starts')} name="startAt" type="datetime-local" required />
        <TextField label={t('events.field.ends')} name="endAt" type="datetime-local" />
      </div>
      <SettingsSelect
        name="channelId"
        label={t('events.field.channel')}
        defaultValue=""
        options={[
          { value: '', label: t('events.field.noChannel') },
          ...channels.map((channel) => ({
            value: channel.id,
            label: t('events.channelOption', {
              type:
                channel.type === 'VOICE'
                  ? t('events.channelType.voice')
                  : t('events.channelType.text'),
              name: channel.name,
            }),
          })),
        ]}
        onValueChange={setChannelId}
      />
      <TextField
        label={t('events.field.location')}
        name="location"
        maxLength={200}
        placeholder={t('events.field.locationPlaceholder')}
      />
      <TextArea label={t('events.field.description')} name="description" maxLength={1000} />
      <div className={styles.formActions}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {t('events.action.create')}
        </Button>
      </div>
    </form>
  );
}
