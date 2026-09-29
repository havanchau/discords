import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest, DecisionView, ResolveDecisionInput, SupersedeDecisionInput } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';

interface DecisionResult {
  decision: DecisionView;
}

interface UseDecisionResolutionOptions {
  decisionId: string;
  accessToken: string | null | undefined;
  /** Writes the server's answer back into whichever list owns this decision. */
  onDecisionUpdate: (decision: DecisionView) => void;
}

/**
 * Resolve and supersede: both are a single conditional `UPDATE` server-side
 * (`docs/features/decision-channels.md` → Status lifecycle), so a `409` here is a real, expected
 * outcome (someone else already resolved it) and must reach the caller as a message, never be
 * swallowed.
 */
export function useDecisionResolution({
  decisionId,
  accessToken,
  onDecisionUpdate,
}: UseDecisionResolutionOptions) {
  const t = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const resolveMutation = useMutation({
    mutationFn: (input: ResolveDecisionInput) =>
      apiRequest<DecisionResult>(
        `/decisions/${decisionId}/resolve`,
        { method: 'POST', body: JSON.stringify(input) },
        accessToken,
      ),
  });

  const supersedeMutation = useMutation({
    mutationFn: (input: SupersedeDecisionInput) =>
      apiRequest<DecisionResult>(
        `/decisions/${decisionId}/supersede`,
        { method: 'POST', body: JSON.stringify(input) },
        accessToken,
      ),
  });

  /** Returns whether the transition succeeded, so a caller-side panel closes only on success. */
  async function resolve(status: ResolveDecisionInput['status']): Promise<boolean> {
    setError(null);
    try {
      const result = await resolveMutation.mutateAsync({ status });
      onDecisionUpdate(result.decision);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-resolve-decision'));
      return false;
    }
  }

  async function supersede(supersededByDecisionId: string): Promise<boolean> {
    setError(null);
    try {
      const result = await supersedeMutation.mutateAsync({ supersededByDecisionId });
      onDecisionUpdate(result.decision);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-supersede-decision'));
      return false;
    }
  }

  return {
    resolve,
    supersede,
    error,
    isResolving: resolveMutation.isPending,
    isSuperseding: supersedeMutation.isPending,
  };
}
