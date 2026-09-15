import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Socket } from 'socket.io-client';
import { Channel, AuthState } from '../api';
import { CallParticipant } from '../helpers';
import { useChannelCall } from './useChannelCall';

type EventHandler = (payload: never) => void;

function createSocketMock(id = 'local-socket') {
  const handlers = new Map<string, EventHandler>();
  const socket = {
    id,
    on: vi.fn((event: string, handler: EventHandler) => {
      handlers.set(event, handler);
      return socket;
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
      return socket;
    }),
    emit: vi.fn(),
    timeout: vi.fn(() => ({
      emit: vi.fn(
        (
          _event: string,
          _payload: unknown,
          callback: (err: Error | null, result?: { participants: CallParticipant[] }) => void,
        ) => {
          callback(null, {
            participants: [participant({ socketId: id, displayName: 'Local User' })],
          });
        },
      ),
    })),
  };

  return {
    socket: socket as unknown as Socket,
    emitServer(event: string, payload: unknown) {
      handlers.get(event)?.(payload as never);
    },
  };
}

const auth: AuthState = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: {
    id: 'local-user',
    email: 'local@example.com',
    username: 'local',
    displayName: 'Local User',
  },
};

const channel: Channel = {
  id: 'channel-1',
  serverId: 'server-1',
  name: 'general',
  type: 'TEXT',
};

function participant(overrides: Partial<CallParticipant> = {}): CallParticipant {
  return {
    socketId: 'remote-socket',
    userId: 'remote-user',
    username: 'remote',
    displayName: 'Remote User',
    mode: 'video',
    isMuted: false,
    isCameraOff: false,
    isSharingScreen: false,
    ...overrides,
  };
}

describe('useChannelCall', () => {
  it('keeps the local socket out of remote media after join and state echo events', async () => {
    const socketMock = createSocketMock();
    const { result } = renderHook(() =>
      useChannelCall({
        auth,
        channel,
        socket: socketMock.socket,
        setWorkspaceError: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.startCall('voice', { receiveOnly: true });
    });

    expect(result.current.remoteMedia).toEqual([]);

    act(() => {
      socketMock.emitServer('voice:user-updated', {
        channelId: channel.id,
        participant: participant({
          socketId: 'local-socket',
          userId: auth.user.id,
          displayName: auth.user.displayName,
        }),
      });
    });

    expect(result.current.remoteMedia).toEqual([]);
  });

  it('joins a direct message call by call id without a selected channel', async () => {
    const socketMock = createSocketMock();
    const joinEmit = vi.fn(
      (_event: string, _payload: unknown, callback: (err: Error | null) => void) => callback(null),
    );
    vi.mocked(socketMock.socket.timeout).mockReturnValue({ emit: joinEmit } as never);
    const { result } = renderHook(() =>
      useChannelCall({
        auth,
        channel: null,
        socket: socketMock.socket,
        setWorkspaceError: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.startCall('voice', { receiveOnly: true, callId: 'dm:c1', label: 'Bob' });
    });

    expect(joinEmit).toHaveBeenCalledWith(
      'voice:join',
      expect.objectContaining({ channelId: 'dm:c1' }),
      expect.any(Function),
    );
    expect(result.current.callState).toMatchObject({ channelId: 'dm:c1', label: 'Bob' });
  });
});
