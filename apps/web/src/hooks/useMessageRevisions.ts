import { useQuery } from '@tanstack/react-query';
import { apiRequest, MessageHistory } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

/**
 * The author's own view of a channel message's earlier versions. Pull-based: fetched when the dialog
 * opens, with no realtime event; the default stale time refetches it on the next open after an edit.
 */
export function useMessageRevisions(messageId: string) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;

  return useQuery({
    queryKey: queryKeys.messageHistory(messageId),
    enabled: Boolean(token),
    queryFn: () => apiRequest<MessageHistory>(`/messages/${messageId}/history`, {}, token),
  });
}

/** A moderator's view of a reported message's earlier versions, reached through the report. */
export function useReportMessageRevisions(serverId: string, reportId: string) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;

  return useQuery({
    queryKey: queryKeys.reportMessageHistory(serverId, reportId),
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<MessageHistory>(
        `/servers/${serverId}/reports/${reportId}/message-history`,
        {},
        token,
      ),
  });
}
