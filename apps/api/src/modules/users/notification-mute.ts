import type { MuteDuration, NotificationPreference } from '@discord-clone/shared';
import type { Prisma } from '@prisma/client';

/** The columns a preference response carries; `userId` and timestamps stay server-side. */
export const NOTIFICATION_PREFERENCE_SELECT = {
  id: true,
  serverId: true,
  channelId: true,
  muted: true,
  mutedUntil: true,
  mentionOnly: true,
  desktopEnabled: true,
} satisfies Prisma.NotificationPreferenceSelect;

type NotificationPreferenceRow = Prisma.NotificationPreferenceGetPayload<{
  select: typeof NOTIFICATION_PREFERENCE_SELECT;
}>;

export function toNotificationPreferenceView(
  row: NotificationPreferenceRow,
): NotificationPreference {
  return { ...row, mutedUntil: row.mutedUntil?.toISOString() ?? null };
}

const MUTE_DURATION_MS: Record<Exclude<MuteDuration, 'forever'>, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

/**
 * A mute is active while `muted` is set and its expiry, if any, is still in the future. Nothing
 * flips `muted` back once `mutedUntil` passes, so every read of a preference's mute goes through here.
 */
export function isMuteActive(
  preference: { muted: boolean; mutedUntil: Date | null } | null | undefined,
  now: Date,
): boolean {
  if (!preference?.muted) return false;
  return preference.mutedUntil === null || preference.mutedUntil > now;
}

/** Resolves a duration against the server clock; `forever` is stored as no expiry. */
export function resolveMutedUntil(duration: MuteDuration, now: Date): Date | null {
  if (duration === 'forever') return null;
  return new Date(now.getTime() + MUTE_DURATION_MS[duration]);
}
