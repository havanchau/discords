import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, type UserNoteResult } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { queryKeys } from '@/query/queryKeys';

interface UseUserNoteOptions {
  accessToken: string;
  viewerId: string;
  userId: string;
  /** The profile card mounts before it opens, and a note about yourself is not allowed. */
  enabled: boolean;
}

/**
 * The viewer's private note about `userId` (docs/features/user-notes.md). A save writes the
 * server's answer into the cache, so reopening the card shows it without a refetch.
 */
export function useUserNote({ accessToken, viewerId, userId, enabled }: UseUserNoteOptions) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.userNote(viewerId, userId);

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: () => apiRequest<UserNoteResult>(`/users/${userId}/note`, {}, accessToken),
  });

  const saveMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest<UserNoteResult>(
        `/users/${userId}/note`,
        { method: 'PUT', body: JSON.stringify({ content }) },
        accessToken,
      ),
    onSuccess: (result) => queryClient.setQueryData<UserNoteResult>(queryKey, result),
  });

  return {
    note: query.data?.note ?? null,
    isLoading: query.isLoading,
    loadError: query.error
      ? query.error instanceof Error
        ? query.error.message
        : t('profileCard.note.loadFailed')
      : null,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
