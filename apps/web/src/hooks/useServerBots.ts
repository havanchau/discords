import { useQuery } from '@tanstack/react-query';
import type { Json, ServerInstalledBot } from '@discord-clone/shared';
import { apiRequest } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

/** A bot as one server's `MANAGE_SERVER` admin sees it (dates arrive as strings over JSON). */
export type ServerBot = Json<ServerInstalledBot>;

const noBots: ServerBot[] = [];

/**
 * A server's installed bots and their commands in that server, read-only
 * (`server-bot-commands-admin-view.md`). No mutation is exposed — this hook only queries.
 */
export function useServerBots(serverId: string) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;

  const query = useQuery({
    queryKey: queryKeys.serverBots(serverId),
    enabled: Boolean(token),
    queryFn: () => apiRequest<{ bots: ServerBot[] }>(`/servers/${serverId}/bots`, {}, token),
  });

  return { bots: query.data?.bots ?? noBots, isLoading: query.isPending, error: query.error };
}
