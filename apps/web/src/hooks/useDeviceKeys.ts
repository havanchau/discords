import { useCallback, useEffect, useRef, useState } from 'react';
import type { PendingWrapScope } from '@discord-clone/shared';
import { ApiError, fetchDevicePendingWraps, registerDeviceKey, type AuthState } from '@/api';
import { exportPublicKey, generateDeviceKeyPair } from '@/e2ee';
import {
  deleteDeviceIdentity,
  loadDeviceIdentity,
  saveDeviceIdentity,
  type StoredDeviceIdentity,
} from '@/e2eeStore';
import { useTranslation } from '@/i18n/LocaleProvider';
import { describeUserAgent } from '@/utils/userAgent';

const PENDING_WRAPS_POLL_MS = 30_000;
const DEVICE_LABEL_MAX_LENGTH = 80;
const HTTP_CONFLICT = 409;

/** This browser's registered identity. The private key is a non-extractable handle, never bytes. */
export interface DeviceIdentity {
  /** Client-generated, stable per browser profile. */
  deviceId: string;
  /** The server's id for this device's `DeviceKey` row — what wraps are addressed to. */
  deviceKeyId: string;
  privateKey: CryptoKey;
  /** base64 SPKI, exactly what was registered. */
  publicKeySpki: string;
}

export interface DeviceKeysState {
  status: 'loading' | 'ready' | 'error';
  identity: DeviceIdentity | null;
  error: string | null;
  /** Scopes where a sibling device of this account holds a key this device has no wrap for yet. */
  pendingWraps: PendingWrapScope[];
}

const noPendingWraps: PendingWrapScope[] = [];

async function createIdentity(): Promise<StoredDeviceIdentity> {
  const keyPair = await generateDeviceKeyPair();
  return {
    deviceId: crypto.randomUUID(),
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeySpki: await exportPublicKey(keyPair.publicKey),
  };
}

/**
 * Loads (or generates once) this browser's keypair, stores it in IndexedDB and registers the public
 * key. A device the user revoked stays revoked server-side (409), so it starts over with a fresh
 * identity instead of waiting forever for wraps that will never be addressed to it.
 */
async function bootstrapIdentity(userId: string, token: string): Promise<DeviceIdentity> {
  const label = describeUserAgent(navigator.userAgent).slice(0, DEVICE_LABEL_MAX_LENGTH);
  let stored = await loadDeviceIdentity(userId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!stored) {
      stored = await createIdentity();
      await saveDeviceIdentity(userId, stored);
    }
    try {
      const { deviceKey } = await registerDeviceKey(
        { deviceId: stored.deviceId, publicKey: stored.publicKeySpki, label },
        token,
      );
      return {
        deviceId: stored.deviceId,
        deviceKeyId: deviceKey.id,
        privateKey: stored.privateKey,
        publicKeySpki: stored.publicKeySpki,
      };
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== HTTP_CONFLICT) throw error;
      await deleteDeviceIdentity(userId);
      stored = null;
    }
  }
  throw new Error('Device registration was refused twice');
}

/**
 * Device keypair lifecycle: generate once, keep in IndexedDB, register, and keep polling which
 * scopes this device is still waiting on. Call it once and pass the result down — a second instance
 * would register and poll twice.
 */
export function useDeviceKeys({ auth }: { auth: AuthState | null }): DeviceKeysState {
  const t = useTranslation();
  // Messages are looked up when something fails; a locale switch must not restart the bootstrap.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const userId = auth?.user.id ?? null;
  // Read through a ref: the access token refreshes often and must not restart the bootstrap.
  const tokenRef = useRef(auth?.accessToken ?? null);
  useEffect(() => {
    tokenRef.current = auth?.accessToken ?? null;
  }, [auth?.accessToken]);

  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [status, setStatus] = useState<DeviceKeysState['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pendingWraps, setPendingWraps] = useState<PendingWrapScope[]>(noPendingWraps);

  useEffect(() => {
    setIdentity(null);
    setPendingWraps(noPendingWraps);
    setError(null);
    const token = tokenRef.current;
    if (!userId || !token) {
      setStatus('loading');
      return;
    }
    setStatus('loading');
    let cancelled = false;
    // Two tabs must not both generate a keypair for the same account.
    navigator.locks
      .request(`discord-clone-e2ee-device:${userId}`, () => bootstrapIdentity(userId, token))
      .then((next) => {
        if (cancelled) return;
        setIdentity(next);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : tRef.current('encryption.error.deviceSetup'));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshPendingWraps = useCallback(async () => {
    const token = tokenRef.current;
    if (!identity || !token) return;
    try {
      const result = await fetchDevicePendingWraps(identity.deviceId, token);
      setPendingWraps(result.pending);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : tRef.current('encryption.error.pendingWraps'));
    }
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    void refreshPendingWraps();
    const timer = window.setInterval(() => void refreshPendingWraps(), PENDING_WRAPS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [identity, refreshPendingWraps]);

  return { status, identity, error, pendingWraps };
}
