import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventStatus, validateEventTimes } from './event-status';

const now = new Date('2026-09-15T12:00:00.000Z');
const minutes = (value: number) => new Date(now.getTime() + value * 60_000);

describe('eventStatus', () => {
  it('is scheduled before the start time', () => {
    assert.equal(eventStatus({ startAt: minutes(10), endAt: null }, now), 'SCHEDULED');
  });

  it('is active between start and end', () => {
    assert.equal(eventStatus({ startAt: minutes(-10), endAt: minutes(10) }, now), 'ACTIVE');
  });

  it('is active for 24 hours after an open-ended start', () => {
    assert.equal(eventStatus({ startAt: minutes(-23 * 60), endAt: null }, now), 'ACTIVE');
    assert.equal(eventStatus({ startAt: minutes(-25 * 60), endAt: null }, now), 'ENDED');
  });

  it('is ended after the end time', () => {
    assert.equal(eventStatus({ startAt: minutes(-60), endAt: minutes(-1) }, now), 'ENDED');
  });
});

describe('validateEventTimes', () => {
  it('accepts a normal upcoming event', () => {
    assert.equal(validateEventTimes(minutes(30), minutes(90), now), null);
  });

  it('allows a start within the five-minute grace window', () => {
    assert.equal(validateEventTimes(minutes(-4), null, now), null);
    assert.match(validateEventTimes(minutes(-6), null, now) ?? '', /past/);
  });

  it('refuses starts more than a year ahead', () => {
    assert.match(validateEventTimes(minutes(366 * 24 * 60), null, now) ?? '', /one year/);
  });

  it('refuses an end before the start and events longer than seven days', () => {
    assert.match(validateEventTimes(minutes(30), minutes(10), now) ?? '', /after the start/);
    assert.match(validateEventTimes(minutes(30), minutes(30 + 8 * 24 * 60), now) ?? '', /7 days/);
  });

  it('skips start checks when editing an ongoing event', () => {
    assert.equal(validateEventTimes(minutes(-60), minutes(60), now, false), null);
  });
});
