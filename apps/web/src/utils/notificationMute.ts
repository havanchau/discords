import type { MuteDuration, NotificationPreference } from '@/api';
import type { MessageKey } from '@/i18n/LocaleProvider';

export const MUTE_DURATION_LABEL_KEYS: Record<MuteDuration, MessageKey> = {
  '15m': 'mute.duration.15m',
  '1h': 'mute.duration.1h',
  '8h': 'mute.duration.8h',
  '24h': 'mute.duration.24h',
  forever: 'mute.duration.forever',
};

/**
 * Client port of the API's `isMuteActive`: nothing flips `muted` back once `mutedUntil` passes, so an
 * expired row reads as unmuted here too. Only drives the muted look; the API decides push delivery.
 */
export function isMuteActive(
  preference: Pick<NotificationPreference, 'muted' | 'mutedUntil'> | undefined,
  now = Date.now(),
): boolean {
  if (!preference?.muted) return false;
  return preference.mutedUntil === null || new Date(preference.mutedUntil).getTime() > now;
}

/** The server-level row (no channel), matching how the API resolves the server scope. */
export function findServerPreference(preferences: NotificationPreference[], serverId: string) {
  return preferences.find((item) => item.serverId === serverId && !item.channelId);
}

export function findChannelPreference(preferences: NotificationPreference[], channelId: string) {
  return preferences.find((item) => item.channelId === channelId);
}
