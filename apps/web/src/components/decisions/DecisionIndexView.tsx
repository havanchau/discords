import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DecisionStatus } from '@discord-clone/shared';
import type { Channel, DecisionView } from '@/api';
import { Badge, Button, DialogContent, DialogRoot } from '@/components/ui';
import { reminderInputToIso } from '@/components/saved/ReminderPicker';
import { useDecisionIndex, type DecisionIndexFilters } from '@/hooks/useDecisionIndex';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { decisionStatusKey } from '@/utils/decisions';
import styles from './Decision.module.css';

const STATUS_OPTIONS: Array<Exclude<DecisionStatus, 'PROPOSED'>> = [
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED',
];

interface DecisionIndexViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  channels: Channel[];
}

/** The server-wide index of decisions that left PROPOSED, filterable by status/channel/date. */
export function DecisionIndexView({
  open,
  onOpenChange,
  serverId,
  channels,
}: DecisionIndexViewProps) {
  const t = useTranslation();
  const [status, setStatus] = useState<DecisionStatus | null>(null);
  const [channelId, setChannelId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filters: DecisionIndexFilters = {
    status,
    channelId: channelId || null,
    from: reminderInputToIso(from) ?? null,
    to: reminderInputToIso(to) ?? null,
  };
  const index = useDecisionIndex(serverId, filters);
  const decisionChannels = channels.filter((channel) => channel.type === 'DECISION');

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('decision.index.title')}
        description={t('decision.index.description')}
      >
        <div className={styles.indexFilters}>
          <label className={styles.filterField}>
            {t('decision.index.filterStatus')}
            <select
              value={status ?? ''}
              onChange={(event) =>
                setStatus(event.target.value ? (event.target.value as DecisionStatus) : null)
              }
            >
              <option value="">{t('decision.filter.all')}</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(decisionStatusKey(option))}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            {t('decision.index.filterChannel')}
            <select value={channelId} onChange={(event) => setChannelId(event.target.value)}>
              <option value="">{t('decision.filter.all')}</option>
              {decisionChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            {t('decision.index.filterFrom')}
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className={styles.filterField}>
            {t('decision.index.filterTo')}
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>

        <div className={styles.indexList}>
          {index.isLoading ? (
            <p className="empty-note">
              <Loader2 className="spin" size={16} aria-hidden="true" /> {t('decision.loading')}
            </p>
          ) : index.error ? (
            <p className="empty-note" role="alert">
              {index.error instanceof Error
                ? index.error.message
                : t('error.fallback.cannot-load-decisions')}
            </p>
          ) : index.decisions.length === 0 ? (
            <p className="empty-note">{t('decision.index.empty')}</p>
          ) : (
            index.decisions.map((decision) => (
              <DecisionIndexRow key={decision.id} decision={decision} />
            ))
          )}
          {index.hasMore ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={index.isLoadingMore}
              onClick={() => void index.loadMore()}
            >
              {index.isLoadingMore ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : null}
              {t('decision.loadMore')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

function DecisionIndexRow({ decision }: { decision: DecisionView }) {
  const t = useTranslation();
  const dates = useDateFormat();
  const badgeVariant =
    decision.status === 'ACCEPTED'
      ? 'success'
      : decision.status === 'REJECTED'
        ? 'danger'
        : 'neutral';

  return (
    <div className={styles.indexRow}>
      <div className={styles.indexRowHeader}>
        <strong className={styles.indexRowTitle}>{decision.title}</strong>
        <Badge variant={badgeVariant}>{t(decisionStatusKey(decision.status))}</Badge>
      </div>
      <span className={styles.cardMeta}>
        <span>{t('decision.index.channel', { channel: decision.channelName })}</span>
        {decision.decidedAt ? (
          <span>{t('decision.index.decidedAt', { date: dates.absolute(decision.decidedAt) })}</span>
        ) : null}
      </span>
    </div>
  );
}
