/**
 * API-side mirror of `packages/shared/src/i18n.ts`. The shared package is ESM-only while the API
 * builds to CommonJS, so the API keeps its own copy of shared contracts — the same arrangement as
 * `modules/permissions/channel-permission.ts` and `packages/shared/src/permissions.ts`.
 * Any change here must land in the shared file too.
 */
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
      const quality = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
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
