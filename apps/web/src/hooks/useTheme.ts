import { useCallback, useEffect, useState } from 'react';
import type { UiTheme } from '../contexts/appContexts';

const THEME_KEY = 'discord-clone-ui-theme';
const THEMES: UiTheme[] = ['light', 'dark', 'system'];

/*
 * The previous design system shipped four dark variants. They collapse to `dark`; anything else
 * stored by an older build falls back to `system`. The resolved value is written back on first
 * render so the migration runs once per browser.
 */
const LEGACY_THEMES: Record<string, UiTheme> = {
  midnight: 'dark',
  slate: 'dark',
  oled: 'dark',
};

export function migrateStoredTheme(stored: string | null): UiTheme {
  if (stored && THEMES.includes(stored as UiTheme)) return stored as UiTheme;
  if (stored && stored in LEGACY_THEMES) return LEGACY_THEMES[stored];
  return 'system';
}

export function resolveTheme(theme: UiTheme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

function darkMediaQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
}

export function useTheme() {
  const [uiTheme, setUiTheme] = useState<UiTheme>(() =>
    migrateStoredTheme(localStorage.getItem(THEME_KEY)),
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(() => darkMediaQuery()?.matches ?? false);

  useEffect(() => {
    const query = darkMediaQuery();
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(uiTheme, prefersDark);
    localStorage.setItem(THEME_KEY, uiTheme);
  }, [uiTheme, prefersDark]);

  const selectTheme = useCallback((theme: UiTheme) => setUiTheme(theme), []);

  return { uiTheme, setUiTheme: selectTheme };
}
