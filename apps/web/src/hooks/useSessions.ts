import { useCallback, useEffect, useState } from 'react';
import { apiRequest, type AuthSessionEntry } from '../api';
import { useTranslation } from '../i18n/LocaleProvider';

interface UseSessionsOptions {
  accessToken: string;
  onCurrentSessionRevoked: () => void;
}

export function useSessions({ accessToken, onCurrentSessionRevoked }: UseSessionsOptions) {
  const t = useTranslation();
  const [sessions, setSessions] = useState<AuthSessionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ sessions: AuthSessionEntry[] }>(
        '/auth/sessions',
        {},
        accessToken,
      );
      setSessions(result.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-load-devices'));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function revokeSession(session: AuthSessionEntry) {
    setPendingSessionId(session.id);
    setError(null);
    try {
      await apiRequest(`/auth/sessions/${session.id}`, { method: 'DELETE' }, accessToken);
      if (session.current) {
        onCurrentSessionRevoked();
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-sign-out-that-device'));
    } finally {
      setPendingSessionId(null);
    }
  }

  async function revokeOtherSessions() {
    setPendingSessionId('others');
    setError(null);
    try {
      await apiRequest('/auth/sessions/revoke-others', { method: 'POST' }, accessToken);
      setSessions((current) => current.filter((item) => item.current));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-sign-out-other-devices'));
    } finally {
      setPendingSessionId(null);
    }
  }

  return { sessions, isLoading, error, pendingSessionId, revokeSession, revokeOtherSessions };
}
