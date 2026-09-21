import { MonitorUp, Phone, PhoneOff, Video } from 'lucide-react';
import { assetUrl } from '@/api';
import { accentClass, initials } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import type { IncomingDirectCall } from '@/hooks/useDirectCall';
import { Avatar, Button, DialogContent, DialogRoot } from '@/components/ui';
import styles from './HomePanel.module.css';

type IncomingCallDialogProps = {
  incomingCall: IncomingDirectCall | null;
  conversationLabel: string | null;
  onAccept: () => Promise<void>;
  onDecline: () => void;
};

export function IncomingCallDialog({
  incomingCall,
  conversationLabel,
  onAccept,
  onDecline,
}: IncomingCallDialogProps) {
  const t = useTranslation();
  const caller = incomingCall?.caller;
  const mode = incomingCall?.mode;
  const title =
    mode === 'screen'
      ? t('call.incomingScreenShare')
      : mode === 'video'
        ? t('call.incomingVideo')
        : t('call.incomingVoice');
  const AcceptIcon = mode === 'screen' ? MonitorUp : mode === 'video' ? Video : Phone;

  return (
    <DialogRoot open={Boolean(incomingCall)} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent
        title={title}
        description={
          caller && conversationLabel && conversationLabel !== caller.displayName
            ? t('call.callingConversation', {
                caller: caller.displayName,
                conversation: conversationLabel,
              })
            : t('call.callingYou', { caller: caller?.displayName ?? t('call.someone') })
        }
      >
        {caller ? (
          <div className={styles.incomingCall}>
            <Avatar
              src={caller.avatarUrl ? assetUrl(caller.avatarUrl) : null}
              alt={caller.displayName}
              fallback={initials(caller.displayName)}
              size="lg"
              className={accentClass(caller.id)}
            />
            <div className={styles.incomingCallActions}>
              <Button type="button" variant="danger" onClick={onDecline}>
                <PhoneOff size={16} aria-hidden="true" />
                {t('call.decline')}
              </Button>
              <Button
                type="button"
                onClick={() => void onAccept()}
                data-testid="accept-call-button"
              >
                <AcceptIcon size={16} aria-hidden="true" />
                {t('call.accept')}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </DialogRoot>
  );
}
