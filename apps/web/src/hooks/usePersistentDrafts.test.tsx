import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePersistentDrafts } from './usePersistentDrafts';

describe('usePersistentDrafts', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores, restores, and clears drafts by key', () => {
    const storageKey = 'draft-test';
    const { result, unmount } = renderHook(() => usePersistentDrafts({ storageKey }));

    act(() => {
      result.current.updateDraft('channel:1', 'hello world');
      result.current.updateDraft('conversation:2', 'hi dm');
    });

    expect(result.current.getDraft('channel:1')).toBe('hello world');
    expect(result.current.getDraft('conversation:2')).toBe('hi dm');

    unmount();

    const restored = renderHook(() => usePersistentDrafts({ storageKey }));
    expect(restored.result.current.getDraft('channel:1')).toBe('hello world');

    act(() => {
      restored.result.current.clearDraft('channel:1');
    });

    expect(restored.result.current.getDraft('channel:1')).toBe('');
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')).toEqual({
      'conversation:2': 'hi dm',
    });
  });
});
