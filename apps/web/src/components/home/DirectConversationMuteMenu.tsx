import { muteDurations } from '@discord-clone/shared';
import { Bell, BellOff } from 'lucide-react';
import type { MuteDuration } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
} from '@/components/ui';
import { isMuteActive, MUTE_DURATION_LABEL_KEYS } from '@/utils/notificationMute';

interface DirectConversationMuteMenuProps {
  muted: boolean;
  mutedUntil: string | null;
  disabled: boolean;
  onMute: (duration: MuteDuration) => void;
  onUnmute: () => void;
}

/**
 * Header dropdown for one DM conversation's push mute (docs/features/dm-conversation-mute.md). A
 * left-click header button needs `DropdownMenu*` rather than `NotificationMuteMenu`'s right-click
 * `ContextMenu*` primitives, so the five duration items are rendered flat here instead of forking
 * that component (see the doc's Trade-offs).
 */
export function DirectConversationMuteMenu({
  muted,
  mutedUntil,
  disabled,
  onMute,
  onUnmute,
}: DirectConversationMuteMenuProps) {
  const t = useTranslation();
  const active = isMuteActive({ muted, mutedUntil });
  const label = active ? t('dm.header.unmute') : t('dm.header.mute');

  return (
    <DropdownMenuRoot>
      <Tooltip content={label}>
        <DropdownMenuTrigger asChild>
          <IconButton label={label} disabled={disabled}>
            {active ? (
              <BellOff size={18} aria-hidden="true" />
            ) : (
              <Bell size={18} aria-hidden="true" />
            )}
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" side="bottom">
        {muteDurations.map((duration) => (
          <DropdownMenuItem key={duration} onSelect={() => onMute(duration)}>
            {t(MUTE_DURATION_LABEL_KEYS[duration])}
          </DropdownMenuItem>
        ))}
        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onUnmute}>{t('mute.unmute')}</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
