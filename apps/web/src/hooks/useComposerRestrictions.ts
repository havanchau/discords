import { useCallback, useEffect, useState } from 'react';
import type { AuthState, Channel, ServerDetail } from '@/api';
import { useLocale } from '@/i18n/LocaleProvider';
import { buildDateFormatters } from '@/i18n/useDateFormat';
import { activeTimeoutUntil, memberHasServerPermission } from '@/utils/serverPermissions';

export interface ComposerRestriction {
  /** Set while the composer must stay disabled, e.g. during a timeout. */
  disabledReason: string | null;
  slowmodeSeconds: number;
  retryAfterSeconds: number;
}

interface UseComposerRestrictionsOptions {
  auth: AuthState | null;
  server: ServerDetail | null;
  channel: Channel | null;
}

/** Client-side hints for timeouts and slowmode; the API remains authoritative. */
export function useComposerRestrictions({ auth, server, channel }: UseComposerRestrictionsOptions) {
  const { locale, t } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const [lastSentAtByChannel, setLastSentAtByChannel] = useState<Record<string, number>>({});
  const userId = auth?.user.id ?? '';

  const timeoutUntil = activeTimeoutUntil(server, userId, now);
  const canBypassSlowmode =
    memberHasServerPermission(server, userId, 'MANAGE_MESSAGES') ||
    memberHasServerPermission(server, userId, 'MANAGE_CHANNELS');
  const slowmodeSeconds = canBypassSlowmode ? 0 : (channel?.slowmodeSeconds ?? 0);
  const lastSentAt = channel ? lastSentAtByChannel[channel.id] : undefined;
  const retryAfterSeconds =
    slowmodeSeconds && lastSentAt
      ? Math.max(0, Math.ceil((lastSentAt + slowmodeSeconds * 1000 - now) / 1000))
      : 0;

  const needsTicking = Boolean(timeoutUntil) || retryAfterSeconds > 0;
  useEffect(() => {
    if (!needsTicking) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [needsTicking]);

  const markMessageSent = useCallback((channelId: string) => {
    const sentAt = Date.now();
    setNow(sentAt);
    setLastSentAtByChannel((current) => ({ ...current, [channelId]: sentAt }));
  }, []);

  const restriction: ComposerRestriction = {
    disabledReason: timeoutUntil
      ? t('composer.timedOutUntil', {
          time: buildDateFormatters(locale, t).time(new Date(timeoutUntil).toISOString()),
        })
      : null,
    slowmodeSeconds,
    retryAfterSeconds,
  };

  return { restriction, markMessageSent };
}
