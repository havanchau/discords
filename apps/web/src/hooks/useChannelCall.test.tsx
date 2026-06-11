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
});
