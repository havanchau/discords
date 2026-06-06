import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest, AuthState, configureAuthRefresh } from '../api';
import { AUTH_KEY } from '../helpers';

interface UseAuthSessionOptions {
  onClearAuth: () => void;
}

export function useAuthSession({ onClearAuth }: UseAuthSessionOptions) {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationHint, setVerificationHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setVerificationHint('Email token loaded. Confirm verification to continue.');
      setMode('login');
      window.history.replaceState({}, '', '/');
    }
  }, []);

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
      email: String(form.get('email')),
      username: String(form.get('username') || ''),
      displayName: String(form.get('displayName') || ''),
      password: String(form.get('password')),
    };

    try {
      const result = await apiRequest<AuthState>(
        mode === 'login' ? '/auth/login' : '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(
            mode === 'login' ? { email: payload.email, password: payload.password } : payload,
          ),
        },
      );
      if ('verificationRequired' in result) {
        const verification = result as AuthState & { verificationToken?: string; message?: string };
        setVerificationHint(verification.message || 'Check your email to verify this account.');
        if (verification.verificationToken) {
          setVerificationToken(verification.verificationToken);
        }
        setMode('login');
        return;
      }
      setAuth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
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
      setAuth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  return {
    auth,
    setAuth,
    mode,
    setMode,
    verificationToken,
    verificationHint,
    setVerificationToken,
    error,
    submitAuth,
    submitVerification,
    clearAuth,
  };
}
