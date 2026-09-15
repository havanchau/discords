import { ConfigService } from '@nestjs/config';
import { OAUTH_PROVIDER_NAMES, OAUTH_PROVIDERS, OAuthProviderName } from './oauth-providers';

// Local development reaches the API through the Vite proxy, so the callback shares the web origin.
const DEV_OAUTH_REDIRECT_BASE_URL = 'http://localhost:5173/api';

export function oauthCredentials(config: ConfigService, provider: OAuthProviderName) {
  const definition = OAUTH_PROVIDERS[provider];
  const clientId = config.get<string>(definition.clientIdKey);
  const clientSecret = config.get<string>(definition.clientSecretKey);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function oauthRedirectBaseUrl(config: ConfigService) {
  return config
    .get<string>('OAUTH_REDIRECT_BASE_URL', DEV_OAUTH_REDIRECT_BASE_URL)
    .replace(/\/+$/, '');
}

/** Called at startup: in production a configured provider needs an explicit public callback base. */
export function assertOAuthConfigured(config: ConfigService) {
  if (config.get<string>('NODE_ENV') !== 'production') return;
  const anyProvider = OAUTH_PROVIDER_NAMES.some((provider) => oauthCredentials(config, provider));
  if (anyProvider && !config.get<string>('OAUTH_REDIRECT_BASE_URL')) {
    throw new Error(
      'OAUTH_REDIRECT_BASE_URL must be set in production when an OAuth provider is configured',
    );
  }
}
