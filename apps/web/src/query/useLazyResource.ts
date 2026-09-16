import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

interface LazyResourceOptions<T> {
  /** Built from the id the caller asks for, so two ids never share a cache entry. */
  buildKey: (id: string) => QueryKey;
  fetch: (id: string) => Promise<T>;
  enabled?: boolean;
}

/**
 * A settings panel loads its data when it opens, not when the app starts. This keeps that imperative
 * `load(id)` shape while the result lives in the query cache: reopening the panel is free, and a
 * slow response for a previous id can no longer overwrite the current one, because the id is in the
 * key rather than in a ref the handler has to check.
 */
export function useLazyResource<T>({ buildKey, fetch, enabled = true }: LazyResourceOptions<T>) {
  const queryClient = useQueryClient();
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const queryKey = buildKey(requestedId ?? 'none');

  const { data, isFetching } = useQuery({
    queryKey,
    enabled: enabled && requestedId !== null,
    queryFn: () => fetch(requestedId as string),
  });

  const load = useCallback(
    async (id: string) => {
      setRequestedId(id);
      await queryClient.refetchQueries({ queryKey: buildKey(id) });
    },
    [queryClient, buildKey],
  );

  const write = useCallback(
    (update: (current: T | undefined) => T | undefined) => {
      queryClient.setQueryData<T>(queryKey, update);
    },
    [queryClient, queryKey],
  );

  return { data, isFetching, load, write };
}
