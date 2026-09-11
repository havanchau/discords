import { useEffect, useState } from 'react';

/**
 * Subscribes to a media query. Use it when a breakpoint has to change what is *rendered* rather
 * than how it looks — hiding a menu item with CSS still leaves it in the menu's focus order.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
