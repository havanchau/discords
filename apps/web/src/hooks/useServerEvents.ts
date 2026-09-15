import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import { apiRequest, AuthState, CreateServerEventInput, ServerEventView } from '../api';

interface UseServerEventsOptions {
  auth: AuthState | null;
  socket: Socket | null;
  serverId: string | null;
}

export function useServerEvents({ auth, socket, serverId }: UseServerEventsOptions) {
  const [events, setEvents] = useState<ServerEventView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const serverIdRef = useRef(serverId);
  const token = auth?.accessToken;

  const loadEvents = useCallback(
    async (targetServerId: string) => {
      if (!token) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await apiRequest<{ events: ServerEventView[] }>(
          `/servers/${targetServerId}/events`,
          {},
          token,
        );
        if (serverIdRef.current === targetServerId) setEvents(result.events);
      } catch (err) {
        if (serverIdRef.current === targetServerId) {
          setError(err instanceof Error ? err.message : 'Cannot load events');
        }
      } finally {
        if (serverIdRef.current === targetServerId) setIsLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    serverIdRef.current = serverId;
    setEvents([]);
    setError(null);
    setIsLoading(false);
    if (serverId) void loadEvents(serverId);
  }, [serverId, loadEvents]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdated = (payload: { serverId: string }) => {
      if (payload.serverId === serverIdRef.current) void loadEvents(payload.serverId);
    };
    socket.on(RealtimeEvents.ServerEventsUpdated, handleUpdated);
    return () => {
      socket.off(RealtimeEvents.ServerEventsUpdated, handleUpdated);
    };
  }, [socket, loadEvents]);

  async function createEvent(input: CreateServerEventInput) {
    if (!token || !serverId) return false;
    setPendingEventId('new');
    setError(null);
    try {
      await apiRequest(
        `/servers/${serverId}/events`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
      await loadEvents(serverId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot create event');
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
      await apiRequest(`/events/${eventId}`, { method: 'DELETE' }, token);
      setEvents((current) => current.filter((event) => event.id !== eventId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot cancel event');
    } finally {
      setPendingEventId(null);
    }
  }

  async function setInterest(eventId: string, interested: boolean) {
    if (!token) return;
    setPendingEventId(eventId);
    setError(null);
    try {
      const result = await apiRequest<{ interested: boolean; interestedCount: number }>(
        `/events/${eventId}/interest`,
        { method: 'PUT', body: JSON.stringify({ interested }) },
        token,
      );
      setEvents((current) =>
        current.map((event) =>
          event.id === eventId
            ? { ...event, interested: result.interested, interestedCount: result.interestedCount }
            : event,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot update interest');
    } finally {
      setPendingEventId(null);
    }
  }

  return { events, isLoading, error, pendingEventId, createEvent, cancelEvent, setInterest };
}

export type ServerEventsState = ReturnType<typeof useServerEvents>;
