import { apiRequest } from '../api';

export async function enablePushNotifications(token: string) {
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await getVapidPublicKey(token)),
    }));

  await apiRequest(
    '/push/subscribe',
    {
      method: 'POST',
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        deviceName: navigator.userAgent,
      }),
    },
    token,
  );
}

export async function disablePushNotifications(token: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await apiRequest(
    '/push/unsubscribe',
    {
      method: 'POST',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    },
    token,
  );
  await subscription.unsubscribe();
}

async function getVapidPublicKey(token: string) {
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (envKey) return envKey;
  const result = await apiRequest<{ publicKey: string }>('/push/public-key', {}, token);
  if (!result.publicKey) {
    throw new Error('VAPID public key is not configured.');
  }
  return result.publicKey;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
