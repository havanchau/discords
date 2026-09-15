import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import type { CallState } from '../helpers';
import { useDirectCall } from './useDirectCall';

type Handler = (payload: never) => void;

function createSocketMock(ringAck: { ok: boolean } = { ok: true }) {
  const handlers = new Map<string, Handler>();
  const timeoutEmit = vi.fn(
    (_event: string, _payload: unknown, callback: (err: Error | null, result?: unknown) => void) =>
      callback(null, ringAck),
  );
  const socket = {
    on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    off: vi.fn((event: string) => handlers.delete(event)),
    emit: vi.fn(),
    timeout: vi.fn(() => ({ emit: timeoutEmit })),
  };
  return {
    socket: socket as unknown as Socket,
    emit: socket.emit,
    timeoutEmit,
    serverEmit(event: string, payload: unknown) {
      act(() => handlers.get(event)?.(payload as never));
    },
  };
}

function setup(overrides: { callState?: CallState | null; ringAck?: { ok: boolean } } = {}) {
  const socketMock = createSocketMock(overrides.ringAck);
  const startCall = vi.fn(async () => true);
  const endCall = vi.fn();
  const setWorkspaceError = vi.fn();
  const setWorkspaceNotice = vi.fn();
  const hook = renderHook(() =>
    useDirectCall({
      socket: socketMock.socket,
      viewerId: 'me',
      callState: overrides.callState ?? null,
      remoteMedia: [],
      startCall,
      endCall,
      getConversationLabel: (_id, fallback) => fallback,
      setWorkspaceError,
      setWorkspaceNotice,
    }),
  );
  return { ...hook, socketMock, startCall, endCall, setWorkspaceError, setWorkspaceNotice };
}

const incoming = {
  conversationId: 'c1',
  mode: 'video' as const,
  caller: { id: 'u2', displayName: 'Bob', avatarUrl: null },
};

describe('useDirectCall', () => {
  it('rings, then joins the DM call with its call id', async () => {
    const { result, socketMock, startCall } = setup();

    await act(() => result.current.startDirectCall('c1', 'voice', 'Bob'));

    expect(socketMock.timeoutEmit).toHaveBeenCalledWith(
      'dm:call:ring',
      { conversationId: 'c1', mode: 'voice' },
      expect.any(Function),
    );
    expect(startCall).toHaveBeenCalledWith('voice', { callId: 'dm:c1', label: 'Bob' });
    expect(result.current.outgoingCall).toEqual({ conversationId: 'c1', mode: 'voice' });
  });

  it('leaves the call when the ring is refused', async () => {
    const { result, endCall, setWorkspaceError } = setup({ ringAck: { ok: false } });

    await act(() => result.current.startDirectCall('c1', 'voice', 'Bob'));

    expect(endCall).toHaveBeenCalled();
    expect(setWorkspaceError).toHaveBeenCalled();
    expect(result.current.outgoingCall).toBeNull();
  });

  it('does not ring when the caller cannot join, for example without microphone access', async () => {
    const { result, socketMock, startCall } = setup();
    startCall.mockResolvedValueOnce(false);

    await act(() => result.current.startDirectCall('c1', 'voice', 'Bob'));

    expect(socketMock.timeoutEmit).not.toHaveBeenCalled();
    expect(result.current.outgoingCall).toBeNull();
  });

  it('shows an incoming call and clears it when answered elsewhere', () => {
    const { result, socketMock } = setup();

    socketMock.serverEmit('dm:call:incoming', incoming);
    expect(result.current.incomingCall).toEqual(incoming);

    socketMock.serverEmit('dm:call:ring-stopped', { conversationId: 'c1', reason: 'answered' });
    expect(result.current.incomingCall).toBeNull();
  });

  it('accepting joins with the incoming mode', async () => {
    const { result, socketMock, startCall } = setup();
    socketMock.serverEmit('dm:call:incoming', incoming);

    await act(() => result.current.acceptIncomingCall());

    expect(startCall).toHaveBeenCalledWith('video', { callId: 'dm:c1', label: 'Bob' });
    expect(result.current.incomingCall).toBeNull();
  });

  it('declining notifies the server', () => {
    const { result, socketMock } = setup();
    socketMock.serverEmit('dm:call:incoming', incoming);

    act(() => result.current.declineIncomingCall());

    expect(socketMock.emit).toHaveBeenCalledWith('dm:call:decline', { conversationId: 'c1' });
    expect(result.current.incomingCall).toBeNull();
  });

  it('ends the caller side when a 1-1 call is declined', async () => {
    const { result, socketMock, endCall, setWorkspaceNotice } = setup();
    await act(() => result.current.startDirectCall('c1', 'voice', 'Bob'));

    socketMock.serverEmit('dm:call:ring-stopped', { conversationId: 'c1', reason: 'declined' });

    expect(endCall).toHaveBeenCalled();
    expect(setWorkspaceNotice).toHaveBeenCalledWith('Call declined.');
    expect(result.current.outgoingCall).toBeNull();
  });

  it('cancels the ring when hanging up while still ringing', async () => {
    const { result, socketMock, endCall } = setup();
    await act(() => result.current.startDirectCall('c1', 'voice', 'Bob'));

    act(() => result.current.endDirectCall());

    expect(socketMock.emit).toHaveBeenCalledWith('dm:call:cancel', { conversationId: 'c1' });
    expect(endCall).toHaveBeenCalled();
  });
});
