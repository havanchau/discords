import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest, AuthState, configureAuthRefresh } from '@/api';
import { AUTH_KEY } from '@/helpers';
import { TwoFactorRequiredResponse, useOAuthSignIn } from './useOAuthSignIn';
import { useTranslation } from '@/i18n/LocaleProvider';
import { formText } from '@/utils/formText';

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'two-factor';

interface VerificationRequiredResponse {
  verificationRequired: true;
  email: string;
  message: string;
}

// Must match the API's unverified-login message in auth.service.ts.
const EMAIL_NOT_VERIFIED_MESSAGE = 'Email is not verified';

type AuthResponse = AuthState | VerificationRequiredResponse | TwoFactorRequiredResponse;

interface UseAuthSessionOptions {
  onClearAuth: () => void;
}

export function useAuthSession({ onClearAuth }: UseAuthSessionOptions) {
  const t = useTranslation();
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  });
  const [mode, setModeState] = useState<AuthMode>('login');
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationHint, setVerificationHint] = useState<string | null>(null);
  // Address a new verification link can be requested for, after register or an unverified sign in.
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState('');
  // Success messages for password recovery; kept apart from verificationHint, which opens the
  // email verification form.
  const [notice, setNotice] = useState<string | null>(null);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMode = useCallback((nextMode: AuthMode) => {
    setError(null);
    setNotice(null);
    setModeState(nextMode);
  }, []);

  const requireTwoFactor = useCallback(
    (challengeToken: string) => {
      setTwoFactorChallenge(challengeToken);
      setMode('two-factor');
    },
    [setMode],
  );
  const oauth = useOAuthSignIn({
    isSignedOut: auth === null,
    onSignedIn: setAuth,
    onTwoFactorRequired: requireTwoFactor,
    onError: setError,
  });

  const clearAuth = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    onClearAuth();
  }, [onClearAuth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (window.location.pathname === '/verify-email' && token) {
      setVerificationToken(token);
      setVerificationHint(t('notice.emailTokenLoaded'));
      setMode('login');
      window.history.replaceState({}, '', '/');
    }
    // The reset token is a credential; keep it out of the address bar and history.
    if (window.location.pathname === '/reset-password' && token) {
      setResetToken(token);
      setMode('reset');
      window.history.replaceState({}, '', '/');
    }
  }, [setMode, t]);

  useEffect(() => {
    configureAuthRefresh({
      getAuth: () => {
        const raw = localStorage.getItem(AUTH_KEY);
        return raw ? (JSON.parse(raw) as AuthState) : null;
      },
      setAuth: (nextAuth) => {
        localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
        setAuth(nextAuth);
      },
      clearAuth,
    });
  }, [clearAuth]);

  useEffect(() => {
    if (!auth) return;
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  }, [auth]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      email: formText(form, 'email'),
      username: formText(form, 'username'),
      displayName: formText(form, 'displayName'),
      password: formText(form, 'password'),
    };

    try {
      const result = await apiRequest<AuthResponse>(
        mode === 'login' ? '/auth/login' : '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(
            mode === 'login' ? { email: payload.email, password: payload.password } : payload,
          ),
        },
      );
      if ('twoFactorRequired' in result) {
        setTwoFactorChallenge(result.challengeToken);
        setMode('two-factor');
        return;
      }
      if ('verificationRequired' in result) {
        setVerificationHint(`Check your inbox at ${result.email} for a verification link.`);
        setPendingVerificationEmail(result.email);
        setMode('login');
        return;
      }
      setAuth(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('error.fallback.authentication-failed');
      if (mode === 'login' && message === EMAIL_NOT_VERIFIED_MESSAGE) {
        setPendingVerificationEmail(payload.email);
      }
      setError(message);
    }
  }

  async function resendVerification() {
    if (!pendingVerificationEmail) return;
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const result = await apiRequest<{ message: string }>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: pendingVerificationEmail }),
      });
      setNotice(result.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('error.fallback.cannot-resend-the-verification-email'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await apiRequest<AuthState>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verificationToken.trim() }),
      });
      setVerificationToken('');
      setVerificationHint(null);
      setPendingVerificationEmail(null);
      setAuth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.verification-failed'));
    }
  }

  async function submitTwoFactorLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiRequest<AuthState>('/auth/2fa/verify-login', {
        method: 'POST',
        body: JSON.stringify({
          challengeToken: twoFactorChallenge,
          code: formText(new FormData(event.currentTarget), 'code').trim(),
        }),
      });
      setTwoFactorChallenge('');
      setAuth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.invalid-two-factor-code'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: formText(new FormData(event.currentTarget), 'email') }),
      });
      setNotice(result.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('error.fallback.cannot-request-a-password-reset'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: resetToken,
          password: formText(new FormData(event.currentTarget), 'password'),
        }),
      });
      setResetToken('');
      setMode('login');
      setNotice(t('notice.passwordUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-reset-password'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    auth,
    setAuth,
    mode,
    setMode,
    verificationToken,
    verificationHint,
    error,
    submitAuth,
    submitVerification,
    clearAuth,
    authScreen: {
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
      canResendVerification: Boolean(pendingVerificationEmail),
      resendVerification,
      oauthProviders: oauth.oauthProviders,
      startOAuth: oauth.startOAuth,
    },
  };
}
