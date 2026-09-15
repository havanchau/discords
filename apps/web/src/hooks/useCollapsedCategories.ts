import { useCallback, useState } from 'react';

const STORAGE_KEY = 'discord-clone-collapsed-categories';

function readCollapsedIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // Unreadable or blocked storage falls back to every category expanded.
    return [];
  }
}

function writeCollapsedIds(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Collapse state is a per-browser convenience; the sidebar works without persisting it.
  }
}

export function useCollapsedCategories() {
  const [collapsedIds, setCollapsedIds] = useState<string[]>(readCollapsedIds);

  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedIds((current) => {
      const next = current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];
      writeCollapsedIds(next);
      return next;
    });
  }, []);

  return { collapsedIds, toggleCategory };
}
