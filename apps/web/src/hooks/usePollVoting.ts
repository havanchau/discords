import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest, Poll } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { queryKeys } from '@/query/queryKeys';
import { withOptimisticVote } from '@/utils/polls';

interface UsePollVotingOptions {
  poll: Poll;
  accessToken: string;
  /** Writes the server's answer back into the message list that owns the poll. */
  onPollUpdate: (poll: Poll) => void;
  isVotersOpen: boolean;
}

interface PollResult {
  poll: Poll;
}

export function usePollVoting({
  poll,
  accessToken,
  onPollUpdate,
  isVotersOpen,
}: UsePollVotingOptions) {
  const t = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const voteMutation = useMutation({
    mutationFn: (optionIds: string[]) =>
      apiRequest<PollResult>(
        `/polls/${poll.id}/votes`,
        { method: 'PUT', body: JSON.stringify({ optionIds }) },
        accessToken,
      ),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      apiRequest<PollResult>(`/polls/${poll.id}/close`, { method: 'POST' }, accessToken),
  });

  // Realtime updates carry counts only, so voter names are fetched when the list is opened.
  const revision = `${poll.status}:${poll.options.map((option) => option.voteCount).join(',')}`;
  const voters = useQuery({
    queryKey: queryKeys.poll(poll.id, revision),
    enabled: poll.showVoters && isVotersOpen,
    queryFn: () => apiRequest<PollResult>(`/polls/${poll.id}`, {}, accessToken),
  });

  async function vote(optionIds: string[]) {
    setError(null);
    try {
      const result = await voteMutation.mutateAsync(optionIds);
      onPollUpdate(result.poll);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-vote-poll'));
    }
  }

  async function close() {
    setError(null);
    try {
      const result = await closeMutation.mutateAsync();
      onPollUpdate(result.poll);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-close-poll'));
    }
  }

  // While a vote is in flight the card shows it; the mutation variables are the pending selection.
  const displayPoll =
    voteMutation.isPending && voteMutation.variables
      ? withOptimisticVote(poll, voteMutation.variables)
      : poll;

  return {
    poll: displayPoll,
    error,
    isPending: voteMutation.isPending || closeMutation.isPending,
    vote,
    close,
    voters: {
      poll: voters.data?.poll ?? null,
      isLoading: voters.isLoading,
      error: voters.error ? voters.error.message : null,
    },
  };
}
