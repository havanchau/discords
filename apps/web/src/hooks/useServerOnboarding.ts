import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiRequest,
  type AcceptServerOnboardingInput,
  type AcceptServerOnboardingResult,
  type ServerOnboarding,
  type UpdateServerOnboardingInput,
} from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

/**
 * A server's rules screening, for both the member's rules gate and the settings section. Pull-based
 * like AutoMod: no realtime event, so a member whose tab predates screening sees the API's refusal
 * until the server detail is refetched.
 */
export function useServerOnboarding(serverId: string) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.serverOnboarding(serverId);

  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () => apiRequest<ServerOnboarding>(`/servers/${serverId}/onboarding`, {}, token),
  });

  // `needsOnboarding` and the member's roles live on the server detail, so it is refetched too.
  const refetchServer = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.serverDetail(serverId) });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateServerOnboardingInput) =>
      apiRequest<ServerOnboarding>(
        `/servers/${serverId}/onboarding`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: (onboarding) => queryClient.setQueryData(queryKey, onboarding),
  });

  const acceptMutation = useMutation({
    mutationFn: (input: AcceptServerOnboardingInput) =>
      apiRequest<AcceptServerOnboardingResult>(
        `/servers/${serverId}/onboarding/accept`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await refetchServer();
    },
  });

  return {
    onboarding: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    updateOnboarding: updateMutation.mutateAsync,
    isSaving: updateMutation.isPending,
    acceptOnboarding: acceptMutation.mutateAsync,
    isAccepting: acceptMutation.isPending,
    refreshServer: refetchServer,
  };
}

export type ServerOnboardingState = ReturnType<typeof useServerOnboarding>;
