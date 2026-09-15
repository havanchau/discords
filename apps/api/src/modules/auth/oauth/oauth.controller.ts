import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { RateLimit } from '../../../common/rate-limit.decorator';
import { OAuthExchangeDto } from '../dto/oauth-exchange.dto';
import { OAuthFlowError } from './oauth-providers';
import { OAUTH_FLOW_COOKIE, OAUTH_FLOW_TTL_MS, OAuthService } from './oauth.service';

const FIFTEEN_MINUTES_MS = 15 * 60_000;

/* Express parses repeated keys into arrays; only a single string value is accepted. */
function queryString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('providers')
  providers() {
    return this.oauth.enabledProviders();
  }

  @RateLimit({ keyPrefix: 'auth-oauth-exchange', limit: 20, windowMs: FIFTEEN_MINUTES_MS })
  @HttpCode(200)
  @Post('exchange')
  exchange(@Body() dto: OAuthExchangeDto, @Req() request: Request) {
    return this.oauth.exchangeLoginCode(dto.code, request.headers['user-agent']);
  }

  @RateLimit({ keyPrefix: 'auth-oauth-start', limit: 20, windowMs: FIFTEEN_MINUTES_MS })
  @Get(':provider')
  start(@Param('provider') providerParam: string, @Res() response: Response) {
    const { provider, credentials } = this.oauth.requireProvider(providerParam);
    const flow = this.oauth.startFlow(provider, credentials.clientId);
    response.cookie(OAUTH_FLOW_COOKIE, flow.cookieValue, {
      ...this.flowCookieOptions(),
      maxAge: OAUTH_FLOW_TTL_MS,
    });
    response.redirect(302, flow.authorizeUrl);
  }

  @RateLimit({ keyPrefix: 'auth-oauth-callback', limit: 20, windowMs: FIFTEEN_MINUTES_MS })
  @Get(':provider/callback')
  async callback(
    @Param('provider') providerParam: string,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const { provider, credentials } = this.oauth.requireProvider(providerParam);
    const cookieValue: unknown = request.cookies?.[OAUTH_FLOW_COOKIE];
    // The flow cookie is single use whatever the outcome.
    response.clearCookie(OAUTH_FLOW_COOKIE, this.flowCookieOptions());

    try {
      const oauthCode = await this.oauth.completeFlow(
        provider,
        credentials,
        {
          code: queryString(query.code),
          state: queryString(query.state),
          error: queryString(query.error),
        },
        typeof cookieValue === 'string' ? cookieValue : undefined,
      );
      response.redirect(302, this.oauth.webRedirectUrl({ oauthCode }));
    } catch (failure) {
      if (failure instanceof OAuthFlowError) {
        this.logger.warn(
          `OAuth ${provider} sign-in failed (${failure.reason}): ${failure.message}`,
        );
        response.redirect(302, this.oauth.webRedirectUrl({ oauthError: failure.reason }));
        return;
      }
      // Network errors, timeouts, and database failures: log the stack, tell the user it failed.
      this.logger.error(
        `OAuth ${provider} sign-in failed unexpectedly`,
        failure instanceof Error ? failure.stack : undefined,
      );
      response.redirect(302, this.oauth.webRedirectUrl({ oauthError: 'provider_error' }));
    }
  }

  /* Lax is required: the provider's redirect back is a cross-site top-level navigation. */
  private flowCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get<string>('NODE_ENV') === 'production',
      path: '/',
    };
  }
}
