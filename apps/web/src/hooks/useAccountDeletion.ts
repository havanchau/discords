import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest, type AccountDeletionScheduledResult } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';

interface DeletionInput {
  password: string;
  code?: string;
}

export function useAccountDeletion(accessToken: string) {
  const t = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: DeletionInput) =>
      apiRequest<AccountDeletionScheduledResult>(
        '/users/me/delete',
        { method: 'POST', body: JSON.stringify(input) },
        accessToken,
      ),
  });

  /** On success every session is already revoked; the caller signs out after showing the date. */
  async function requestDeletion(password: string, code: string) {
    setError(null);
    try {
      const result = await mutation.mutateAsync(code ? { password, code } : { password });
      setScheduledAt(result.scheduledAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-delete-account'));
    }
  }

  return { error, scheduledAt, isBusy: mutation.isPending, requestDeletion };
}
