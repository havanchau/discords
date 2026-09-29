import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiRequest,
  type AddWorkflowHttpAllowlistEntryInput,
  type CreateWorkflowInput,
  type CreateWorkflowResult,
  type UpdateWorkflowInput,
  type WorkflowHttpAllowlistEntryView,
  type WorkflowView,
} from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noWorkflows: WorkflowView[] = [];
const noAllowlistEntries: WorkflowHttpAllowlistEntryView[] = [];

/**
 * A server's workflows and its HTTP_CALL allowlist, for the settings section. Pull-based like
 * AutoMod's rules: loaded when the section opens and refetched after each change.
 */
export function useWorkflows(serverId: string) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const workflowsKey = queryKeys.serverWorkflows(serverId);
  const allowlistKey = queryKeys.workflowHttpAllowlist(serverId);

  const workflowsQuery = useQuery({
    queryKey: workflowsKey,
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<{ workflows: WorkflowView[] }>(`/servers/${serverId}/workflows`, {}, token),
  });

  const allowlistQuery = useQuery({
    queryKey: allowlistKey,
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<{ entries: WorkflowHttpAllowlistEntryView[] }>(
        `/servers/${serverId}/workflow-http-allowlist`,
        {},
        token,
      ),
  });

  const refetchWorkflows = () => queryClient.invalidateQueries({ queryKey: workflowsKey });
  const refetchAllowlist = () => queryClient.invalidateQueries({ queryKey: allowlistKey });

  const createMutation = useMutation({
    mutationFn: (input: CreateWorkflowInput) =>
      apiRequest<CreateWorkflowResult>(
        `/servers/${serverId}/workflows`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    onSettled: refetchWorkflows,
  });

  const updateMutation = useMutation({
    mutationFn: ({ workflowId, ...input }: UpdateWorkflowInput & { workflowId: string }) =>
      apiRequest<CreateWorkflowResult>(
        `/workflows/${workflowId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      ),
    onSettled: refetchWorkflows,
  });

  const deleteMutation = useMutation({
    mutationFn: (workflowId: string) =>
      apiRequest<{ ok: true }>(`/workflows/${workflowId}`, { method: 'DELETE' }, token),
    onSettled: refetchWorkflows,
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: (workflowId: string) =>
      apiRequest<{ triggerUrl: string }>(
        `/workflows/${workflowId}/regenerate-token`,
        { method: 'POST' },
        token,
      ),
    onSettled: refetchWorkflows,
  });

  const addAllowlistEntryMutation = useMutation({
    mutationFn: (input: AddWorkflowHttpAllowlistEntryInput) =>
      apiRequest<{ entry: WorkflowHttpAllowlistEntryView }>(
        `/servers/${serverId}/workflow-http-allowlist`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    onSettled: refetchAllowlist,
  });

  const removeAllowlistEntryMutation = useMutation({
    mutationFn: (entryId: string) =>
      apiRequest<{ ok: true }>(
        `/servers/${serverId}/workflow-http-allowlist/${entryId}`,
        { method: 'DELETE' },
        token,
      ),
    onSettled: refetchAllowlist,
  });

  return {
    workflows: workflowsQuery.data?.workflows ?? noWorkflows,
    isLoading: workflowsQuery.isPending,
    error: workflowsQuery.error,
    createWorkflow: createMutation.mutateAsync,
    updateWorkflow: updateMutation.mutateAsync,
    deleteWorkflow: deleteMutation.mutateAsync,
    regenerateToken: regenerateTokenMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    pendingWorkflowId: updateMutation.isPending
      ? updateMutation.variables?.workflowId
      : deleteMutation.isPending
        ? deleteMutation.variables
        : undefined,
    allowlistEntries: allowlistQuery.data?.entries ?? noAllowlistEntries,
    isLoadingAllowlist: allowlistQuery.isPending,
    allowlistError: allowlistQuery.error,
    addAllowlistEntry: addAllowlistEntryMutation.mutateAsync,
    removeAllowlistEntry: removeAllowlistEntryMutation.mutateAsync,
    isSavingAllowlistEntry: addAllowlistEntryMutation.isPending,
    pendingAllowlistEntryId: removeAllowlistEntryMutation.isPending
      ? removeAllowlistEntryMutation.variables
      : undefined,
  };
}

export type WorkflowsState = ReturnType<typeof useWorkflows>;
