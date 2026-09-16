import { useEffect, useState } from 'react';
import { apiRequest, AuthState, OAuthProviderName, oauthStartUrl } from '../api';
import { useTranslation } from '../i18n/LocaleProvider';

export interface TwoFactorRequiredResponse {
  twoFactorRequired: true;
  challengeToken: string;
}

export type OAuthProviderAvailability = Record<OAuthProviderName, boolean> | 'unavailable';

// Reasons come from the API's OAUTH_ERROR_REASONS (apps/api/src/modules/auth/oauth/oauth-providers.ts).
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  invalid_state: 'Sign-in expired or was started in another tab. Try again.',
  provider_error: 'Could not sign in with that provider. Try again later.',
  email_required: 'Sign-in needs a verified email address shared by the provider.',
  account_exists: 'An account with this email already exists. Sign in with your password.',
};

interface UseOAuthSignInOptions {
  isSignedOut: boolean;
  onSignedIn: (auth: AuthState) => void;
  onTwoFactorRequired: (challengeToken: string) => void;
  onError: (message: string) => void;
}

export function useOAuthSignIn({
  isSignedOut,
  onSignedIn,
  onTwoFactorRequired,
  onError,
}: UseOAuthSignInOptions) {
  const t = useTranslation();
  const [providers, setProviders] = useState<OAuthProviderAvailability>({
    google: false,
    facebook: false,
  });

  useEffect(() => {
    if (!isSignedOut) return;
    let cancelled = false;
    async function loadProviders() {
      try {
        const result =
          await apiRequest<Record<OAuthProviderName, boolean>>('/auth/oauth/providers');
        if (!cancelled) setProviders(result);
      } catch {
        // Password sign-in still works; the buttons explain that providers could not be loaded.
        if (!cancelled) setProviders('unavailable');
      }
    }
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, [isSignedOut]);

  // The API redirects back to the web root with either a one-time code or a fixed error reason.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('oauthCode');
    const reason = params.get('oauthError');
    if (!code && !reason) return;
    // Strip the code before anything else so it never stays in the address bar or history.
    window.history.replaceState({}, '', window.location.pathname);

    if (reason) {
      onError(OAUTH_ERROR_MESSAGES[reason] ?? OAUTH_ERROR_MESSAGES.provider_error);
      return;
    }
    async function exchangeCode(oauthCode: string) {
      try {
        const result = await apiRequest<AuthState | TwoFactorRequiredResponse>(
          '/auth/oauth/exchange',
          {
            method: 'POST',
            body: JSON.stringify({ code: oauthCode }),
          },
        );
        if ('twoFactorRequired' in result) {
          onTwoFactorRequired(result.challengeToken);
          return;
        }
        onSignedIn(result);
      } catch (err) {
        onError(err instanceof Error ? err.message : t('error.fallback.sign-in-failed'));
      }
    }
    if (code) void exchangeCode(code);
    // Re-runs are harmless: the parameters were removed from the URL on the first run.
  }, [onError, onSignedIn, onTwoFactorRequired]);

  return {
    oauthProviders: providers,
    startOAuth: (provider: OAuthProviderName) => window.location.assign(oauthStartUrl(provider)),
  };
}
