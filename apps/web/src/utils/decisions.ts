import type { DecisionStatus } from '@discord-clone/shared';
import type { DecisionListResult, DecisionView, PollUpdatedPayload } from '@/api';
import type { MessageKey } from '@/i18n/LocaleProvider';
import { applyPollCounts } from './polls';

const STATUS_KEYS: Record<DecisionStatus, MessageKey> = {
  PROPOSED: 'decision.status.proposed',
  ACCEPTED: 'decision.status.accepted',
  REJECTED: 'decision.status.rejected',
  SUPERSEDED: 'decision.status.superseded',
};

/** The i18n key for a decision's status, so a dynamic status never needs a template-literal cast. */
export function decisionStatusKey(status: DecisionStatus): MessageKey {
  return STATUS_KEYS[status];
}

/**
 * `expiredAt` set while `status` is still PROPOSED is the deadline sweep's signal that quorum was
 * not met (`docs/features/decision-channels.md` → Voting → Quorum): the proposal stays open for a
 * manager to resolve rather than reading as `REJECTED`.
 */
export function needsManualResolution(decision: DecisionView) {
  return decision.status === 'PROPOSED' && decision.expiredAt !== null;
}

type InfiniteDecisions = { pages: DecisionListResult[]; pageParams: unknown[] };

/** Replaces one decision across every cached page, used for the mutating viewer's own echo. */
export function patchDecisionInPages(
  data: InfiniteDecisions | undefined,
  decisionId: string,
  update: (decision: DecisionView) => DecisionView,
): InfiniteDecisions | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      decisions: page.decisions.map((decision) =>
        decision.id === decisionId ? update(decision) : decision,
      ),
    })),
  };
}

/**
 * A `poll:updated` event carries counts only and no decision id, so the matching decision is found
 * by its poll's id instead. Mirrors `applyPollCounts`'s "counts only" contract for the message list.
 */
export function patchDecisionPollInPages(
  data: InfiniteDecisions | undefined,
  payload: PollUpdatedPayload,
): InfiniteDecisions | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      decisions: page.decisions.map((decision) =>
        decision.poll.id === payload.pollId
          ? { ...decision, poll: applyPollCounts(decision.poll, payload) }
          : decision,
      ),
    })),
  };
}
