import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import { apiRequest, AuthState, CreateServerEventInput, ServerEventView } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { queryKeys } from '@/query/queryKeys';

interface UseServerEventsOptions {
  auth: AuthState | null;
  socket: Socket | null;
  serverId: string | null;
}

interface EventsResult {
  events: ServerEventView[];
}

const noEvents: ServerEventView[] = [];

export function useServerEvents({ auth, socket, serverId }: UseServerEventsOptions) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  // The key carries the server id, so switching servers shows that server's events and never the
  // previous one's — the race the manual ref guard used to cover.
  const queryKey = queryKeys.serverEvents(serverId ?? 'none');

  const [error, setError] = useState<string | null>(null);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(token && serverId),
    queryFn: () => apiRequest<EventsResult>(`/servers/${serverId}/events`, {}, token),
  });

  useEffect(() => {
    if (!socket) return;
    const handleUpdated = (payload: { serverId: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serverEvents(payload.serverId) });
    };
    socket.on(RealtimeEvents.ServerEventsUpdated, handleUpdated);
    return () => {
      socket.off(RealtimeEvents.ServerEventsUpdated, handleUpdated);
    };
  }, [socket, queryClient]);

  const createMutation = useMutation({
    mutationFn: (input: CreateServerEventInput) =>
      apiRequest(
        `/servers/${serverId}/events`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
  });

  const cancelMutation = useMutation({
    mutationFn: (eventId: string) => apiRequest(`/events/${eventId}`, { method: 'DELETE' }, token),
  });

  const interestMutation = useMutation({
    mutationFn: ({ eventId, interested }: { eventId: string; interested: boolean }) =>
      apiRequest<{ interested: boolean; interestedCount: number }>(
        `/events/${eventId}/interest`,
        { method: 'PUT', body: JSON.stringify({ interested }) },
        token,
      ),
  });

  async function createEvent(input: CreateServerEventInput) {
    if (!token || !serverId) return false;
    setPendingEventId('new');
    setError(null);
    try {
      await createMutation.mutateAsync(input);
      await queryClient.invalidateQueries({ queryKey });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-create-event'));
      return false;
    } finally {
      setPendingEventId(null);
    }
  }

  async function cancelEvent(eventId: string) {
    if (!token) return;
    setPendingEventId(eventId);
    setError(null);
    try {
      await cancelMutation.mutateAsync(eventId);
      queryClient.setQueryData<EventsResult>(queryKey, (current) =>
        current ? { events: current.events.filter((event) => event.id !== eventId) } : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-cancel-event'));
    } finally {
      setPendingEventId(null);
    }
  }

  async function setInterest(eventId: string, interested: boolean) {
    if (!token) return;
    setPendingEventId(eventId);
    setError(null);
    try {
      const result = await interestMutation.mutateAsync({ eventId, interested });
      queryClient.setQueryData<EventsResult>(queryKey, (current) =>
        current
          ? {
              events: current.events.map((event) =>
                event.id === eventId
                  ? {
                      ...event,
                      interested: result.interested,
                      interestedCount: result.interestedCount,
                    }
                  : event,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-update-interest'));
    } finally {
      setPendingEventId(null);
    }
  }

  return {
    events: data?.events ?? noEvents,
    isLoading,
    error,
    pendingEventId,
    createEvent,
    cancelEvent,
    setInterest,
  };
}

export type ServerEventsState = ReturnType<typeof useServerEvents>;
