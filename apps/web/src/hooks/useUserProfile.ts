import { useCallback, useEffect, useState } from 'react';
import { apiRequest, type UserProfile } from '../api';
import { useTranslation } from '../i18n/LocaleProvider';

interface UseUserProfileOptions {
  accessToken: string;
  userId: string | null;
  serverId?: string | null;
  /** The card mounts before it opens; nothing is fetched until this is true. */
  enabled: boolean;
}

// Cards reopen constantly while browsing a member list, so a resolved profile is kept for the
// session. It is cleared by a reload, which is the same lifetime as the rest of the workspace state.
const cache = new Map<string, UserProfile>();

function cacheKey(userId: string, serverId?: string | null) {
  return `${userId}::${serverId ?? ''}`;
}

export function useUserProfile({ accessToken, userId, serverId, enabled }: UseUserProfileOptions) {
  const t = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const key = cacheKey(userId, serverId);
    const cached = cache.get(key);
    if (cached) {
      setProfile(cached);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : '';
      const result = await apiRequest<{ profile: UserProfile }>(
        `/users/${userId}/profile${query}`,
        {},
        accessToken,
      );
      cache.set(key, result.profile);
      setProfile(result.profile);
    } catch (err) {
      setProfile(null);
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-load-profile'));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, userId, serverId, t]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { profile, isLoading, error, reload: load };
}

/** Called after a profile write so the next card open shows the new values. */
export function invalidateUserProfile(userId: string) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${userId}::`)) cache.delete(key);
  }
}
