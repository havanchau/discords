import type { KeyboardEvent } from 'react';

export function handleListKeyboardNavigation(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
    return;
  }

  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  );

  if (!buttons.length) return;

  const currentIndex = buttons.findIndex((button) => button === document.activeElement);
  const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowDown'
          ? Math.min(fallbackIndex + 1, buttons.length - 1)
          : Math.max(fallbackIndex - 1, 0);

  event.preventDefault();
  buttons[nextIndex]?.focus();
}
