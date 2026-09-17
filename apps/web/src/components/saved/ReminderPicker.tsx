import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, TextField } from '@/components/ui';
import styles from './ReminderPicker.module.css';

const HOUR_MS = 60 * 60 * 1000;

const PRESETS = [
  { key: 'saved.reminder.preset.hour', build: (now: Date) => new Date(now.getTime() + HOUR_MS) },
  {
    key: 'saved.reminder.preset.threeHours',
    build: (now: Date) => new Date(now.getTime() + 3 * HOUR_MS),
  },
  {
    key: 'saved.reminder.preset.tomorrow',
    build: (now: Date) => {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow;
    },
  },
] as const;

/** `datetime-local` wants local wall-clock time without a zone. */
function toLocalInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** A local `datetime-local` value as the ISO instant the API stores, or undefined for none. */
export function reminderInputToIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export function reminderIsoToInput(value: string | null) {
  return value ? toLocalInputValue(new Date(value)) : '';
}

interface ReminderPickerProps {
  /** A `datetime-local` value; empty means no reminder. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ReminderPicker({ value, onChange, disabled }: ReminderPickerProps) {
  const t = useTranslation();

  return (
    <div className={styles.picker}>
      <div className={styles.presets} role="group" aria-label={t('saved.reminder.presetsLabel')}>
        {PRESETS.map((preset) => (
          <Button
            key={preset.key}
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange(toLocalInputValue(preset.build(new Date())))}
          >
            {t(preset.key)}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || !value}
          onClick={() => onChange('')}
        >
          {t('saved.reminder.preset.none')}
        </Button>
      </div>
      <TextField
        type="datetime-local"
        label={t('saved.reminder.label')}
        value={value}
        min={toLocalInputValue(new Date())}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
