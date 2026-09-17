const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How long a requested deletion stays cancellable before the account is anonymized. */
export const ACCOUNT_DELETION_GRACE_MS = 14 * DAY_MS;
/** How often each API instance looks for due deletions and expired export files. */
export const ACCOUNT_SWEEP_INTERVAL_MS = MINUTE_MS;
/** Upper bound on anonymizations per tick. */
export const ACCOUNT_DELETION_SWEEP_BATCH = 20;
/** Interactive transaction ceiling for one anonymization; the forward-snapshot updates scan tables. */
export const ACCOUNT_ANONYMIZATION_TIMEOUT_MS = 60_000;
/** Stored as the display name, so authored content renders with this author without special cases. */
export const DELETED_USER_DISPLAY_NAME = 'Deleted User';

export const ACCOUNT_DELETION_REQUEST_LIMIT = 5;
export const ACCOUNT_DELETION_REQUEST_WINDOW_MS = 15 * MINUTE_MS;

export const ACCOUNT_EXPORT_REQUEST_LIMIT = 3;
export const ACCOUNT_EXPORT_REQUEST_WINDOW_MS = DAY_MS;
/** How long a finished export can be downloaded. */
export const ACCOUNT_EXPORT_TTL_MS = 48 * HOUR_MS;
/** A `PENDING` job older than this belongs to a request that died mid-collection. */
export const ACCOUNT_EXPORT_STALE_MS = 10 * MINUTE_MS;
/** Ceiling per exported message list, so the in-request collection stays bounded. */
export const ACCOUNT_EXPORT_MESSAGE_LIMIT = 10_000;
/** Ceiling for every other exported list. */
export const ACCOUNT_EXPORT_LIST_LIMIT = 5_000;
export const ACCOUNT_EXPORT_STORAGE_PREFIX = 'account-exports';
