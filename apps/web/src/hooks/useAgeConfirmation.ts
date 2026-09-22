import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { apiRequest, type AuthState, type User } from '@/api';

interface UseAgeConfirmationOptions {
  auth: AuthState | null;
  setAuth: Dispatch<SetStateAction<AuthState | null>>;
}

/**
 * Records the caller's self-attested 18+ confirmation and stores the returned `ageConfirmedAt` on the
 * cached user, which is what lifts `AgeGate` (docs/features/age-restricted-channels.md). Errors are
 * left to the caller, which shows them on the gate.
 */
export function useAgeConfirmation({ auth, setAuth }: UseAgeConfirmationOptions) {
  const accessToken = auth?.accessToken;
  return useCallback(async () => {
    if (!accessToken) return;
    const result = await apiRequest<{ user: User }>(
      '/users/me/age-confirmation',
      { method: 'POST' },
      accessToken,
    );
    // Functional update: a token refresh during the request must not be overwritten.
    setAuth((current) =>
      current ? { ...current, user: { ...current.user, ...result.user } } : current,
    );
  }, [accessToken, setAuth]);
}
