export type ServerEventStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Events without an end time count as active for this long after they start. */
export const OPEN_ENDED_EVENT_DURATION_MS = DAY_MS;
const START_GRACE_MS = 5 * MINUTE_MS;
const MAX_LEAD_TIME_MS = 365 * DAY_MS;
const MAX_DURATION_MS = 7 * DAY_MS;

export function eventStatus(
  event: { startAt: Date; endAt: Date | null },
  now: Date,
): ServerEventStatus {
  if (event.startAt > now) return 'SCHEDULED';
  const endsAt = event.endAt ?? new Date(event.startAt.getTime() + OPEN_ENDED_EVENT_DURATION_MS);
  return endsAt > now ? 'ACTIVE' : 'ENDED';
}

/** The earliest end time that still counts as upcoming or active, for list queries. */
export function activeEventCutoffs(now: Date) {
  return {
    endAtAfter: now,
    openEndedStartAfter: new Date(now.getTime() - OPEN_ENDED_EVENT_DURATION_MS),
  };
}

/**
 * Returns a validation message, or null when the times are acceptable. `checkStart` is false when
 * editing an event whose start time is not changing, so ongoing events stay editable.
 */
export function validateEventTimes(
  startAt: Date,
  endAt: Date | null,
  now: Date,
  checkStart = true,
): string | null {
  if (checkStart && startAt.getTime() < now.getTime() - START_GRACE_MS) {
    return 'Event start time cannot be in the past';
  }
  if (checkStart && startAt.getTime() > now.getTime() + MAX_LEAD_TIME_MS) {
    return 'Event start time must be within one year';
  }
  if (endAt && endAt <= startAt) return 'Event end time must be after the start time';
  if (endAt && endAt.getTime() - startAt.getTime() > MAX_DURATION_MS) {
    return 'Events can last at most 7 days';
  }
  return null;
}
