import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiRequest,
  type PlatformReportDetail,
  type PlatformReportPage,
  type PlatformReportResolution,
  type PlatformReportStatus,
  type ResolvePlatformReportInput,
  type User,
} from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noReports: PlatformReportPage['reports'] = [];

/**
 * Whether the signed-in user is a platform admin, for showing the entry point only — the API is
 * the real check on every `/platform/*` request.
 *
 * `auth.user` (from login/refresh) is a narrower shape than `GET /users/me` and does not carry
 * `platformRole`, so this fetches the profile once per session rather than trusting `auth.user`
 * (see `docs/features/platform-report-review.md` Deviations).
 */
export function usePlatformAdminAccess() {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;
  const userId = auth?.user.id;

  const query = useQuery({
    queryKey: queryKeys.meProfile(userId ?? 'anonymous'),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    queryFn: () => apiRequest<{ user: User }>('/users/me', {}, token),
  });

  return query.data?.user.platformRole === 'ADMIN';
}

/** The platform-admin queue of `ServerReport` rows; only reachable when `platformRole` is `ADMIN`. */
export function usePlatformReportQueue(status: PlatformReportStatus, serverId: string) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;

  const query = useInfiniteQuery({
    queryKey: queryKeys.platformReports(status, serverId),
    enabled: Boolean(token),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('status', status);
      if (serverId) params.set('serverId', serverId);
      if (pageParam) params.set('cursor', pageParam);
      const search = params.toString();
      return apiRequest<PlatformReportPage>(
        `/platform/reports${search ? `?${search}` : ''}`,
        {},
        token,
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  return {
    reports: query.data?.pages.flatMap((page) => page.reports) ?? noReports,
    isLoading: query.isPending,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}

/** One report plus the reported server's summary, for the detail view. */
export function usePlatformReportDetail(reportId: string | null) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;

  const query = useQuery({
    queryKey: queryKeys.platformReportDetail(reportId ?? 'none'),
    enabled: Boolean(token && reportId),
    queryFn: () => apiRequest<PlatformReportDetail>(`/platform/reports/${reportId}`, {}, token),
  });

  return {
    detail: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
  };
}

/** Dismisses or delists a report; invalidates every list tab and the detail view. */
export function useResolvePlatformReport() {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;

  return useMutation({
    mutationFn: ({
      reportId,
      resolution,
      note,
    }: {
      reportId: string;
      resolution: PlatformReportResolution;
      note?: ResolvePlatformReportInput['note'];
    }) =>
      apiRequest<{ report: PlatformReportDetail['report'] }>(
        `/platform/reports/${reportId}/${resolution === 'DISMISSED' ? 'dismiss' : 'delist'}`,
        { method: 'POST', body: JSON.stringify({ note } satisfies ResolvePlatformReportInput) },
        token,
      ),
    onSuccess: ({ report }) => {
      queryClient.setQueryData(
        queryKeys.platformReportDetail(report.id),
        (current: PlatformReportDetail | undefined) => (current ? { ...current, report } : current),
      );
      // A delist also changes the server summary (`listed`), which the resolve response omits.
      void queryClient.invalidateQueries({ queryKey: queryKeys.platformReportDetail(report.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.platformReportsOf() });
    },
  });
}
