import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePersistentDraft, usePersistentDrafts } from './usePersistentDrafts';

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

  it('restores channel drafts and clears only after a successful send', async () => {
    const storageKey = 'channel-draft-test';
    const { result, unmount } = renderHook(() =>
      usePersistentDraft({ storageKey, draftKey: 'channel:general' }),
    );

    act(() => {
      result.current.setValue('draft for #general');
    });

    unmount();

    const restored = renderHook(() =>
      usePersistentDraft({ storageKey, draftKey: 'channel:general' }),
    );
    expect(restored.result.current.value).toBe('draft for #general');

    await act(async () => {
      const sent = await Promise.resolve(true);
      if (sent) restored.result.current.clear();
    });

    expect(restored.result.current.value).toBe('');
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it('preserves channel drafts when send fails', async () => {
    const storageKey = 'channel-failed-send-draft-test';
    const { result } = renderHook(() =>
      usePersistentDraft({ storageKey, draftKey: 'channel:general' }),
    );

    act(() => {
      result.current.setValue('still here after failure');
    });

    await act(async () => {
      const sent = await Promise.resolve(false);
      if (sent) result.current.clear();
    });

    expect(result.current.value).toBe('still here after failure');
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')).toEqual({
      'channel:general': 'still here after failure',
    });
  });

  it('restores DM drafts and clears only after a successful send', async () => {
    const storageKey = 'direct-draft-test';
    const { result, unmount } = renderHook(() =>
      usePersistentDraft({ storageKey, draftKey: 'conversation:friend' }),
    );

    act(() => {
      result.current.setValue('draft for a friend');
    });

    unmount();

    const restored = renderHook(() =>
      usePersistentDraft({ storageKey, draftKey: 'conversation:friend' }),
    );
    expect(restored.result.current.value).toBe('draft for a friend');

    await act(async () => {
      const sent = await Promise.resolve(true);
      if (sent) restored.result.current.clear();
    });

    expect(restored.result.current.value).toBe('');
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it('preserves DM drafts when send fails', async () => {
    const storageKey = 'direct-failed-send-draft-test';
    const { result } = renderHook(() =>
      usePersistentDraft({ storageKey, draftKey: 'conversation:friend' }),
    );

    act(() => {
      result.current.setValue('dm failure text');
    });

    await act(async () => {
      const sent = await Promise.resolve(false);
      if (sent) result.current.clear();
    });

    expect(result.current.value).toBe('dm failure text');
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')).toEqual({
      'conversation:friend': 'dm failure text',
    });
  });
});
