import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Catalog, Locale, TranslationVars, defaultLocale, parseLocale, translate } from './locale';
import { enApiMessages } from './locales/en';
import { viApiMessages } from './locales/vi';

export type ApiMessageKey = keyof typeof enApiMessages;

const catalog = { en: enApiMessages, vi: viApiMessages } as Catalog<ApiMessageKey>;

@Injectable()
export class I18nService {
  t(locale: Locale, key: ApiMessageKey, vars?: TranslationVars): string {
    return translate(catalog, locale, key, vars);
  }

  has(key: string): key is ApiMessageKey {
    return key in enApiMessages;
  }

  /**
   * The explicit header is the user's in-app choice, which beats both the stored column (it may be
   * stale in this tab) and the browser's Accept-Language (it is the machine, not the choice).
   */
  resolveRequestLocale(request: Request | undefined, storedLocale?: string | null): Locale {
    return (
      parseLocale(headerValue(request, 'x-locale')) ??
      parseLocale(storedLocale) ??
      parseLocale(headerValue(request, 'accept-language')) ??
      defaultLocale
    );
  }

  resolveUserLocale(storedLocale?: string | null): Locale {
    return parseLocale(storedLocale) ?? defaultLocale;
  }
}

function headerValue(request: Request | undefined, name: string): string | null {
  const value = request?.headers?.[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
