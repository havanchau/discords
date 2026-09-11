import { BadgeCheck, Lock, Mail, MessagesSquare, ShieldCheck, User, UserRound, Zap } from 'lucide-react';
import { FormEvent } from 'react';
import { cn } from '../utils/cn';
import { Button, TextField } from './ui';
import styles from './AuthScreen.module.css';

interface AuthScreenProps {
  error: string | null;
  mode: 'login' | 'register';
  setMode: (mode: 'login' | 'register') => void;
  submitAuth: (event: FormEvent<HTMLFormElement>) => void;
  submitVerification: (event: FormEvent<HTMLFormElement>) => void;
  verificationHint: string | null;
  verificationToken: string;
  setVerificationToken: (value: string) => void;
}

const HIGHLIGHTS = [
  { icon: MessagesSquare, label: 'Realtime channels, threads, and direct messages' },
  { icon: Zap, label: 'Voice rooms with presence and screen sharing' },
  { icon: ShieldCheck, label: 'Roles and per-channel permissions' },
];

export function AuthScreen({
  error,
  mode,
  setMode,
  submitAuth,
  submitVerification,
  verificationHint,
  verificationToken,
  setVerificationToken,
}: AuthScreenProps) {
  const isLogin = mode === 'login';
  const showVerification = Boolean(verificationHint || verificationToken.trim());

  return (
    <main className={styles.screen}>
      <section className={styles.brandPane}>
        <div className={styles.brandLockup}>
          <span className={styles.brandMark} aria-hidden="true">
            D
          </span>
          <span className={styles.brandName}>
            <strong>Discords</strong>
            <small>Realtime</small>
          </span>
        </div>

        <div className={styles.pitch}>
          <h2>Your team, in one place.</h2>
          <p>Channels, calls, and threads for the conversations that need to keep moving.</p>
          <ul className={styles.highlights}>
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <li key={label}>
                <Icon size={18} aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.formPane}>
        <div className={styles.form}>
          <div className={styles.heading}>
            <h1>{isLogin ? 'Sign in' : 'Create your account'}</h1>
            <p>
              {isLogin
                ? 'Sign in with your email address.'
                : 'Set up an account and jump into the server.'}
            </p>
          </div>

          <div className={styles.modeSwitch} role="group" aria-label="Authentication mode">
            <Button
              variant="ghost"
              className={styles.modeButton}
              aria-pressed={isLogin}
              onClick={() => setMode('login')}
            >
              Sign in
            </Button>
            <Button
              variant="ghost"
              className={styles.modeButton}
              aria-pressed={!isLogin}
              onClick={() => setMode('register')}
            >
              Register
            </Button>
          </div>

          <form onSubmit={submitAuth} className={styles.fields}>
            <TextField
              label="Email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              leadingIcon={<Mail size={18} aria-hidden="true" />}
            />
            {!isLogin ? (
              <>
                <TextField
                  label="Username"
                  name="username"
                  required
                  minLength={3}
                  autoComplete="username"
                  placeholder="demo"
                  leadingIcon={<User size={18} aria-hidden="true" />}
                />
                <TextField
                  label="Display name"
                  name="displayName"
                  autoComplete="nickname"
                  placeholder="Demo User"
                  leadingIcon={<UserRound size={18} aria-hidden="true" />}
                />
              </>
            ) : null}
            <TextField
              label="Password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              hint={
                isLogin
                  ? undefined
                  : 'At least 8 characters, with uppercase, lowercase, a number, and a symbol.'
              }
              pattern={isLogin ? undefined : '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}'}
              leadingIcon={<Lock size={18} aria-hidden="true" />}
            />

            {verificationHint ? (
              <p className={cn(styles.feedback, styles.success)} role="status">
                {verificationHint}
              </p>
            ) : null}
            {error ? (
              <p className={cn(styles.feedback, styles.error)} role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" fullWidth>
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className={styles.divider}>
            <span>Or continue with</span>
          </p>
          <div className={styles.socialRow}>
            <Button variant="secondary" disabled title="Google sign-in is not configured">
              Google
            </Button>
            <Button variant="secondary" disabled title="Facebook sign-in is not configured">
              Facebook
            </Button>
          </div>

          {showVerification ? (
            <form onSubmit={submitVerification} className={styles.verifyBox}>
              <TextField
                label="Verification token"
                value={verificationToken}
                onChange={(event) => setVerificationToken(event.target.value)}
                placeholder="Paste the token from your email"
                leadingIcon={<BadgeCheck size={18} aria-hidden="true" />}
              />
              <Button type="submit" fullWidth disabled={!verificationToken.trim()}>
                Verify email
              </Button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
