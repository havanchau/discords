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
import { useTranslation, type Translate } from '../i18n/LocaleProvider';
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
  t: Translate,
  availability: OAuthProviderAvailability,
  provider: OAuthProviderName,
  label: string,
) {
  if (availability === 'unavailable') return t('auth.oauth.unavailable');
  return availability[provider]
    ? t('auth.oauth.continueWith', { provider: label })
    : t('auth.oauth.notConfigured', { provider: label });
}

function headings(t: Translate): Record<AuthMode, { title: string; description: string }> {
  return {
    login: { title: t('auth.heading.login.title'), description: t('auth.heading.login.description') },
    register: {
      title: t('auth.heading.register.title'),
      description: t('auth.heading.register.description'),
    },
    forgot: {
      title: t('auth.heading.forgot.title'),
      description: t('auth.heading.forgot.description'),
    },
    reset: { title: t('auth.heading.reset.title'), description: t('auth.heading.reset.description') },
    'two-factor': {
      title: t('auth.heading.twoFactor.title'),
      description: t('auth.heading.twoFactor.description'),
    },
  };
}

const HIGHLIGHTS = [
  { icon: MessagesSquare, key: 'auth.highlight.channels' },
  { icon: Zap, key: 'auth.highlight.voice' },
  { icon: ShieldCheck, key: 'auth.highlight.roles' },
] as const;

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
  const t = useTranslation();
  const isLogin = mode === 'login';
  const isPasswordRecovery = mode === 'forgot' || mode === 'reset' || mode === 'two-factor';
  // The token only arrives through the emailed link, so there is nothing to confirm without it.
  const showVerification = !isPasswordRecovery && Boolean(verificationToken);
  const heading = headings(t)[mode];
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
            <strong>Discords</strong> {/* i18n-ignore: product name */}
            <small>{t('auth.brand.tagline')}</small>
          </span>
        </div>

        <div className={styles.pitch}>
          <h2>{t('auth.pitch.title')}</h2>
          <p>{t('auth.pitch.body')}</p>
          <ul className={styles.highlights}>
            {HIGHLIGHTS.map(({ icon: Icon, key }) => (
              <li key={key}>
                <Icon size={18} aria-hidden="true" />
                {t(key)}
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
              <div className={styles.modeSwitch} role="group" aria-label={t('auth.modeGroup')}>
                <Button
                  variant="ghost"
                  className={styles.modeButton}
                  aria-pressed={isLogin}
                  onClick={() => setMode('login')}
                >
                  {t('auth.action.signIn')}
                </Button>
                <Button
                  variant="ghost"
                  className={styles.modeButton}
                  aria-pressed={!isLogin}
                  onClick={() => setMode('register')}
                >
                  {t('auth.action.register')}
                </Button>
              </div>

              <form onSubmit={submitAuth} className={styles.fields}>
                <TextField
                  label={t('auth.field.email')}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t('auth.field.emailPlaceholder')}
                  leadingIcon={<Mail size={18} aria-hidden="true" />}
                />
                {!isLogin ? (
                  <>
                    <TextField
                      label={t('auth.field.username')}
                      name="username"
                      required
                      minLength={3}
                      autoComplete="username"
                      placeholder={t('auth.field.usernamePlaceholder')}
                      leadingIcon={<User size={18} aria-hidden="true" />}
                    />
                    <TextField
                      label={t('auth.field.displayName')}
                      name="displayName"
                      autoComplete="nickname"
                      placeholder={t('auth.field.displayNamePlaceholder')}
                      leadingIcon={<UserRound size={18} aria-hidden="true" />}
                    />
                  </>
                ) : null}
                <TextField
                  label={t('auth.field.password')}
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  hint={
                    isLogin
                      ? undefined
                      : t('auth.field.passwordHint')
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
                    {t('auth.forgotPassword')}
                  </Button>
                ) : null}

                {feedback}

                <Button type="submit" fullWidth>
                  {isLogin ? t('auth.action.signIn') : t('auth.action.createAccount')}
                </Button>
                {isLogin && canResendVerification ? (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    disabled={isSubmitting}
                    onClick={resendVerification}
                  >
                    {t('auth.action.resendVerification')}
                  </Button>
                ) : null}
              </form>

              <p className={styles.divider}>
                <span>{t('auth.orContinueWith')}</span>
              </p>
              <div className={styles.socialRow}>
                {OAUTH_BUTTONS.map(({ provider, label }) => (
                  <Button
                    key={provider}
                    variant="secondary"
                    disabled={oauthProviders === 'unavailable' || !oauthProviders[provider]}
                    title={oauthButtonTitle(t, oauthProviders, provider, label)}
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
                {t('auth.action.verifyEmail')}
              </Button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
