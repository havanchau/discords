import { useEffect, useState } from 'react';
import { UiTheme } from '../contexts/appContexts';

const THEME_KEY = 'discord-clone-ui-theme';
const themes: UiTheme[] = ['dark', 'midnight', 'slate', 'oled'];

export function useTheme() {
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    return themes.includes(savedTheme as UiTheme) ? (savedTheme as UiTheme) : 'dark';
  });

  useEffect(() => {
    document.body.dataset.theme = uiTheme;
    localStorage.setItem(THEME_KEY, uiTheme);
  }, [uiTheme]);

  return { uiTheme, setUiTheme };
}
