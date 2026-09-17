import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, AutoModRule, CreateAutoModRuleInput, UpdateAutoModRuleInput } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noRules: AutoModRule[] = [];

/**
 * A server's AutoMod rules for the settings section. Pull-based like the report queue: loaded when
 * the section opens and refetched after each change, with no realtime event.
 */
export function useAutoModRules(serverId: string) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.autoModRules(serverId);

  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<{ rules: AutoModRule[] }>(`/servers/${serverId}/automod-rules`, {}, token),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (input: CreateAutoModRuleInput) =>
      apiRequest<{ rule: AutoModRule }>(
        `/servers/${serverId}/automod-rules`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    onSettled: refetch,
  });

  const updateMutation = useMutation({
    mutationFn: ({ ruleId, ...input }: UpdateAutoModRuleInput & { ruleId: string }) =>
      apiRequest<{ rule: AutoModRule }>(
        `/automod-rules/${ruleId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      ),
    onSettled: refetch,
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) =>
      apiRequest<{ ok: true }>(`/automod-rules/${ruleId}`, { method: 'DELETE' }, token),
    onSettled: refetch,
  });

  return {
    rules: query.data?.rules ?? noRules,
    isLoading: query.isPending,
    error: query.error,
    createRule: createMutation.mutateAsync,
    updateRule: updateMutation.mutateAsync,
    deleteRule: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    pendingRuleId: updateMutation.isPending
      ? updateMutation.variables?.ruleId
      : deleteMutation.isPending
        ? deleteMutation.variables
        : undefined,
  };
}

export type AutoModRulesState = ReturnType<typeof useAutoModRules>;
