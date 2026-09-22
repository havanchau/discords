import { useQuery } from '@tanstack/react-query';
import { apiRequest, type InsightsRange, type ServerInsights } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

/**
 * A server's insights for one range. Read-only and pull-based: it loads when the settings section
 * opens or the range changes, with no realtime event and nothing to invalidate.
 */
export function useServerInsights(serverId: string, range: InsightsRange) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;

  const query = useQuery({
    queryKey: queryKeys.serverInsights(serverId, range),
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<ServerInsights>(`/servers/${serverId}/insights?range=${range}`, {}, token),
  });

  return { insights: query.data, isLoading: query.isPending, error: query.error };
}
