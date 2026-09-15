import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { slowmodeRetryAfterSeconds } from './slowmode';

const now = new Date('2026-09-15T12:00:00.000Z');

function secondsAgo(seconds: number) {
  return new Date(now.getTime() - seconds * 1000);
}

describe('slowmodeRetryAfterSeconds', () => {
  it('allows the first message in the channel', () => {
    assert.equal(slowmodeRetryAfterSeconds(null, 10, now), 0);
  });

  it('allows any message when slowmode is off', () => {
    assert.equal(slowmodeRetryAfterSeconds(secondsAgo(1), 0, now), 0);
  });

  it('returns the remaining whole seconds inside the window', () => {
    assert.equal(slowmodeRetryAfterSeconds(secondsAgo(3), 10, now), 7);
  });

  it('rounds a partial second up', () => {
    assert.equal(slowmodeRetryAfterSeconds(new Date(now.getTime() - 9_500), 10, now), 1);
  });

  it('allows a message exactly at the end of the window', () => {
    assert.equal(slowmodeRetryAfterSeconds(secondsAgo(10), 10, now), 0);
  });
});
