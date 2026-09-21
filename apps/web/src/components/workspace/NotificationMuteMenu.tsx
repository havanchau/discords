import { muteDurations } from '@discord-clone/shared';
import { BellOff } from 'lucide-react';
import type { MuteDuration, NotificationPreference } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui';
import { isMuteActive, MUTE_DURATION_LABEL_KEYS } from '@/utils/notificationMute';

interface NotificationMuteMenuProps {
  preference: NotificationPreference | undefined;
  disabled: boolean;
  onMute: (duration: MuteDuration) => void;
  onUnmute: () => void;
}

/** Context-menu entries for muting one server or channel; rendered inside a `ContextMenuContent`. */
export function NotificationMuteMenu({
  preference,
  disabled,
  onMute,
  onUnmute,
}: NotificationMuteMenuProps) {
  const t = useTranslation();
  const { absolute } = useDateFormat();

  if (preference && isMuteActive(preference)) {
    return (
      <>
        <ContextMenuLabel>
          <BellOff size={16} aria-hidden="true" />
          {preference.mutedUntil
            ? t('mute.mutedUntil', { time: absolute(preference.mutedUntil) })
            : t('mute.mutedForever')}
        </ContextMenuLabel>
        <ContextMenuItem disabled={disabled} onSelect={onUnmute}>
          {t('mute.unmute')}
        </ContextMenuItem>
      </>
    );
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled}>
        <BellOff size={16} aria-hidden="true" />
        {t('mute.action')}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {muteDurations.map((duration) => (
          <ContextMenuItem key={duration} onSelect={() => onMute(duration)}>
            {t(MUTE_DURATION_LABEL_KEYS[duration])}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
