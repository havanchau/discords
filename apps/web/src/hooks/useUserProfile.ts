import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiRequest, type UserProfile } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { queryKeys } from '@/query/queryKeys';

interface UseUserProfileOptions {
  accessToken: string;
  userId: string | null;
  serverId?: string | null;
  /** The card mounts before it opens; nothing is fetched until this is true. */
  enabled: boolean;
}

/**
 * Cards reopen constantly while browsing a member list, so a resolved profile stays in the query
 * cache rather than in a module-level map: it is then scoped to the app instance and invalidated
 * through the same mechanism as every other cached read.
 */
export function useUserProfile({ accessToken, userId, serverId, enabled }: UseUserProfileOptions) {
  const t = useTranslation();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.userProfile(userId ?? 'none', serverId ?? null),
    enabled: enabled && Boolean(userId),
    queryFn: () => {
      const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : '';
      return apiRequest<{ profile: UserProfile }>(
        `/users/${userId}/profile${query}`,
        {},
        accessToken,
      );
    },
  });

  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    profile: data?.profile ?? null,
    isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : t('error.fallback.cannot-load-profile')
      : null,
    reload,
  };
}

/** Called after a profile write so the next card open shows the new values. */
export function useInvalidateUserProfile() {
  const queryClient = useQueryClient();
  return useCallback(
    (userId: string) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.userProfilesOf(userId) });
    },
    [queryClient],
  );
}
