import { useState, type FormEvent } from 'react';
import { ArrowLeft, Lock, Mail } from 'lucide-react';
import { Button, TextField } from '../ui';
import styles from '../AuthScreen.module.css';

const PASSWORD_PATTERN = '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}';

interface ForgotPasswordFormProps {
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export function ForgotPasswordForm({ isSubmitting, onSubmit, onBack }: ForgotPasswordFormProps) {
  return (
    <form onSubmit={onSubmit} className={styles.fields}>
      <TextField
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        leadingIcon={<Mail size={18} aria-hidden="true" />}
      />
      <Button type="submit" fullWidth disabled={isSubmitting}>
        Send reset link
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to sign in
      </Button>
    </form>
  );
}

interface ResetPasswordFormProps {
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export function ResetPasswordForm({ isSubmitting, onSubmit, onBack }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const mismatch = Boolean(confirmation) && confirmation !== password;

  return (
    <form onSubmit={onSubmit} className={styles.fields}>
      <TextField
        label="New password"
        name="password"
        type="password"
        required
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
        pattern={PASSWORD_PATTERN}
        hint="At least 8 characters, with uppercase, lowercase, a number, and a symbol."
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        leadingIcon={<Lock size={18} aria-hidden="true" />}
      />
      <TextField
        label="Confirm new password"
        type="password"
        required
        autoComplete="new-password"
        value={confirmation}
        error={mismatch ? 'Passwords do not match.' : undefined}
        onChange={(event) => setConfirmation(event.target.value)}
        leadingIcon={<Lock size={18} aria-hidden="true" />}
      />
      <Button type="submit" fullWidth disabled={isSubmitting || mismatch || !confirmation}>
        Update password
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to sign in
      </Button>
    </form>
  );
}
