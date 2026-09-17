import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiRequest,
  BotSecret,
  CreateBotInput,
  CreateBotResult,
  OwnedBot,
  uploadFile,
} from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noBots: OwnedBot[] = [];

/**
 * The signed-in user's bots. Create and regenerate resolve to the plaintext bot token: the API returns
 * it once and it is never cached here.
 */
export function useOwnedBots() {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.ownedBots(auth?.user.id ?? 'none');

  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () => apiRequest<{ bots: OwnedBot[] }>('/bots', {}, token),
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, avatar }: { name: string; avatar: File | null }) => {
      const input: CreateBotInput = { name };
      if (avatar && token) input.avatarUrl = (await uploadFile(avatar, token)).url;
      return apiRequest<CreateBotResult>(
        '/bots',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const regenerateMutation = useMutation({
    mutationFn: (botId: string) =>
      apiRequest<BotSecret>(`/bots/${botId}/regenerate-token`, { method: 'POST' }, token),
  });

  const deleteMutation = useMutation({
    mutationFn: (botId: string) => apiRequest(`/bots/${botId}`, { method: 'DELETE' }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  async function createBot(name: string, avatar: File | null) {
    const result = await createMutation.mutateAsync({ name, avatar });
    return result.token;
  }

  async function regenerateToken(botId: string) {
    const result = await regenerateMutation.mutateAsync(botId);
    return result.token;
  }

  return {
    bots: query.data?.bots ?? noBots,
    isLoading: query.isPending && Boolean(token),
    error: query.error,
    createBot,
    regenerateToken,
    deleteBot: deleteMutation.mutateAsync,
    isBusy: createMutation.isPending || regenerateMutation.isPending || deleteMutation.isPending,
  };
}

/** The link a bot owner shares; opening it while signed in shows the authorize dialog. */
export function botAuthorizeUrl(botId: string) {
  return new URL(`/bots/${botId}/authorize`, window.location.origin).toString();
}
