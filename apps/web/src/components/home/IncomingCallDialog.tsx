import { Phone, PhoneOff, Video } from 'lucide-react';
import { assetUrl } from '../../api';
import { accentClass, initials } from '../../helpers';
import type { IncomingDirectCall } from '../../hooks/useDirectCall';
import { Avatar, Button, DialogContent, DialogRoot } from '../ui';
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
  const caller = incomingCall?.caller;
  const isVideo = incomingCall?.mode === 'video';

  return (
    <DialogRoot open={Boolean(incomingCall)} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent
        title={isVideo ? 'Incoming video call' : 'Incoming voice call'}
        description={
          caller && conversationLabel && conversationLabel !== caller.displayName
            ? `${caller.displayName} is calling ${conversationLabel}`
            : `${caller?.displayName ?? 'Someone'} is calling you`
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
                Decline
              </Button>
              <Button
                type="button"
                onClick={() => void onAccept()}
                data-testid="accept-call-button"
              >
                {isVideo ? (
                  <Video size={16} aria-hidden="true" />
                ) : (
                  <Phone size={16} aria-hidden="true" />
                )}
                Accept
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </DialogRoot>
  );
}
