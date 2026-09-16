import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { apiRequest, AuthState, NotificationItem } from '../api';
import { useTranslation } from '../i18n/LocaleProvider';
import { queryKeys } from '../query/queryKeys';

type TranslationKey = Parameters<ReturnType<typeof useTranslation>>[0];

interface UseNotificationsOptions {
  auth: AuthState | null;
  setWorkspaceError: (message: string | null) => void;
}

interface NotificationsResult {
  items: NotificationItem[];
  unreadCount: number;
}

const MAX_CACHED_NOTIFICATIONS = 30;
const emptyResult: NotificationsResult = { items: [], unreadCount: 0 };

export function useNotifications({ auth, setWorkspaceError }: UseNotificationsOptions) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const userId = auth?.user.id;
  const queryKey = queryKeys.notifications(userId ?? 'anonymous');

  // The list is only fetched once the notifications panel has asked for it, as it was before;
  // from then on React Query keeps it cached and deduplicates further reads.
  const [hasBeenRequested, setHasBeenRequested] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey,
    enabled: Boolean(token && userId) && hasBeenRequested,
    queryFn: () => apiRequest<NotificationsResult>('/notifications', {}, token),
  });

  const writeCache = useCallback(
    (update: (current: NotificationsResult) => NotificationsResult) => {
      queryClient.setQueryData<NotificationsResult>(queryKey, (current) =>
        update(current ?? emptyResult),
      );
    },
    [queryClient, queryKey],
  );

  const reportError = useCallback(
    (error: unknown, fallbackKey: TranslationKey) => {
      setWorkspaceError(error instanceof Error ? error.message : t(fallbackKey));
    },
    [setWorkspaceError, t],
  );

  const loadNotifications = useCallback(async () => {
    if (!token || !userId) return;
    setHasBeenRequested(true);
    const result = await refetch();
    if (result.error) reportError(result.error, 'error.fallback.cannot-load-notifications');
  }, [token, userId, refetch, reportError]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!auth) return;
      try {
        const result = await apiRequest<{ notification: NotificationItem }>(
          `/notifications/${notificationId}/read`,
          { method: 'POST' },
          auth.accessToken,
        );
        writeCache((current) => ({
          items: current.items.map((item) =>
            item.id === notificationId ? result.notification : item,
          ),
          unreadCount: Math.max(0, current.unreadCount - 1),
        }));
      } catch (err) {
        reportError(err, 'error.fallback.cannot-update-notification');
      }
    },
    [auth, writeCache, reportError],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!auth) return;
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' }, auth.accessToken);
      writeCache((current) => ({
        items: current.items.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch (err) {
      reportError(err, 'error.fallback.cannot-update-notifications');
    }
  }, [auth, writeCache, reportError]);

  /** A socket event delivering one new notification, without refetching the list. */
  const pushNotification = useCallback(
    (notification: NotificationItem, unreadCount: number) => {
      writeCache((current) => ({
        items: [
          notification,
          ...current.items.filter((item) => item.id !== notification.id),
        ].slice(0, MAX_CACHED_NOTIFICATIONS),
        unreadCount,
      }));
    },
    [writeCache],
  );

  const setNotificationUnreadCount = useCallback(
    (value: number | ((current: number) => number)) => {
      writeCache((current) => ({
        ...current,
        unreadCount: typeof value === 'function' ? value(current.unreadCount) : value,
      }));
    },
    [writeCache],
  );

  return {
    notifications: data?.items ?? emptyResult.items,
    notificationUnreadCount: data?.unreadCount ?? emptyResult.unreadCount,
    isLoadingNotifications: isFetching,
    setNotificationUnreadCount,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    pushNotification,
  };
}
