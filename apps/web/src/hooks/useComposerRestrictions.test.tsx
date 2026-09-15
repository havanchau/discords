import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState, Channel, ServerDetail } from '../api';
import { useComposerRestrictions } from './useComposerRestrictions';

const auth: AuthState = {
  accessToken: 'token',
  refreshToken: 'refresh',
  user: { id: 'me', email: 'me@example.com', username: 'me', displayName: 'Me' },
};

const channel: Channel = {
  id: 'c1',
  serverId: 's1',
  name: 'general',
  type: 'TEXT',
  slowmodeSeconds: 10,
};

function server(member: Partial<ServerDetail['members'][number]> = {}): ServerDetail {
  return {
    id: 's1',
    name: 'Server',
    channels: [channel],
    roles: [],
    members: [{ id: 'm1', kind: 'MEMBER', user: auth.user, roles: [], ...member }],
  };
}

describe('useComposerRestrictions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('counts down slowmode after sending and clears when the window passes', () => {
    const { result } = renderHook(() =>
      useComposerRestrictions({ auth, server: server(), channel }),
    );

    act(() => result.current.markMessageSent('c1'));
    expect(result.current.restriction.retryAfterSeconds).toBe(10);

    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.restriction.retryAfterSeconds).toBe(6);

    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.restriction.retryAfterSeconds).toBe(0);
  });

  it('lets members who manage messages bypass slowmode', () => {
    const moderator = server({
      roles: [{ role: { id: 'r1', name: 'Mod', permissions: ['MANAGE_MESSAGES'] } }],
    });
    const { result } = renderHook(() =>
      useComposerRestrictions({ auth, server: moderator, channel }),
    );

    act(() => result.current.markMessageSent('c1'));

    expect(result.current.restriction.slowmodeSeconds).toBe(0);
    expect(result.current.restriction.retryAfterSeconds).toBe(0);
  });

  it('disables the composer until an active timeout expires', () => {
    const timedOut = server({ timeoutUntil: '2026-09-15T12:00:05.000Z' });
    const { result } = renderHook(() =>
      useComposerRestrictions({ auth, server: timedOut, channel }),
    );

    expect(result.current.restriction.disabledReason).toMatch(/timed out/);

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.restriction.disabledReason).toBeNull();
  });
});
