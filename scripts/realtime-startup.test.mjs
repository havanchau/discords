import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  RealtimeHeartbeatService,
} = require('../apps/api/dist/modules/realtime/realtime-heartbeat.service.js');

test('realtime maintenance waits for application bootstrap and stops on shutdown', async (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const sweepExpiredRings = context.mock.fn(async () => {});
  const service = new RealtimeHeartbeatService(
    { config: { heartbeatIntervalMs: 30_000 } },
    {
      heartbeat: async () => {},
      sweepStaleUsers: async () => {},
    },
    { heartbeat: async () => {} },
    { sweepExpiredRings },
  );
  service.start({ sockets: { sockets: new Map() } });
  try {
    // A slow database initialization must not start Redis commands from the gateway timer.
    context.mock.timers.tick(60_000);
    await setImmediate();
    assert.equal(sweepExpiredRings.mock.callCount(), 0);

    service.onApplicationBootstrap();
    context.mock.timers.tick(2_000);
    await setImmediate();
    assert.equal(sweepExpiredRings.mock.callCount(), 1);

    service.onModuleDestroy();
    context.mock.timers.tick(60_000);
    await setImmediate();
    assert.equal(sweepExpiredRings.mock.callCount(), 1);
  } finally {
    service.onModuleDestroy();
  }
});
