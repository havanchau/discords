import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiEndpointUrl,
  apiRequest,
  ChannelWebhook,
  CreateWebhookInput,
  CreateWebhookResult,
  uploadFile,
  WebhookSecret,
} from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noWebhooks: ChannelWebhook[] = [];

/**
 * A text channel's incoming webhooks. Create and regenerate resolve to the full webhook URL, which
 * holds the plaintext token: the API returns it once and it is never cached here.
 */
export function useChannelWebhooks(serverId: string, channelId: string) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.channelWebhooks(channelId);
  const basePath = `/servers/${serverId}/channels/${channelId}/webhooks`;

  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () => apiRequest<{ webhooks: ChannelWebhook[] }>(basePath, {}, token),
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, avatar }: { name: string; avatar: File | null }) => {
      const input: CreateWebhookInput = { name };
      if (avatar && token) input.avatarUrl = (await uploadFile(avatar, token)).url;
      return apiRequest<CreateWebhookResult>(
        basePath,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const regenerateMutation = useMutation({
    mutationFn: (webhookId: string) =>
      apiRequest<WebhookSecret>(`${basePath}/${webhookId}/regenerate`, { method: 'POST' }, token),
  });

  const deleteMutation = useMutation({
    mutationFn: (webhookId: string) =>
      apiRequest(`${basePath}/${webhookId}`, { method: 'DELETE' }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  async function createWebhook(name: string, avatar: File | null) {
    const result = await createMutation.mutateAsync({ name, avatar });
    return apiEndpointUrl(result.path);
  }

  async function regenerateWebhook(webhookId: string) {
    const result = await regenerateMutation.mutateAsync(webhookId);
    return apiEndpointUrl(result.path);
  }

  return {
    webhooks: query.data?.webhooks ?? noWebhooks,
    isLoading: query.isPending && Boolean(token),
    error: query.error,
    createWebhook,
    regenerateWebhook,
    deleteWebhook: deleteMutation.mutateAsync,
    isBusy: createMutation.isPending || regenerateMutation.isPending || deleteMutation.isPending,
  };
}
