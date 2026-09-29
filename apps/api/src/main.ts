import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { createGlobalRateLimitMiddleware } from './common/global-rate-limit.middleware';
import { RedisFixedWindowLimiter } from './common/redis-fixed-window-limiter';
import { readLimitsConfig } from './common/limits-config';
import { I18nService } from './common/i18n/i18n.service';
import { TranslatingExceptionFilter } from './common/http-exception.filter';
import { assertOAuthConfigured } from './modules/auth/oauth/oauth-config';
import { assertWorkflowSecretKeyConfigured } from './common/config/workflow-secret-config';
import { assertTwoFactorKeyConfigured } from './modules/auth/two-factor-config';
import { defaultWebOrigin, isAllowedWebOrigin, parseWebOrigins } from './common/web-origins';

// Slow-client (slowloris) protection; keep-alive outlives the usual 60s load balancer idle timeout.
const HTTP_HEADERS_TIMEOUT_MS = 20_000;
const HTTP_REQUEST_TIMEOUT_MS = 120_000;
const HTTP_KEEP_ALIVE_TIMEOUT_MS = 65_000;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const webOrigins = parseWebOrigins(config.get<string>('WEB_ORIGIN', defaultWebOrigin));
  const jwtSecret = config.get<string>('JWT_SECRET', 'dev-secret-change-me');
  const uploadsDir = join(process.cwd(), 'uploads');

  if (config.get<string>('NODE_ENV') === 'production' && jwtSecret === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a non-default value in production');
  }
  assertTwoFactorKeyConfigured(config);
  assertWorkflowSecretKeyConfigured(config);
  assertOAuthConfigured(config);
  const limits = readLimitsConfig(config);

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  app.set('trust proxy', limits.trustProxyHops);
  app.use(
    createGlobalRateLimitMiddleware(
      app.get(RedisFixedWindowLimiter),
      limits.globalRequestsPerMinute,
    ),
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(cookieParser());
  const uploadsStatic = express.static(uploadsDir, {
    dotfiles: 'deny',
    fallthrough: false,
    index: false,
    setHeaders: (response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Cache-Control', 'private, max-age=3600');
    },
  });
  app.use('/uploads', (request: Request, response: Response, next: NextFunction) => {
    if (request.method === 'GET' || request.method === 'HEAD') {
      uploadsStatic(request, response, next);
      return;
    }
    next();
  });
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (isAllowedWebOrigin(origin, webOrigins)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  });
  app.useGlobalFilters(new TranslatingExceptionFilter(app.get(I18nService)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = config.get<number>('PORT', 3000);
  const httpServer = app.getHttpServer();
  httpServer.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
  httpServer.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
  httpServer.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
  await app.listen(port);
}

void bootstrap();
