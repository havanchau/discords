import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

function createGateway(options: {
  canViewChannel?: boolean;
  conversationMember?: unknown;
} = {}) {
  const prisma = {
    channel: {
      findUniqueOrThrow: async () => ({ id: 'channel-1', serverId: 'server-1' }),
    },
    directConversationMember: {
      findUnique: async () => options.conversationMember ?? null,
    },
  };
  const permissions = {
    hasChannelPermission: async () => Boolean(options.canViewChannel),
  };
  const publisher = {
    attach: () => undefined,
    userRoom: (userId: string) => `user:${userId}`,
    conversationRoom: (conversationId: string) => `conversation:${conversationId}`,
  };

  return new RealtimeGateway(
    {} as never,
    prisma as never,
    {} as never,
    permissions as never,
    { get: () => 'test-secret' } as never,
    publisher as never,
  );
}

function createSocket() {
  const joinedRooms: string[] = [];
  const client = {
    id: 'socket-1',
    data: { user: { id: 'user-1', sessionId: 'session-1' } },
    join: async (room: string) => {
      joinedRooms.push(room);
    },
  };

  return { client, joinedRooms };
}

describe('RealtimeGateway room authorization', () => {
  it('rejects channel room joins when channel view permission is missing', async () => {
    const gateway = createGateway({ canViewChannel: false });
    const { client, joinedRooms } = createSocket();

    await assert.rejects(
      () => gateway.joinChannel(client as never, { channelId: 'channel-1' }),
      (error) => error instanceof UnauthorizedException,
    );
    assert.deepEqual(joinedRooms, []);
  });

  it('joins channel and server rooms only after channel view permission passes', async () => {
    const gateway = createGateway({ canViewChannel: true });
    const { client, joinedRooms } = createSocket();

    assert.deepEqual(await gateway.joinChannel(client as never, { channelId: 'channel-1' }), {
      ok: true,
      activeCall: null,
    });
    assert.deepEqual(joinedRooms, ['channel:channel-1', 'server:server-1']);
  });

  it('rejects direct conversation rooms for non-participants', async () => {
    const gateway = createGateway({ conversationMember: null });
    const { client, joinedRooms } = createSocket();

    await assert.rejects(
      () => gateway.joinConversation(client as never, { conversationId: 'conversation-1' }),
      (error) => error instanceof UnauthorizedException,
    );
    assert.deepEqual(joinedRooms, []);
  });
});

describe('RealtimeGateway socket rate limits', () => {
  it('throws 429 when one socket exceeds the event window limit', () => {
    const gateway = createGateway();
    const { client } = createSocket();

    (gateway as never as RateLimitHarness).assertSocketRateLimit(
      client,
      'message:create',
      2,
      60_000,
    );
    (gateway as never as RateLimitHarness).assertSocketRateLimit(
      client,
      'message:create',
      2,
      60_000,
    );

    assert.throws(
      () =>
        (gateway as never as RateLimitHarness).assertSocketRateLimit(
          client,
          'message:create',
          2,
          60_000,
        ),
      (error) => error instanceof HttpException && error.getStatus() === 429,
    );
  });
});

type RateLimitHarness = {
  assertSocketRateLimit: (
    client: ReturnType<typeof createSocket>['client'],
    event: string,
    limit: number,
    windowMs: number,
  ) => void;
};
