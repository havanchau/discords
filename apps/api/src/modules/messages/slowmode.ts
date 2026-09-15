export const SLOWMODE_OPTIONS_SECONDS = [
  0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600,
] as const;

/** Whole seconds the author must still wait before posting again, or 0 when allowed. */
export function slowmodeRetryAfterSeconds(
  lastMessageCreatedAt: Date | null | undefined,
  slowmodeSeconds: number,
  now: Date,
) {
  if (!lastMessageCreatedAt || slowmodeSeconds <= 0) return 0;
  const remainingMs = lastMessageCreatedAt.getTime() + slowmodeSeconds * 1000 - now.getTime();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}
