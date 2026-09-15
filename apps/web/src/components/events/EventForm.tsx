import { useState, type FormEvent } from 'react';
import type { Channel, CreateServerEventInput } from '../../api';
import { Button, TextArea, TextField } from '../ui';
import { SettingsSelect } from '../settings/SettingsSelect';
import styles from './ServerEvents.module.css';

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
  const [channelId, setChannelId] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startAt = toIsoString(String(form.get('startAt') ?? ''));
    if (!startAt) return;
    const created = await onSubmit({
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim() || undefined,
      location: String(form.get('location') ?? '').trim() || undefined,
      channelId: channelId || undefined,
      startAt,
      endAt: toIsoString(String(form.get('endAt') ?? '')),
    });
    if (created) onCancel();
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <TextField label="Event name" name="name" required maxLength={100} />
      <div className={styles.formGrid}>
        <TextField label="Starts" name="startAt" type="datetime-local" required />
        <TextField label="Ends" name="endAt" type="datetime-local" />
      </div>
      <SettingsSelect
        name="channelId"
        label="Channel"
        defaultValue=""
        options={[
          { value: '', label: 'No channel' },
          ...channels.map((channel) => ({
            value: channel.id,
            label: `${channel.type === 'VOICE' ? 'Voice' : 'Text'} · ${channel.name}`,
          })),
        ]}
        onValueChange={setChannelId}
      />
      <TextField label="Location" name="location" maxLength={200} placeholder="Optional" />
      <TextArea label="Description" name="description" maxLength={1000} />
      <div className={styles.formActions}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Create event
        </Button>
      </div>
    </form>
  );
}
