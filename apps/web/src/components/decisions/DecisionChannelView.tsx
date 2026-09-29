import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { DecisionStatus } from '@discord-clone/shared';
import { apiRequest, Channel, DecisionDetailResult } from '@/api';
import { Button } from '@/components/ui';
import { useDecisions } from '@/hooks/useDecisions';
import { useTranslation } from '@/i18n/LocaleProvider';
import { decisionStatusKey } from '@/utils/decisions';
import { DecisionCard } from './DecisionCard';
import { NewDecisionDialog } from './NewDecisionDialog';
import styles from './Decision.module.css';
import type { ChatPanelMessageActions } from '@/components/chat/types';

const STATUS_FILTERS: Array<DecisionStatus | null> = [
  null,
  'PROPOSED',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED',
];

interface DecisionChannelViewProps {
  channel: Channel;
  /** Set while the member cannot post (e.g. timed out); the API still decides. */
  disabledReason: string | null;
  canManageMessages: boolean;
  /** Opens the proposal's thread panel for replies, the same "discussion" a forum post gets. */
  openThread: ChatPanelMessageActions['openThread'];
}

/** Replaces the message list and composer for a DECISION channel. */
export function DecisionChannelView({
  channel,
  disabledReason,
  canManageMessages,
  openThread,
}: DecisionChannelViewProps) {
  const t = useTranslation();
  const [status, setStatus] = useState<DecisionStatus | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [openThreadError, setOpenThreadError] = useState<string | null>(null);
  const [openingDecisionId, setOpeningDecisionId] = useState<string | null>(null);
  const decisions = useDecisions(channel.id, status);

  // The list view keeps its payload light (no root message per row); the discussion thread is
  // fetched on demand only when a member actually opens it.
  async function openDiscussion(decisionId: string) {
    if (!decisions.accessToken) return;
    setOpenThreadError(null);
    setOpeningDecisionId(decisionId);
    try {
      const detail = await apiRequest<DecisionDetailResult>(
        `/decisions/${decisionId}`,
        {},
        decisions.accessToken,
      );
      openThread(detail.rootMessage);
    } catch (err) {
      setOpenThreadError(
        err instanceof Error ? err.message : t('error.fallback.cannot-load-decisions'),
      );
    } finally {
      setOpeningDecisionId(null);
    }
  }

  return (
    <div className={styles.channelView}>
      <div className={styles.toolbar}>
        <div className={styles.statusFilter} role="group" aria-label={t('decision.filter.label')}>
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter ?? 'all'}
              size="sm"
              variant={status === filter ? 'secondary' : 'ghost'}
              aria-pressed={status === filter}
              onClick={() => setStatus(filter)}
            >
              {filter ? t(decisionStatusKey(filter)) : t('decision.filter.all')}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => setIsComposerOpen(true)}
          disabled={Boolean(disabledReason)}
          title={disabledReason ?? undefined}
        >
          <Plus size={16} aria-hidden="true" />
          {t('decision.newProposal')}
        </Button>
      </div>

      <div className={styles.list}>
        {decisions.isLoading ? (
          <p className="empty-note">
            <Loader2 className="spin" size={16} aria-hidden="true" /> {t('decision.loading')}
          </p>
        ) : decisions.error ? (
          <p className="empty-note" role="alert">
            {decisions.error instanceof Error
              ? decisions.error.message
              : t('error.fallback.cannot-load-decisions')}
          </p>
        ) : decisions.decisions.length === 0 ? (
          <p className="empty-note">{status ? t('decision.emptyFiltered') : t('decision.empty')}</p>
        ) : decisions.accessToken ? (
          decisions.decisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              accessToken={decisions.accessToken as string}
              canManage={canManageMessages}
              isOpeningThread={openingDecisionId === decision.id}
              onOpenThread={() => void openDiscussion(decision.id)}
              onDecisionUpdate={decisions.updateDecisionLocally}
            />
          ))
        ) : null}
        {openThreadError ? (
          <p className="empty-note" role="alert">
            {openThreadError}
          </p>
        ) : null}
        {decisions.hasMore ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={decisions.isLoadingMore}
            onClick={() => void decisions.loadMore()}
          >
            {decisions.isLoadingMore ? (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            ) : null}
            {t('decision.loadMore')}
          </Button>
        ) : null}
      </div>

      <NewDecisionDialog
        open={isComposerOpen}
        onOpenChange={setIsComposerOpen}
        isSubmitting={decisions.isCreating}
        onSubmit={decisions.createDecision}
      />
    </div>
  );
}
