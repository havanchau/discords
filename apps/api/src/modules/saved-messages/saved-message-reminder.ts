const MINUTE_MS = 60_000;
const MIN_LEAD_MS = MINUTE_MS;
const MAX_LEAD_MS = 365 * 24 * 60 * MINUTE_MS;
/** A client that picks exactly "in 1 minute" reaches the API a moment later; do not reject it. */
const LEAD_GRACE_MS = 5_000;

/** How often each API instance looks for due reminders. */
export const REMINDER_SWEEP_INTERVAL_MS = MINUTE_MS;
/** Upper bound on reminders delivered per tick, so one tick cannot run into the next. */
export const REMINDER_SWEEP_BATCH = 100;

/** Returns a validation message, or null when the reminder time is acceptable. */
export function validateRemindAt(remindAt: Date, now: Date): string | null {
  const lead = remindAt.getTime() - now.getTime();
  if (Number.isNaN(lead) || lead < MIN_LEAD_MS - LEAD_GRACE_MS || lead > MAX_LEAD_MS) {
    return 'Reminder must be between 1 minute and 1 year from now';
  }
  return null;
}
