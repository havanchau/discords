import { useQuery } from '@tanstack/react-query';
import { apiRequest, type WorkflowRunView } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noRuns: WorkflowRunView[] = [];

/** A workflow's run history (max 50, newest first), opened from its row in the workflow list. */
export function useWorkflowRuns(workflowId: string | null) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;

  const query = useQuery({
    queryKey: queryKeys.workflowRuns(workflowId ?? ''),
    enabled: Boolean(token) && Boolean(workflowId),
    queryFn: () =>
      apiRequest<{ runs: WorkflowRunView[] }>(`/workflows/${workflowId}/runs`, {}, token),
  });

  return {
    runs: query.data?.runs ?? noRuns,
    isLoading: query.isPending,
    error: query.error,
  };
}
