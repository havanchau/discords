import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiRequest,
  CreateMessageReportInput,
  CreateMessageReportResult,
  MessageReport,
  MessageReportStatus,
  UpdateMessageReportInput,
} from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noReports: MessageReport[] = [];

/**
 * One status tab of a server's moderator queue. The queue is pull-based: it loads when the section
 * opens and is refetched after a moderator closes a report, with no realtime event.
 */
export function useMessageReportQueue(serverId: string, status: MessageReportStatus) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;

  const query = useQuery({
    queryKey: queryKeys.messageReports(serverId, status),
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<{ reports: MessageReport[] }>(
        `/servers/${serverId}/reports?status=${status}`,
        {},
        token,
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({ reportId, ...input }: UpdateMessageReportInput & { reportId: string }) =>
      apiRequest<{ report: MessageReport }>(
        `/servers/${serverId}/reports/${reportId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      ),
    // A closed report leaves one tab and enters another, so every tab of this server refetches.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messageReportsOf(serverId) }),
  });

  return {
    reports: query.data?.reports ?? noReports,
    isLoading: query.isPending,
    error: query.error,
    updateStatus: updateMutation.mutateAsync,
    pendingReportId: updateMutation.isPending ? updateMutation.variables?.reportId : undefined,
  };
}

/** Files a report as the signed-in member; `created` is false when one was already open. */
export function useCreateMessageReport(serverId: string) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;

  return useMutation({
    mutationFn: (input: CreateMessageReportInput) =>
      apiRequest<CreateMessageReportResult>(
        `/servers/${serverId}/reports`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    // A reporter who is also a moderator sees their own report in the queue without a reload.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messageReportsOf(serverId) }),
  });
}
