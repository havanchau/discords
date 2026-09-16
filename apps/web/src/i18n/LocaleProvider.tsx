import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Catalog,
  Locale,
  TranslationVars,
  defaultLocale,
  parseLocale,
  translate,
} from '@discord-clone/shared';
import { setRequestLocale } from '@/api';
import { en } from './locales/en';
import { vi } from './locales/vi';

export const LOCALE_KEY = 'discord-clone-locale';

export type MessageKey = keyof typeof en;

const catalog = { en, vi } as Catalog<MessageKey>;

export type Translate = (key: MessageKey, vars?: TranslationVars) => string;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Browser choice before sign-in; the stored account locale takes over once it loads. */
export function readInitialLocale(): Locale {
  let stored: string | null;
  try {
    stored = localStorage.getItem(LOCALE_KEY);
  } catch {
    // Private windows and blocked site data throw here; fall through to the browser language.
    stored = null;
  }
  return parseLocale(stored) ?? parseLocale(navigator.language) ?? defaultLocale;
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    setRequestLocale(locale);
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // A browser with site data blocked still renders; the choice just does not survive a reload.
    }
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key, vars) => translate(catalog, locale, key, vars),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider');
  return context;
}

export function useTranslation(): Translate {
  return useLocale().t;
}

/** Keeps the provider in step with the locale stored on the signed-in account. */
export function useSyncAccountLocale(accountLocale: string | null | undefined) {
  const { locale, setLocale } = useLocale();
  const resolved = parseLocale(accountLocale);

  const apply = useCallback(() => {
    if (resolved && resolved !== locale) setLocale(resolved);
  }, [resolved, locale, setLocale]);

  useEffect(apply, [apply]);
}
