import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { apiRequest, CreateSavedMessageInput, SavedMessage } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

interface SavedMessagesResult {
  savedMessages: SavedMessage[];
}

const noSavedMessages: SavedMessage[] = [];

export function savedMessageKey(sourceType: SavedMessage['sourceType'], messageId: string) {
  return `${sourceType}:${messageId}`;
}

/**
 * The signed-in user's saved messages. Save and remove write their answer into the cache, so every
 * message row and the Saved Messages list read one copy without refetching.
 */
export function useSavedMessages({ enabled = true }: { enabled?: boolean } = {}) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.savedMessages(auth?.user.id ?? 'anonymous');

  const query = useQuery({
    queryKey,
    enabled: Boolean(token) && enabled,
    queryFn: () => apiRequest<SavedMessagesResult>('/saved-messages', {}, token),
  });

  const savedMessages = query.data?.savedMessages ?? noSavedMessages;
  const bySourceMessage = useMemo(
    () =>
      new Map(
        savedMessages.map((item) => [
          savedMessageKey(item.sourceType, item.originalMessageId),
          item,
        ]),
      ),
    [savedMessages],
  );

  const writeCache = useCallback(
    (update: (current: SavedMessage[]) => SavedMessage[]) => {
      queryClient.setQueryData<SavedMessagesResult>(queryKey, (current) => ({
        savedMessages: update(current?.savedMessages ?? []),
      }));
    },
    [queryClient, queryKey],
  );

  const saveMutation = useMutation({
    mutationFn: (input: CreateSavedMessageInput) =>
      apiRequest<{ savedMessage: SavedMessage }>(
        '/saved-messages',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: ({ savedMessage }) =>
      writeCache((current) => [
        savedMessage,
        ...current.filter((item) => item.id !== savedMessage.id),
      ]),
  });

  const removeMutation = useMutation({
    mutationFn: (savedMessageId: string) =>
      apiRequest<{ ok: true }>(`/saved-messages/${savedMessageId}`, { method: 'DELETE' }, token),
    onSuccess: (_result, savedMessageId) =>
      writeCache((current) => current.filter((item) => item.id !== savedMessageId)),
  });

  return {
    savedMessages,
    bySourceMessage,
    isLoading: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    save: saveMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    isMutating: saveMutation.isPending || removeMutation.isPending,
  };
}
