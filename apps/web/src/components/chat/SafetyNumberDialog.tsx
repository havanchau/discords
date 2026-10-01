import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { computeSafetyNumber } from '@/e2ee';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Badge, Button, DialogContent, DialogRoot } from '@/components/ui';
import styles from './SafetyNumberDialog.module.css';

interface SafetyNumberDialogProps {
  /** What the user is comparing against, e.g. the other device's name. */
  deviceName: string;
  /** Every public key (base64 SPKI) in the comparison; both sides must pass the same set. */
  publicKeys: string[];
  isVerified: boolean;
  isSaving: boolean;
  onVerify: () => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shows the fingerprint two parties compare out of band. Marking it verified is a visible badge
 * only: wrapping never waits for it, so a new device is usable before anyone has compared anything.
 */
export function SafetyNumberDialog({
  deviceName,
  publicKeys,
  isVerified,
  isSaving,
  onVerify,
  onOpenChange,
}: SafetyNumberDialogProps) {
  const t = useTranslation();
  const numberQuery = useQuery({
    queryKey: ['safety-number', ...[...publicKeys].sort()],
    queryFn: () => computeSafetyNumber(publicKeys),
    staleTime: Infinity,
  });

  return (
    <DialogRoot open onOpenChange={onOpenChange}>
      <DialogContent
        title={t('encryption.safety.title', { device: deviceName })}
        description={t('encryption.safety.description', { device: deviceName })}
      >
        {numberQuery.isLoading ? (
          <p className={styles.status} role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
            {t('encryption.safety.loading')}
          </p>
        ) : numberQuery.isError ? (
          <p className={styles.status} role="alert">
            {t('encryption.safety.error')}
          </p>
        ) : (
          <p className={styles.number} aria-label={t('encryption.safety.numberLabel')}>
            {numberQuery.data?.split(' ').map((group) => (
              <span key={group}>{group}</span>
            ))}
          </p>
        )}
        <div className={styles.actions}>
          {isVerified ? (
            <Badge variant="success">{t('encryption.devices.verified')}</Badge>
          ) : (
            <Button disabled={!numberQuery.data || isSaving} onClick={onVerify}>
              {t('encryption.safety.action.verify')}
            </Button>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
