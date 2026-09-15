import type { FormEvent } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Button, TextField } from '../ui';
import styles from '../AuthScreen.module.css';

interface TwoFactorLoginFormProps {
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export function TwoFactorLoginForm({ isSubmitting, onSubmit, onBack }: TwoFactorLoginFormProps) {
  return (
    <form onSubmit={onSubmit} className={styles.fields}>
      <TextField
        label="Authentication code"
        name="code"
        required
        autoFocus
        autoComplete="one-time-code"
        inputMode="text"
        maxLength={9}
        pattern="\d{6}|[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}"
        placeholder="123456 or recovery code"
        hint="Enter the 6-digit code from your authenticator app, or a recovery code."
        leadingIcon={<KeyRound size={18} aria-hidden="true" />}
      />
      <Button type="submit" fullWidth disabled={isSubmitting}>
        Verify and sign in
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to sign in
      </Button>
    </form>
  );
}
