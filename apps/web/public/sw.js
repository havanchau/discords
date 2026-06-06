/* global clients */
const APP_URL = self.location.origin;

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const channelId = data.data?.channelId;
  const options = {
    body: data.body,
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Open chat' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: channelId ? `channel-${channelId}` : undefined,
    renotify: Boolean(channelId),
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Discord Clone', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
