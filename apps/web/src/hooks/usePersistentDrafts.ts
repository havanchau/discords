import { useCallback, useMemo, useState } from 'react';

type DraftMap = Record<string, string>;

interface UsePersistentDraftsOptions {
  storageKey: string;
}

interface UsePersistentDraftOptions extends UsePersistentDraftsOptions {
  draftKey: string | null | undefined;
}

function readDrafts(storageKey: string): DraftMap {
  if (typeof window === 'undefined') return {};

  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return {};
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, draft]) => typeof draft === 'string'),
    ) as DraftMap;
  } catch {
    return {};
  }
}

function writeDrafts(storageKey: string, drafts: DraftMap) {
  if (typeof window === 'undefined') return;

  try {
    const trimmedDrafts = Object.fromEntries(
      Object.entries(drafts).filter(([, value]) => value.length > 0),
    );
    if (Object.keys(trimmedDrafts).length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(trimmedDrafts));
  } catch {
    // Draft persistence is best-effort; sending messages must not depend on storage.
  }
}

export function usePersistentDrafts({ storageKey }: UsePersistentDraftsOptions) {
  const [drafts, setDrafts] = useState<DraftMap>(() => readDrafts(storageKey));

  const updateDraft = useCallback(
    (draftKey: string | null | undefined, value: string) => {
      if (!draftKey) return;
      setDrafts((current) => {
        const next = { ...current };
        if (value.length > 0) {
          next[draftKey] = value;
        } else {
          delete next[draftKey];
        }
        writeDrafts(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const clearDraft = useCallback(
    (draftKey: string | null | undefined) => {
      if (!draftKey) return;
      updateDraft(draftKey, '');
    },
    [updateDraft],
  );

  return useMemo(
    () => ({
      drafts,
      getDraft: (draftKey: string | null | undefined) => (draftKey ? drafts[draftKey] ?? '' : ''),
      updateDraft,
      clearDraft,
    }),
    [clearDraft, drafts, updateDraft],
  );
}

export function usePersistentDraft({ draftKey, storageKey }: UsePersistentDraftOptions) {
  const drafts = usePersistentDrafts({ storageKey });

  return useMemo(
    () => ({
      value: drafts.getDraft(draftKey),
      setValue: (value: string) => drafts.updateDraft(draftKey, value),
      clear: () => drafts.clearDraft(draftKey),
    }),
    [draftKey, drafts],
  );
}
