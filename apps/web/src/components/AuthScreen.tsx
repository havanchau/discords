import {
  BadgeCheck,
  Lock,
  Mail,
  MessagesSquare,
  ShieldCheck,
  User,
  UserRound,
  Zap,
} from 'lucide-react';
import { FormEvent } from 'react';
import type { OAuthProviderName } from '../api';
import type { AuthMode } from '../hooks/useAuthSession';
import type { OAuthProviderAvailability } from '../hooks/useOAuthSignIn';
import { cn } from '../utils/cn';
import { ForgotPasswordForm, ResetPasswordForm } from './auth/PasswordResetForms';
import { TwoFactorLoginForm } from './auth/TwoFactorLoginForm';
import { Button, TextField } from './ui';
import styles from './AuthScreen.module.css';

export interface AuthScreenProps {
  error: string | null;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  isSubmitting: boolean;
  submitAuth: (event: FormEvent<HTMLFormElement>) => void;
  submitVerification: (event: FormEvent<HTMLFormElement>) => void;
  submitForgotPassword: (event: FormEvent<HTMLFormElement>) => void;
  submitResetPassword: (event: FormEvent<HTMLFormElement>) => void;
  submitTwoFactorLogin: (event: FormEvent<HTMLFormElement>) => void;
  notice: string | null;
  verificationHint: string | null;
  verificationToken: string;
  canResendVerification: boolean;
  resendVerification: () => void;
  oauthProviders: OAuthProviderAvailability;
  startOAuth: (provider: OAuthProviderName) => void;
}

const OAUTH_BUTTONS: { provider: OAuthProviderName; label: string }[] = [
  { provider: 'google', label: 'Google' },
  { provider: 'facebook', label: 'Facebook' },
];

function oauthButtonTitle(
  availability: OAuthProviderAvailability,
  provider: OAuthProviderName,
  label: string,
) {
  if (availability === 'unavailable') return 'Sign-in providers could not be loaded';
  return availability[provider] ? `Continue with ${label}` : `${label} sign-in is not configured`;
}

const HEADINGS: Record<AuthMode, { title: string; description: string }> = {
  login: { title: 'Sign in', description: 'Sign in with your email address.' },
  register: {
    title: 'Create your account',
    description: 'Set up an account and jump into the server.',
  },
  forgot: {
    title: 'Reset your password',
    description: 'Enter your email and we will send you a reset link.',
  },
  reset: { title: 'Choose a new password', description: 'Other devices will be signed out.' },
  'two-factor': {
    title: 'Two-factor authentication',
    description: 'Confirm it is you to finish signing in.',
  },
};

const HIGHLIGHTS = [
  { icon: MessagesSquare, label: 'Realtime channels, threads, and direct messages' },
  { icon: Zap, label: 'Voice rooms with presence and screen sharing' },
  { icon: ShieldCheck, label: 'Roles and per-channel permissions' },
];

export function AuthScreen({
  error,
  mode,
  setMode,
  isSubmitting,
  submitAuth,
  submitVerification,
  submitForgotPassword,
  submitResetPassword,
  submitTwoFactorLogin,
  notice,
  verificationHint,
  verificationToken,
  canResendVerification,
  resendVerification,
  oauthProviders,
  startOAuth,
}: AuthScreenProps) {
  const isLogin = mode === 'login';
  const isPasswordRecovery = mode === 'forgot' || mode === 'reset' || mode === 'two-factor';
  // The token only arrives through the emailed link, so there is nothing to confirm without it.
  const showVerification = !isPasswordRecovery && Boolean(verificationToken);
  const heading = HEADINGS[mode];
  const feedback = (
    <>
      {notice ? (
        <p className={cn(styles.feedback, styles.success)} role="status">
          {notice}
        </p>
      ) : null}
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
    </>
  );

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
            <h1>{heading.title}</h1>
            <p>{heading.description}</p>
          </div>

          {mode === 'forgot' ? (
            <>
              {feedback}
              <ForgotPasswordForm
                isSubmitting={isSubmitting}
                onSubmit={submitForgotPassword}
                onBack={() => setMode('login')}
              />
            </>
          ) : null}
          {mode === 'reset' ? (
            <>
              {feedback}
              <ResetPasswordForm
                isSubmitting={isSubmitting}
                onSubmit={submitResetPassword}
                onBack={() => setMode('login')}
              />
            </>
          ) : null}

          {mode === 'two-factor' ? (
            <>
              {feedback}
              <TwoFactorLoginForm
                isSubmitting={isSubmitting}
                onSubmit={submitTwoFactorLogin}
                onBack={() => setMode('login')}
              />
            </>
          ) : null}

          {!isPasswordRecovery ? (
            <>
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
                  pattern={
                    isLogin ? undefined : '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}'
                  }
                  leadingIcon={<Lock size={18} aria-hidden="true" />}
                />
                {isLogin ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.forgotLink}
                    onClick={() => setMode('forgot')}
                  >
                    Forgot password?
                  </Button>
                ) : null}

                {feedback}

                <Button type="submit" fullWidth>
                  {isLogin ? 'Sign in' : 'Create account'}
                </Button>
                {isLogin && canResendVerification ? (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    disabled={isSubmitting}
                    onClick={resendVerification}
                  >
                    Resend verification email
                  </Button>
                ) : null}
              </form>

              <p className={styles.divider}>
                <span>Or continue with</span>
              </p>
              <div className={styles.socialRow}>
                {OAUTH_BUTTONS.map(({ provider, label }) => (
                  <Button
                    key={provider}
                    variant="secondary"
                    disabled={oauthProviders === 'unavailable' || !oauthProviders[provider]}
                    title={oauthButtonTitle(oauthProviders, provider, label)}
                    onClick={() => startOAuth(provider)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </>
          ) : null}

          {showVerification ? (
            <form onSubmit={submitVerification} className={styles.verifyBox}>
              <Button type="submit" fullWidth>
                <BadgeCheck size={18} aria-hidden="true" />
                Verify email
              </Button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
