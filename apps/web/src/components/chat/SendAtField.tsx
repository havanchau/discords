import { reminderIsoToInput } from '@/components/saved/ReminderPicker';
import { TextField } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';

const MINUTE_MS = 60_000;
/** Mirrors the API window (1 minute to 30 days ahead); the API is still the one that enforces it. */
const MAX_LEAD_MS = 30 * 24 * 60 * MINUTE_MS;

interface SendAtFieldProps {
  /** A `datetime-local` value in the viewer's time zone. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SendAtField({ value, onChange, disabled }: SendAtFieldProps) {
  const t = useTranslation();
  const now = Date.now();

  return (
    <TextField
      type="datetime-local"
      label={t('scheduled.field.sendAt')}
      value={value}
      min={reminderIsoToInput(new Date(now + MINUTE_MS).toISOString())}
      max={reminderIsoToInput(new Date(now + MAX_LEAD_MS).toISOString())}
      disabled={disabled}
      required
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
