import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { Poll } from '@/api';
import { usePollVoting } from '@/hooks/usePollVoting';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { cn } from '@/utils/cn';
import { isPollClosed, totalVotes } from '@/utils/polls';
import { Button, Checkbox, PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui';
import styles from './PollCard.module.css';

interface PollCardProps {
  poll: Poll;
  accessToken: string;
  canClose: boolean;
  onPollUpdate: (poll: Poll) => void;
}

/** Shared by channel and direct message rows; the owner of the message list applies updates. */
export function PollCard({ poll: sourcePoll, accessToken, canClose, onPollUpdate }: PollCardProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const [isVotersOpen, setIsVotersOpen] = useState(false);
  const { poll, error, isPending, vote, close, voters } = usePollVoting({
    poll: sourcePoll,
    accessToken,
    onPollUpdate,
    isVotersOpen,
  });
  const isClosed = isPollClosed(poll, Date.now());
  const total = totalVotes(poll);

  function toggleOption(optionId: string, checked: boolean) {
    const next = checked
      ? [...poll.votedOptionIds, optionId]
      : poll.votedOptionIds.filter((id) => id !== optionId);
    // Votes can be changed but not withdrawn, so the last selected option stays selected.
    if (next.length) void vote(next);
  }

  return (
    <section className={styles.poll} aria-label={t('poll.ariaLabel', { question: poll.question })}>
      <header className={styles.header}>
        <BarChart3 size={16} aria-hidden="true" />
        <strong className={styles.question}>{poll.question}</strong>
      </header>
      <p className={styles.hint}>
        {poll.allowMultiple ? t('poll.hint.multiple') : t('poll.hint.single')}
      </p>

      <ul className={styles.options}>
        {poll.options.map((option) => {
          const percent = total ? Math.round((option.voteCount * 100) / total) : 0;
          const isSelected = poll.votedOptionIds.includes(option.id);
          const isDisabled =
            isClosed ||
            isPending ||
            (isSelected && (!poll.allowMultiple || poll.votedOptionIds.length === 1));
          return (
            <li key={option.id} className={cn(styles.option, isSelected && styles.selected)}>
              <label className={styles.optionLabel}>
                {poll.allowMultiple ? (
                  <Checkbox
                    checked={isSelected}
                    disabled={isDisabled}
                    onCheckedChange={(checked) => toggleOption(option.id, checked === true)}
                  />
                ) : (
                  // The UI kit has no radio primitive; a native radio keeps keyboard semantics.
                  <input
                    type="radio"
                    className={styles.radio}
                    name={`poll-${poll.id}`}
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => void vote([option.id])}
                  />
                )}
                <span className={styles.optionText}>{option.label}</span>
                <span className={styles.optionCount}>
                  {t('poll.optionCount', { count: option.voteCount, percent })}
                </span>
              </label>
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.barFill} style={{ width: `${percent}%` }} />
              </span>
            </li>
          );
        })}
      </ul>

      <footer className={styles.footer}>
        <span>{t('poll.totalVotes', { count: total })}</span>
        <span className={cn(isClosed && styles.closed)}>
          {isClosed
            ? t('poll.status.closed')
            : poll.expiresAt
              ? t('poll.closesAt', { date: dates.dateTime(poll.expiresAt) })
              : t('poll.status.open')}
        </span>
        <span className={styles.footerActions}>
          {poll.showVoters ? (
            <PopoverRoot open={isVotersOpen} onOpenChange={setIsVotersOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm">
                  {t('poll.showVoters')}
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end">
                <PollVoters poll={voters.poll} isLoading={voters.isLoading} error={voters.error} />
              </PopoverContent>
            </PopoverRoot>
          ) : null}
          {canClose && !isClosed ? (
            <Button variant="secondary" size="sm" disabled={isPending} onClick={() => void close()}>
              {t('poll.close')}
            </Button>
          ) : null}
        </span>
      </footer>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function PollVoters({
  poll,
  isLoading,
  error,
}: {
  poll: Poll | null;
  isLoading: boolean;
  error: string | null;
}) {
  const t = useTranslation();
  if (isLoading) return <p className={styles.votersNote}>{t('poll.voters.loading')}</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!poll || totalVotes(poll) === 0) {
    return <p className={styles.votersNote}>{t('poll.voters.empty')}</p>;
  }
  return (
    <div className={styles.voters}>
      {poll.options
        .filter((option) => option.voteCount > 0)
        .map((option) => (
          <div key={option.id} className={styles.voterGroup}>
            <strong>{option.label}</strong>
            <span>{(option.voters ?? []).map((voter) => voter.displayName).join(', ')}</span>
          </div>
        ))}
    </div>
  );
}
