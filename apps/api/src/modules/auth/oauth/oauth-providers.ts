import { OAuthProvider } from '@prisma/client';
import { z } from 'zod';

export const OAUTH_PROVIDER_NAMES = ['google', 'facebook'] as const;
export type OAuthProviderName = (typeof OAUTH_PROVIDER_NAMES)[number];

export const OAUTH_ERROR_REASONS = [
  'cancelled',
  'invalid_state',
  'provider_error',
  'email_required',
  'account_exists',
] as const;
export type OAuthErrorReason = (typeof OAUTH_ERROR_REASONS)[number];

/* A failure the user is told about through a fixed reason; the message goes to the server log only. */
export class OAuthFlowError extends Error {
  constructor(
    readonly reason: OAuthErrorReason,
    message: string,
  ) {
    super(message);
  }
}

export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

interface ProviderDefinition {
  prismaProvider: OAuthProvider;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdKey: string;
  clientSecretKey: string;
  extraAuthorizeParams: Record<string, string>;
  fetchProfile: (accessToken: string) => Promise<OAuthProfile>;
}

const PROVIDER_TIMEOUT_MS = 10_000;
const FACEBOOK_GRAPH_VERSION = 'v21.0';

const tokenResponseSchema = z.object({ access_token: z.string().min(1) });

const googleProfileSchema = z.object({
  sub: z.string().min(1),
  email: z.email().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

const facebookProfileSchema = z.object({
  id: z.string().min(1),
  email: z.email().optional(),
  name: z.string().optional(),
});

async function fetchProviderJson<T>(url: string, init: RequestInit, schema: z.ZodType<T>) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  if (!response.ok) {
    throw new OAuthFlowError(
      'provider_error',
      `Provider request failed with status ${response.status}`,
    );
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new OAuthFlowError('provider_error', 'Provider response has an unexpected shape');
  }
  return parsed.data;
}

export const OAUTH_PROVIDERS: Record<OAuthProviderName, ProviderDefinition> = {
  google: {
    prismaProvider: OAuthProvider.GOOGLE,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    clientIdKey: 'GOOGLE_CLIENT_ID',
    clientSecretKey: 'GOOGLE_CLIENT_SECRET',
    extraAuthorizeParams: { prompt: 'select_account' },
    fetchProfile: async (accessToken) => {
      const profile = await fetchProviderJson(
        'https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { Authorization: `Bearer ${accessToken}` } },
        googleProfileSchema,
      );
      return {
        providerAccountId: profile.sub,
        email: profile.email ?? null,
        emailVerified: profile.email_verified === true,
        name: profile.name ?? null,
      };
    },
  },
  facebook: {
    prismaProvider: OAuthProvider.FACEBOOK,
    authorizeUrl: `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`,
    scope: 'email public_profile',
    clientIdKey: 'FACEBOOK_APP_ID',
    clientSecretKey: 'FACEBOOK_APP_SECRET',
    extraAuthorizeParams: {},
    fetchProfile: async (accessToken) => {
      const profile = await fetchProviderJson(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me?fields=id,name,email`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        facebookProfileSchema,
      );
      // Facebook only returns confirmed emails but does not say so; account linking treats it as unproven.
      return {
        providerAccountId: profile.id,
        email: profile.email ?? null,
        emailVerified: Boolean(profile.email),
        name: profile.name ?? null,
      };
    },
  },
};

/* Code exchange is not retried: an authorization code is single use, so a retry can only fail. */
export async function exchangeAuthorizationCode(
  provider: ProviderDefinition,
  params: {
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  },
) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  const token = await fetchProviderJson(
    provider.tokenUrl,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    tokenResponseSchema,
  );
  return token.access_token;
}

export function isOAuthProviderName(value: string): value is OAuthProviderName {
  return (OAUTH_PROVIDER_NAMES as readonly string[]).includes(value);
}
