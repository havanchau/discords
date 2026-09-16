export const locales = ['en', 'vi'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Accepts a bare tag ('vi'), a regional tag ('vi-VN'), or an Accept-Language list. */
export function parseLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;

  const candidates = value
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      return { tag: tag.trim().toLowerCase(), quality: quality ? Number(quality.slice(2)) : 1 };
    })
    .filter((candidate) => candidate.tag.length > 0 && Number.isFinite(candidate.quality))
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    const base = candidate.tag.split('-')[0];
    if (isLocale(base)) return base;
  }

  return null;
}

export type TranslationVars = Record<string, string | number>;

export type Catalog<Key extends string> = Record<Locale, Record<Key, string>>;

/**
 * Substitutes `{name}` placeholders. Falls back to the default locale, then to the key itself so a
 * caller never renders `undefined`; a missing key is a bug the i18n:check script is meant to catch.
 */
export function translate<Key extends string>(
  catalog: Catalog<Key>,
  locale: Locale,
  key: Key,
  vars?: TranslationVars,
): string {
  const template = catalog[locale]?.[key] ?? catalog[defaultLocale]?.[key] ?? key;
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Picks between `one` and `other` forms using the runtime's plural rules. */
export function plural(locale: Locale, count: number, one: string, other: string): string {
  return new Intl.PluralRules(locale).select(count) === 'one' ? one : other;
}
