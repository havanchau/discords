import { useCallback, useState } from 'react';
import { apiRequest, AuthState, NotificationItem } from '../api';

interface UseNotificationsOptions {
  auth: AuthState | null;
  setWorkspaceError: (message: string | null) => void;
}

export function useNotifications({ auth, setWorkspaceError }: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  const loadNotifications = useCallback(
    async (token = auth?.accessToken) => {
      if (!token) return;
      setIsLoadingNotifications(true);
      try {
        const result = await apiRequest<{ items: NotificationItem[]; unreadCount: number }>(
          '/notifications',
          {},
          token,
        );
        setNotifications(result.items);
        setNotificationUnreadCount(result.unreadCount);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot load notifications');
      } finally {
        setIsLoadingNotifications(false);
      }
    },
    [auth?.accessToken, setWorkspaceError],
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!auth) return;
      try {
        const result = await apiRequest<{ notification: NotificationItem }>(
          `/notifications/${notificationId}/read`,
          { method: 'POST' },
          auth.accessToken,
        );
        setNotifications((current) =>
          current.map((item) => (item.id === notificationId ? result.notification : item)),
        );
        setNotificationUnreadCount((count) => Math.max(0, count - 1));
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot update notification');
      }
    },
    [auth, setWorkspaceError],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!auth) return;
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' }, auth.accessToken);
      setNotifications((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      );
      setNotificationUnreadCount(0);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update notifications');
    }
  }, [auth, setWorkspaceError]);

  const pushNotification = useCallback((notification: NotificationItem, unreadCount: number) => {
    setNotifications((current) => [
      notification,
      ...current.filter((item) => item.id !== notification.id),
    ].slice(0, 30));
    setNotificationUnreadCount(unreadCount);
  }, []);

  return {
    notifications,
    notificationUnreadCount,
    isLoadingNotifications,
    setNotificationUnreadCount,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    pushNotification,
  };
}
