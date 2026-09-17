import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nService } from './i18n/i18n.service';
import type { Locale } from './i18n/locale';
import { ERROR_MESSAGE_CODES, ERROR_MESSAGE_PREFIX_CODES } from './i18n/error-codes';
import type { RequestUser } from './request-user';

const VALIDATION_CODE = 'VALIDATION_FAILED';

/**
 * Translates error responses without touching the ~143 throw sites: the thrown English literal is
 * the lookup key. A literal edited without updating ERROR_MESSAGE_CODES degrades to English, which
 * npm run i18n:check reports.
 */
@Catch()
export class TranslatingExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TranslatingExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { user?: RequestUser }>();
    const response = http.getResponse<Response>();
    const locale = this.i18n.resolveRequestLocale(request, request.user?.locale);

    if (!(exception instanceof HttpException)) {
      // The real cause stays in the server log; the client gets a generic message.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: this.i18n.t(locale, 'INTERNAL_ERROR'),
      });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const rawMessage = typeof body === 'string' ? body : (body as { message?: unknown }).message;

    // class-validator returns an array of field errors; those come from DTO decorators, not from
    // the error-code map, so they pass through untranslated.
    if (Array.isArray(rawMessage)) {
      response
        .status(status)
        .json({ statusCode: status, code: VALIDATION_CODE, message: rawMessage });
      return;
    }

    const message = typeof rawMessage === 'string' ? rawMessage : exception.message;
    const code = resolveErrorCode(message);

    response.status(status).json({
      statusCode: status,
      code: code ?? null,
      message: translateErrorMessage(this.i18n, locale, message),
    });
  }
}

/** The stable code behind a thrown English literal, or null when the literal is not mapped. */
export function resolveErrorCode(message: string) {
  const exact = (ERROR_MESSAGE_CODES as Record<string, string>)[message];
  if (exact) return exact as Parameters<I18nService['t']>[1];

  const prefixed = ERROR_MESSAGE_PREFIX_CODES.find((entry) => message.startsWith(entry.prefix));
  return prefixed ? (prefixed.code as Parameters<I18nService['t']>[1]) : null;
}

/**
 * The thrown literal in `locale`; an unmapped literal stays English. Shared with socket acks, which
 * never pass through this filter.
 */
export function translateErrorMessage(i18n: I18nService, locale: Locale, message: string) {
  const code = resolveErrorCode(message);
  return code ? i18n.t(locale, code, { detail: detailOf(message, code) }) : message;
}

function detailOf(message: string, code: string) {
  const prefixed = ERROR_MESSAGE_PREFIX_CODES.find((entry) => entry.code === code);
  return prefixed ? message.slice(prefixed.prefix.length) : '';
}
