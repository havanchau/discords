import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { DmCallRing, DmCallRings } from './dm-call-rings';

function ring(overrides: Partial<DmCallRing> = {}): DmCallRing {
  return {
    conversationId: 'c1',
    callerUserId: 'caller',
    mode: 'voice',
    isGroup: false,
    memberUserIds: ['caller', 'callee'],
    ...overrides,
  };
}

describe('DmCallRings', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  it('expires a ring after the timeout and reports it once', () => {
    const expired: DmCallRing[] = [];
    const rings = new DmCallRings((item) => expired.push(item), 1000);
    rings.start(ring());

    mock.timers.tick(999);
    assert.equal(expired.length, 0);
    mock.timers.tick(1);

    assert.deepEqual(expired, [ring()]);
    assert.equal(rings.get('c1'), undefined);
  });

  it('does not expire a cleared ring', () => {
    const expired: DmCallRing[] = [];
    const rings = new DmCallRings((item) => expired.push(item), 1000);
    rings.start(ring());

    const cleared = rings.clear('c1');
    mock.timers.tick(1000);

    assert.deepEqual(cleared, ring());
    assert.equal(expired.length, 0);
  });

  it('replaces a pending ring for the same conversation and restarts its timer', () => {
    const expired: DmCallRing[] = [];
    const rings = new DmCallRings((item) => expired.push(item), 1000);
    rings.start(ring());
    mock.timers.tick(600);

    rings.start(ring({ mode: 'video' }));
    mock.timers.tick(600);

    assert.equal(expired.length, 0);
    assert.equal(rings.get('c1')?.mode, 'video');
    mock.timers.tick(400);
    assert.equal(expired.length, 1);
  });

  it('returns undefined when clearing an unknown conversation', () => {
    const rings = new DmCallRings(() => undefined, 1000);

    assert.equal(rings.clear('missing'), undefined);
  });
});
