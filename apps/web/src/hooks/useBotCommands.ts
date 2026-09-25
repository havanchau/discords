import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSlashCommandInput,
  Json,
  SlashCommandView,
  UpdateSlashCommandInput,
} from '@discord-clone/shared';
import { apiRequest, type ServerSummary } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

/** A registered command as the API returns it (dates arrive as strings over JSON). */
export type BotSlashCommand = Json<SlashCommandView>;

const noServers: ServerSummary[] = [];
const noCommands: BotSlashCommand[] = [];

/**
 * The servers one of the viewer's own bots is a member of — the picker's source. It is not the same
 * set as the authorize dialog's, which lists servers the *viewer* administers.
 */
export function useBotServers(botId: string | null) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;
  const userId = auth?.user.id ?? 'none';

  const query = useQuery({
    queryKey: queryKeys.botServers(userId, botId ?? 'none'),
    enabled: Boolean(token && botId),
    queryFn: () => apiRequest<{ servers: ServerSummary[] }>(`/bots/${botId}/servers`, {}, token),
  });

  return {
    servers: query.data?.servers ?? noServers,
    isLoading: query.isPending && Boolean(token && botId),
    error: query.error,
  };
}

/**
 * One bot's slash commands in one server, over the owner's session. Every rule (reserved name,
 * duplicate, per-server limit, immutable name) stays on the API; a rejection surfaces as the
 * mutation's error.
 */
export function useBotCommands(botId: string | null, serverId: string | null) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const userId = auth?.user.id ?? 'none';
  const queryKey = queryKeys.botCommands(userId, botId ?? 'none', serverId ?? 'none');
  const basePath = `/bots/${botId}/servers/${serverId}/commands`;
  const isEnabled = Boolean(token && botId && serverId);

  const query = useQuery({
    queryKey,
    enabled: isEnabled,
    queryFn: () => apiRequest<{ commands: BotSlashCommand[] }>(basePath, {}, token),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (input: CreateSlashCommandInput) =>
      apiRequest<{ command: BotSlashCommand }>(
        basePath,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ commandId, input }: { commandId: string; input: UpdateSlashCommandInput }) =>
      apiRequest<{ command: BotSlashCommand }>(
        `${basePath}/${commandId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (commandId: string) =>
      apiRequest(`${basePath}/${commandId}`, { method: 'DELETE' }, token),
    onSuccess: invalidate,
  });

  return {
    commands: query.data?.commands ?? noCommands,
    isLoading: query.isPending && isEnabled,
    error: query.error,
    createCommand: createMutation.mutateAsync,
    updateCommand: updateMutation.mutateAsync,
    deleteCommand: deleteMutation.mutateAsync,
    isBusy: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
