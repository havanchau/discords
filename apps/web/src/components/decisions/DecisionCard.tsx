import { useState } from 'react';
import { Gavel, Loader2, MessageSquare, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, DecisionListResult, DecisionView } from '@/api';
import { Badge, Button, IconButton } from '@/components/ui';
import { PollCard } from '@/components/chat/PollCard';
import { useDecisionResolution } from '@/hooks/useDecisionResolution';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { queryKeys } from '@/query/queryKeys';
import { needsManualResolution } from '@/utils/decisions';
import styles from './Decision.module.css';

interface DecisionCardProps {
  decision: DecisionView;
  accessToken: string;
  /** Only a MANAGE_MESSAGES holder on the channel sees resolve/supersede — the API still decides. */
  canManage: boolean;
  isOpeningThread: boolean;
  onOpenThread: () => void;
  onDecisionUpdate: (decision: DecisionView) => void;
}

export function DecisionCard({
  decision,
  accessToken,
  canManage,
  isOpeningThread,
  onOpenThread,
  onDecisionUpdate,
}: DecisionCardProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const [isSupersedeOpen, setIsSupersedeOpen] = useState(false);
  const [supersedeTarget, setSupersedeTarget] = useState('');
  const { resolve, supersede, error, isResolving, isSuperseding } = useDecisionResolution({
    decisionId: decision.id,
    accessToken,
    onDecisionUpdate,
  });

  // Only fetched once the "mark as superseded" panel opens: the target is any other ACCEPTED
  // decision in this channel (Changes → Who can change status → Supersede).
  const acceptedInChannel = useQuery({
    queryKey: queryKeys.decisionSupersedeTargets(decision.channelId),
    enabled: isSupersedeOpen,
    queryFn: () =>
      apiRequest<DecisionListResult>(
        `/channels/${decision.channelId}/decisions?status=ACCEPTED`,
        {},
        accessToken,
      ),
  });
  const supersedeTargets = (acceptedInChannel.data?.decisions ?? []).filter(
    (item) => item.id !== decision.id,
  );

  const isPending = needsManualResolution(decision);
  const isTerminal = decision.status !== 'PROPOSED';

  return (
    <section
      className={styles.card}
      aria-label={t('decision.card.ariaLabel', { title: decision.title })}
    >
      <header className={styles.cardHeader}>
        <Gavel size={16} aria-hidden="true" />
        <strong className={styles.cardTitle}>{decision.title}</strong>
        <StatusBadge decision={decision} />
      </header>

      {isPending ? <p className={styles.expiredNote}>{t('decision.status.expiredHint')}</p> : null}

      <PollCard
        poll={decision.poll}
        accessToken={accessToken}
        canClose={false}
        onPollUpdate={(poll) => onDecisionUpdate({ ...decision, poll })}
      />

      <div className={styles.cardMeta}>
        <span>{t('decision.proposedBy', { name: decision.proposer.displayName })}</span>
        <span>
          {isTerminal
            ? t('decision.deadline.closed', { date: dates.absolute(decision.votingDeadlineAt) })
            : t('decision.deadline.open', { date: dates.absolute(decision.votingDeadlineAt) })}
        </span>
        <Button variant="ghost" size="sm" disabled={isOpeningThread} onClick={onOpenThread}>
          {isOpeningThread ? (
            <Loader2 className="spin" size={14} aria-hidden="true" />
          ) : (
            <MessageSquare size={14} aria-hidden="true" />
          )}
          {t('decision.card.discuss')}
        </Button>
      </div>

      {canManage && decision.status === 'PROPOSED' ? (
        <div className={styles.cardActions}>
          <Button size="sm" disabled={isResolving} onClick={() => void resolve('ACCEPTED')}>
            {t('decision.action.accept')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={isResolving}
            onClick={() => void resolve('REJECTED')}
          >
            {t('decision.action.reject')}
          </Button>
        </div>
      ) : null}

      {canManage && decision.status === 'ACCEPTED' ? (
        <div className={styles.cardActions}>
          {isSupersedeOpen ? (
            <form
              className={styles.supersedeForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (!supersedeTarget) return;
                void supersede(supersedeTarget).then((succeeded) => {
                  if (succeeded) setIsSupersedeOpen(false);
                });
              }}
            >
              <label>
                {t('decision.supersede.pickLabel')}
                <select
                  required
                  value={supersedeTarget}
                  onChange={(event) => setSupersedeTarget(event.target.value)}
                >
                  <option value="" disabled>
                    {t('decision.supersede.pickPlaceholder')}
                  </option>
                  {supersedeTargets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm" disabled={isSuperseding || !supersedeTarget}>
                {t('decision.supersede.confirm')}
              </Button>
              <IconButton
                label={t('common.cancel')}
                size="sm"
                onClick={() => setIsSupersedeOpen(false)}
              >
                <X size={14} aria-hidden="true" />
              </IconButton>
            </form>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setIsSupersedeOpen(true)}>
              {t('decision.action.supersede')}
            </Button>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function StatusBadge({ decision }: { decision: DecisionView }) {
  const t = useTranslation();
  if (needsManualResolution(decision)) {
    return <Badge variant="danger">{t('decision.status.expired')}</Badge>;
  }
  switch (decision.status) {
    case 'ACCEPTED':
      return <Badge variant="success">{t('decision.status.accepted')}</Badge>;
    case 'REJECTED':
      return <Badge variant="danger">{t('decision.status.rejected')}</Badge>;
    case 'SUPERSEDED':
      return <Badge variant="neutral">{t('decision.status.superseded')}</Badge>;
    default:
      return <Badge variant="neutral">{t('decision.status.proposed')}</Badge>;
  }
}
