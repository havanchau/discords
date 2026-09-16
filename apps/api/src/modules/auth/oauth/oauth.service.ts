import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { defaultWebOrigin, primaryWebOrigin } from '@/common/web-origins';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { AuthService } from '@/modules/auth/auth.service';
import { OAuthAccountService } from './oauth-account.service';
import { oauthCredentials, oauthRedirectBaseUrl } from './oauth-config';
import {
  exchangeAuthorizationCode,
  isOAuthProviderName,
  OAUTH_PROVIDERS,
  OAuthErrorReason,
  OAuthFlowError,
  OAuthProviderName,
} from './oauth-providers';

export const OAUTH_FLOW_COOKIE = 'oauth_flow';
export const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;
const LOGIN_CODE_TTL_MS = 60 * 1000;

interface OAuthFlowState {
  provider: OAuthProviderName;
  state: string;
  codeVerifier: string;
}

function randomToken() {
  return randomBytes(32).toString('base64url');
}

function sha256(value: string, encoding: 'hex' | 'base64url') {
  return createHash('sha256').update(value).digest(encoding);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly accounts: OAuthAccountService,
  ) {}

  enabledProviders(): Record<OAuthProviderName, boolean> {
    return {
      google: Boolean(oauthCredentials(this.config, 'google')),
      facebook: Boolean(oauthCredentials(this.config, 'facebook')),
    };
  }

  /* Unknown and unconfigured providers look the same to the client. */
  requireProvider(value: string) {
    if (!isOAuthProviderName(value)) throw new NotFoundException();
    const credentials = oauthCredentials(this.config, value);
    if (!credentials) throw new NotFoundException();
    return { provider: value, credentials };
  }

  /* `state` binds the callback to this browser; PKCE binds the code to this flow. */
  startFlow(provider: OAuthProviderName, clientId: string) {
    const flow: OAuthFlowState = { provider, state: randomToken(), codeVerifier: randomToken() };
    const definition = OAUTH_PROVIDERS[provider];
    const url = new URL(definition.authorizeUrl);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      scope: definition.scope,
      state: flow.state,
      code_challenge: sha256(flow.codeVerifier, 'base64url'),
      code_challenge_method: 'S256',
      ...definition.extraAuthorizeParams,
    }).toString();

    return {
      authorizeUrl: url.toString(),
      cookieValue: Buffer.from(JSON.stringify(flow)).toString('base64url'),
    };
  }

  /* Returns the one-time login code for the web app. Throws OAuthFlowError for user-facing failures. */
  async completeFlow(
    provider: OAuthProviderName,
    credentials: { clientId: string; clientSecret: string },
    query: { code?: string; state?: string; error?: string },
    cookieValue: string | undefined,
  ) {
    if (query.error) {
      const reason: OAuthErrorReason =
        query.error === 'access_denied' ? 'cancelled' : 'provider_error';
      throw new OAuthFlowError(reason, `Provider returned error "${query.error}"`);
    }
    const flow = this.readFlowCookie(cookieValue);
    if (
      !flow ||
      flow.provider !== provider ||
      !query.state ||
      !safeEqual(flow.state, query.state)
    ) {
      throw new OAuthFlowError('invalid_state', 'OAuth state is missing or does not match');
    }
    if (!query.code) {
      throw new OAuthFlowError('provider_error', 'Provider callback has no authorization code');
    }

    const definition = OAUTH_PROVIDERS[provider];
    const accessToken = await exchangeAuthorizationCode(definition, {
      ...credentials,
      code: query.code,
      codeVerifier: flow.codeVerifier,
      redirectUri: this.redirectUri(provider),
    });
    const profile = await definition.fetchProfile(accessToken);
    const user = await this.accounts.resolveUser(provider, profile);
    return this.issueLoginCode(user.id);
  }

  async exchangeLoginCode(code: string, userAgent?: string) {
    const now = new Date();
    const loginCode = await this.prisma.oAuthLoginCode.findUnique({
      where: { codeHash: sha256(code, 'hex') },
      select: {
        id: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { id: true, twoFactorEnabledAt: true } },
      },
    });
    if (!loginCode || loginCode.usedAt || loginCode.expiresAt <= now) {
      throw new UnauthorizedException('Invalid or expired sign-in code');
    }
    // Claiming conditionally means two concurrent exchanges cannot both succeed.
    const claimed = await this.prisma.oAuthLoginCode.updateMany({
      where: { id: loginCode.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) throw new UnauthorizedException('Invalid or expired sign-in code');

    return this.auth.completeSignIn(loginCode.user, userAgent);
  }

  webRedirectUrl(params: { oauthCode: string } | { oauthError: OAuthErrorReason }) {
    const url = new URL(primaryWebOrigin(this.config.get<string>('WEB_ORIGIN', defaultWebOrigin)));
    url.search = new URLSearchParams(params).toString();
    return url.toString();
  }

  private redirectUri(provider: OAuthProviderName) {
    return `${oauthRedirectBaseUrl(this.config)}/auth/oauth/${provider}/callback`;
  }

  private async issueLoginCode(userId: string) {
    const code = randomToken();
    const now = new Date();
    await this.prisma.$transaction([
      // Keeps the table to live codes only; a user rarely has more than one.
      this.prisma.oAuthLoginCode.deleteMany({
        where: { userId, OR: [{ usedAt: { not: null } }, { expiresAt: { lte: now } }] },
      }),
      this.prisma.oAuthLoginCode.create({
        data: {
          userId,
          codeHash: sha256(code, 'hex'),
          expiresAt: new Date(now.getTime() + LOGIN_CODE_TTL_MS),
        },
      }),
    ]);
    return code;
  }

  private readFlowCookie(cookieValue: string | undefined): OAuthFlowState | null {
    if (!cookieValue) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(cookieValue, 'base64url').toString('utf8'));
    } catch {
      // A malformed cookie is treated like a missing one: the flow fails with invalid_state.
      return null;
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'provider' in parsed &&
      'state' in parsed &&
      'codeVerifier' in parsed &&
      typeof parsed.provider === 'string' &&
      isOAuthProviderName(parsed.provider) &&
      typeof parsed.state === 'string' &&
      typeof parsed.codeVerifier === 'string'
    ) {
      return { provider: parsed.provider, state: parsed.state, codeVerifier: parsed.codeVerifier };
    }
    return null;
  }
}
