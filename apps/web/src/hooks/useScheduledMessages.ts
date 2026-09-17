import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { RealtimeEvents } from '@discord-clone/shared';
import {
  apiRequest,
  CreateScheduledMessageInput,
  ScheduledMessage,
  ScheduledMessageUpdatedPayload,
  UpdateScheduledMessageInput,
  uploadMessageAttachments,
} from '@/api';
import { useAuthContext, useSocketContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

export interface ScheduledDestination {
  type: 'channel' | 'conversation';
  id: string;
}

export interface ScheduleMessageRequest {
  content: string;
  files: File[];
  replyToMessageId?: string;
  /** ISO instant. */
  sendAt: string;
}

interface ScheduledMessagesResult {
  scheduledMessages: ScheduledMessage[];
}

const noScheduledMessages: ScheduledMessage[] = [];

function listPath(destination: ScheduledDestination) {
  return destination.type === 'channel'
    ? `/channels/${destination.id}/scheduled-messages`
    : `/direct-conversations/${destination.id}/scheduled-messages`;
}

function bySendAt(left: ScheduledMessage, right: ScheduledMessage) {
  return left.sendAt.localeCompare(right.sendAt);
}

/**
 * The caller's pending and failed scheduled messages for one channel or conversation. Mutations
 * write their answer into the cache; a send or failure from the server sweep refetches through
 * `scheduled-message:updated`.
 */
export function useScheduledMessages(destination: ScheduledDestination) {
  const { auth } = useAuthContext();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const userId = auth?.user.id ?? 'anonymous';
  const queryKey = queryKeys.scheduledMessages(userId, destination.type, destination.id);

  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () => apiRequest<ScheduledMessagesResult>(listPath(destination), {}, token),
  });

  useEffect(() => {
    if (!socket) return;
    const handleUpdated = (payload: ScheduledMessageUpdatedPayload) => {
      const matches =
        destination.type === 'channel'
          ? payload.channelId === destination.id
          : payload.conversationId === destination.id;
      if (!matches) return;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.scheduledMessages(userId, destination.type, destination.id),
      });
    };
    socket.on(RealtimeEvents.ScheduledMessageUpdated, handleUpdated);
    return () => {
      socket.off(RealtimeEvents.ScheduledMessageUpdated, handleUpdated);
    };
  }, [socket, queryClient, userId, destination.type, destination.id]);

  const writeCache = useCallback(
    (update: (current: ScheduledMessage[]) => ScheduledMessage[]) => {
      queryClient.setQueryData<ScheduledMessagesResult>(queryKey, (current) => ({
        scheduledMessages: update(current?.scheduledMessages ?? []).sort(bySendAt),
      }));
    },
    [queryClient, queryKey],
  );

  const replaceInCache = useCallback(
    ({ scheduledMessage }: { scheduledMessage: ScheduledMessage }) =>
      writeCache((current) => [
        ...current.filter((item) => item.id !== scheduledMessage.id),
        scheduledMessage,
      ]),
    [writeCache],
  );

  const scheduleMutation = useMutation({
    mutationFn: async (request: ScheduleMessageRequest) => {
      if (!token) throw new Error('Not signed in');
      // Files are uploaded now, like a live send; the scheduled row keeps their URLs.
      const attachments = await uploadMessageAttachments(request.files, token);
      const input: CreateScheduledMessageInput = {
        content: request.content,
        attachments,
        replyToMessageId: request.replyToMessageId,
        sendAt: request.sendAt,
      };
      return apiRequest<{ scheduledMessage: ScheduledMessage }>(
        listPath(destination),
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    onSuccess: replaceInCache,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateScheduledMessageInput }) =>
      apiRequest<{ scheduledMessage: ScheduledMessage }>(
        `/scheduled-messages/${id}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: replaceInCache,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: true }>(`/scheduled-messages/${id}`, { method: 'DELETE' }, token),
    onSuccess: (_result, id) => writeCache((current) => current.filter((item) => item.id !== id)),
  });

  const scheduledMessages = query.data?.scheduledMessages ?? noScheduledMessages;
  const { pending, failed } = useMemo(
    () => ({
      pending: scheduledMessages.filter((item) => item.status === 'PENDING'),
      failed: scheduledMessages.filter((item) => item.status === 'FAILED'),
    }),
    [scheduledMessages],
  );

  return {
    pending,
    failed,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    schedule: scheduleMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    isScheduling: scheduleMutation.isPending,
    isMutating: updateMutation.isPending || removeMutation.isPending,
  };
}

export type ScheduledMessagesState = ReturnType<typeof useScheduledMessages>;
