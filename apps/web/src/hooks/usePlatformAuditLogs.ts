import { useInfiniteQuery } from '@tanstack/react-query';
import { apiRequest, type PlatformAuditAction, type PlatformAuditLogPage } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noLogs: PlatformAuditLogPage['logs'] = [];

/**
 * The platform-wide audit trail (`GET /platform/audit-logs`) — rows that survive the deletion of
 * the server/report/account they describe, unlike the per-server `AuditLog`
 * (docs/features/platform-audit-log.md). Reachable only when `platformRole` is `ADMIN`, same guard
 * as `usePlatformReportQueue`.
 */
export function usePlatformAuditLogs(
  action: PlatformAuditAction | '',
  targetId: string,
  actorId: string,
) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;

  const query = useInfiniteQuery({
    queryKey: queryKeys.platformAuditLogs(action, targetId, actorId),
    enabled: Boolean(token),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (action) params.set('action', action);
      if (targetId) params.set('targetId', targetId);
      if (actorId) params.set('actorId', actorId);
      if (pageParam) params.set('cursor', pageParam);
      const search = params.toString();
      return apiRequest<PlatformAuditLogPage>(
        `/platform/audit-logs${search ? `?${search}` : ''}`,
        {},
        token,
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  return {
    logs: query.data?.pages.flatMap((page) => page.logs) ?? noLogs,
    isLoading: query.isPending,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
