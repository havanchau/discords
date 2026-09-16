import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest, type AuthSessionEntry } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { queryKeys } from '@/query/queryKeys';

interface UseSessionsOptions {
  accessToken: string;
  onCurrentSessionRevoked: () => void;
}

interface SessionsResult {
  sessions: AuthSessionEntry[];
}

const noSessions: AuthSessionEntry[] = [];

export function useSessions({ accessToken, onCurrentSessionRevoked }: UseSessionsOptions) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.sessions(accessToken ? 'me' : 'anonymous');
  const [error, setError] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiRequest<SessionsResult>('/auth/sessions', {}, accessToken),
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest(`/auth/sessions/${sessionId}`, { method: 'DELETE' }, accessToken),
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => apiRequest('/auth/sessions/revoke-others', { method: 'POST' }, accessToken),
  });

  async function revokeSession(session: AuthSessionEntry) {
    setPendingSessionId(session.id);
    setError(null);
    try {
      await revokeMutation.mutateAsync(session.id);
      if (session.current) {
        onCurrentSessionRevoked();
        return;
      }
      queryClient.setQueryData<SessionsResult>(queryKey, (current) =>
        current ? { sessions: current.sessions.filter((item) => item.id !== session.id) } : current,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('error.fallback.cannot-sign-out-that-device'),
      );
    } finally {
      setPendingSessionId(null);
    }
  }

  async function revokeOtherSessions() {
    setPendingSessionId('others');
    setError(null);
    try {
      await revokeOthersMutation.mutateAsync();
      queryClient.setQueryData<SessionsResult>(queryKey, (current) =>
        current ? { sessions: current.sessions.filter((item) => item.current) } : current,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('error.fallback.cannot-sign-out-other-devices'),
      );
    } finally {
      setPendingSessionId(null);
    }
  }

  return {
    sessions: data?.sessions ?? noSessions,
    isLoading,
    error,
    pendingSessionId,
    revokeSession,
    revokeOtherSessions,
  };
}
