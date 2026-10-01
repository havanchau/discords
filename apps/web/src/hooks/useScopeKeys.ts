import { useCallback, useEffect, useRef, useState } from 'react';
import { currentContentKeyId, type PendingWrapsView } from '@discord-clone/shared';
import {
  fetchScopePendingWraps,
  fetchWrappedKey,
  uploadWrappedKeys,
  type AuthState,
  type EncryptionScope,
} from '@/api';
import {
  computeContentKeyId,
  decryptChannelMessage,
  decryptScopedMessage,
  deriveChannelKey,
  encryptScopedMessage,
  generateContentKey,
  isEncryptedMessage,
  parseEncryptedMessage,
  unwrapContentKey,
  wrapContentKey,
} from '@/e2ee';
import { listContentKeyIds, loadContentKey, saveContentKey } from '@/e2eeStore';
import { useTranslation } from '@/i18n/LocaleProvider';
import type { DeviceIdentity, DeviceKeysState } from './useDeviceKeys';

/** A key that is known to be missing is not asked for again until this long has passed. */
const MISSING_KEY_RETRY_MS = 10_000;
/** One pending-wraps page is capped server-side, so a large scope is covered over several rounds. */
const MAX_SHARE_ROUNDS = 10;

/** A channel or conversation as the sender sees it right now. */
export interface EncryptionScopeState extends EncryptionScope {
  isEncrypted: boolean;
  /** `encryptionKeyVersion`; only an ordering hint, never what a message references. */
  version: number;
}

export type ContentDecryption =
  | { status: 'plain' }
  | { status: 'decrypted'; content: string }
  | { status: 'locked' };

interface SendKey {
  key: CryptoKey;
  keyId: string;
}

interface Session {
  userId: string;
  token: string;
  identity: DeviceIdentity;
}

interface UseScopeKeysOptions {
  auth: AuthState | null;
  deviceKeys: DeviceKeysState;
  onError: (message: string | null) => void;
}

function scopeKey(scope: EncryptionScope) {
  return `${scope.kind}:${scope.id}`;
}

/**
 * Content keys for channels or conversations: look one up by the `keyId` a message names, share the
 * current one with devices that lack it, and pick (or, as the fallback generator, create) the key a
 * new send is encrypted under. Every returned function keeps its identity across renders, so
 * memoized message code that holds them does not re-create.
 */
export function useScopeKeys({ auth, deviceKeys, onError }: UseScopeKeysOptions) {
  const t = useTranslation();
  const authRef = useRef(auth);
  const identityRef = useRef(deviceKeys.identity);
  const tRef = useRef(t);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    authRef.current = auth;
    identityRef.current = deviceKeys.identity;
    tRef.current = t;
    onErrorRef.current = onError;
  }, [auth, deviceKeys.identity, t, onError]);

  const caches = useRef({
    keys: new Map<string, CryptoKey>(),
    inflight: new Map<string, Promise<CryptoKey | null>>(),
    retryAt: new Map<string, number>(),
    resolving: new Map<string, Promise<SendKey>>(),
    // Passphrase keys for legacy `v1` messages. Memory only: a passphrase key is never stored.
    legacy: new Map<string, CryptoKey>(),
  });
  // Bumped when a key becomes available, so locked messages can be opened again.
  const [keyEpoch, setKeyEpoch] = useState(0);

  const requireSession = useCallback((): Session => {
    const current = authRef.current;
    const identity = identityRef.current;
    if (!current || !identity) throw new Error(tRef.current('encryption.error.deviceNotReady'));
    return { userId: current.user.id, token: current.accessToken, identity };
  }, []);

  const getKey = useCallback(
    async (scope: EncryptionScope, keyId: string, version: number | null) => {
      const current = authRef.current;
      const identity = identityRef.current;
      if (!current || !identity) return null;
      const { keys, inflight, retryAt } = caches.current;
      const id = `${scopeKey(scope)}:${keyId}`;
      const cached = keys.get(id);
      if (cached) return cached;
      const running = inflight.get(id);
      if (running) return running;
      if ((retryAt.get(id) ?? 0) > Date.now()) return null;

      const task = (async () => {
        const stored = await loadContentKey(current.user.id, scope, keyId);
        if (stored) {
          if (stored.version === null && version !== null) {
            await saveContentKey(current.user.id, scope, { ...stored, version });
          }
          keys.set(id, stored.key);
          return stored.key;
        }
        const { wrappedKey } = await fetchWrappedKey(
          scope,
          keyId,
          identity.deviceId,
          current.accessToken,
        );
        if (!wrappedKey) return null;
        const key = await unwrapContentKey(wrappedKey, identity.privateKey);
        // A wrap is unauthenticated (anyone can address one to our public key), so the key is only
        // trusted if it hashes to the id the message names.
        if ((await computeContentKeyId(key)) !== keyId) {
          throw new Error(tRef.current('encryption.error.keyMismatch'));
        }
        await saveContentKey(current.user.id, scope, { keyId, version, key });
        keys.set(id, key);
        setKeyEpoch((epoch) => epoch + 1);
        return key;
      })();
      inflight.set(id, task);
      try {
        const key = await task;
        if (!key) retryAt.set(id, Date.now() + MISSING_KEY_RETRY_MS);
        return key;
      } catch (err) {
        retryAt.set(id, Date.now() + MISSING_KEY_RETRY_MS);
        onErrorRef.current(
          err instanceof Error ? err.message : tRef.current('encryption.error.keyFetch'),
        );
        throw err;
      } finally {
        inflight.delete(id);
      }
    },
    [],
  );

  const decryptContent = useCallback(
    async (scope: EncryptionScope, content: string): Promise<ContentDecryption> => {
      if (!isEncryptedMessage(content)) return { status: 'plain' };
      const parsed = parseEncryptedMessage(content);
      if (!parsed) return { status: 'locked' };

      // A failed decrypt is a state, not an error: the caller renders the locked placeholder, and a
      // failed key lookup was already reported by `getKey`.
      if (parsed.version === 'v1') {
        const legacyKey = caches.current.legacy.get(scope.id);
        if (!legacyKey) return { status: 'locked' };
        try {
          return { status: 'decrypted', content: await decryptChannelMessage(legacyKey, content) };
        } catch {
          return { status: 'locked' };
        }
      }
      try {
        const key = await getKey(scope, parsed.keyId, null);
        if (!key) return { status: 'locked' };
        return { status: 'decrypted', content: await decryptScopedMessage(key, scope.id, content) };
      } catch {
        return { status: 'locked' };
      }
    },
    [getKey],
  );

  /** Wraps the scope's current key for the devices the server says still lack it. */
  const shareMissingWraps = useCallback(
    async (scope: EncryptionScope, view: PendingWrapsView, session: Session) => {
      if (view.keyId === null || !view.missing.length) return 0;
      const key = await getKey(scope, view.keyId, view.version);
      // A device without the key has nothing to wrap with; a holder will do it.
      if (!key) return null;
      const wraps = await Promise.all(
        view.missing.map(async (target) => ({
          deviceKeyId: target.deviceKeyId,
          wrappedKey: await wrapContentKey(
            key,
            session.identity.privateKey,
            session.identity.publicKeySpki,
            target.publicKey,
          ),
        })),
      );
      const result = await uploadWrappedKeys(
        scope,
        { keyId: view.keyId, version: view.version, wraps },
        session.token,
      );
      return result.accepted;
    },
    [getKey],
  );

  /**
   * Creates a content key and wraps it for this device only. The server answers "who else needs
   * it" once a key exists (`pending-wraps` lists every member device missing the key to a holder),
   * which is how the other members' devices get covered right after.
   */
  const generateKey = useCallback(
    async (scope: EncryptionScope, version: number, session: Session) => {
      const key = await generateContentKey();
      const keyId = await computeContentKeyId(key);
      const wrappedKey = await wrapContentKey(
        key,
        session.identity.privateKey,
        session.identity.publicKeySpki,
        session.identity.publicKeySpki,
      );
      await uploadWrappedKeys(
        scope,
        { keyId, version, wraps: [{ deviceKeyId: session.identity.deviceKeyId, wrappedKey }] },
        session.token,
      );
      // Stored only after the upload: a key nobody else was given must never become "the current one".
      await saveContentKey(session.userId, scope, { keyId, version, key });
      caches.current.keys.set(`${scopeKey(scope)}:${keyId}`, key);
    },
    [],
  );

  const resolveSendKeyOnce = useCallback(
    async (scope: EncryptionScopeState): Promise<SendKey> => {
      const session = requireSession();
      let view = await fetchScopePendingWraps(scope, session.token);
      const currentVersion = Math.max(scope.version, view.version);
      let hasGenerated = false;
      if (view.keyId === null || view.version < currentVersion) {
        // Nobody has a key for the current version (first enable, or a rotation nobody was online
        // for): this sender is the fallback generator.
        await generateKey(scope, currentVersion, session);
        hasGenerated = true;
        view = await fetchScopePendingWraps(scope, session.token);
        if (view.keyId === null || view.version < currentVersion) {
          throw new Error(tRef.current('encryption.error.keyShareFailed'));
        }
      }
      if (hasGenerated) {
        // Every member device must hold the key before the first message uses it; a failed upload
        // here fails the send rather than posting something half the members cannot open.
        for (let round = 0; round < MAX_SHARE_ROUNDS && view.missing.length; round += 1) {
          if ((await shareMissingWraps(scope, view, session)) === null) break;
          view = await fetchScopePendingWraps(scope, session.token);
        }
      }
      const heldKeyIds = await listContentKeyIds(session.userId, scope, currentVersion);
      const keyId = currentContentKeyId([
        ...(view.version === currentVersion && view.keyId ? [view.keyId] : []),
        ...heldKeyIds,
      ]);
      const key = keyId ? await getKey(scope, keyId, currentVersion) : null;
      if (!keyId || !key) throw new Error(tRef.current('encryption.error.waitingForKey'));
      return { key, keyId };
    },
    [generateKey, getKey, requireSession, shareMissingWraps],
  );

  /** Concurrent sends into one scope share one resolution instead of racing to generate a key. */
  const resolveSendKey = useCallback(
    (scope: EncryptionScopeState) => {
      const { resolving } = caches.current;
      const id = scopeKey(scope);
      const running = resolving.get(id);
      if (running) return running;
      const task = resolveSendKeyOnce(scope).finally(() => resolving.delete(id));
      resolving.set(id, task);
      return task;
    },
    [resolveSendKeyOnce],
  );

  /**
   * Plaintext in, wire format out. Throws when the scope is encrypted and a key cannot be arranged
   * — a failed send must stay failed, never fall back to sending the plaintext.
   */
  const encryptContent = useCallback(
    async (scope: EncryptionScopeState, plaintext: string) => {
      if (!scope.isEncrypted || plaintext === '') return plaintext;
      const { key, keyId } = await resolveSendKey(scope);
      return encryptScopedMessage(key, keyId, scope.id, plaintext);
    },
    [resolveSendKey],
  );

  /** First enable: make sure a key exists and every member device holds it, before any send. */
  const ensureKey = useCallback(
    async (scope: EncryptionScopeState) => {
      await resolveSendKey(scope);
    },
    [resolveSendKey],
  );

  /** Housekeeping for an open scope: hand the current key to devices that joined or were missed. */
  const shareCurrentKey = useCallback(
    async (scope: EncryptionScopeState) => {
      if (!scope.isEncrypted || !identityRef.current) return;
      const session = requireSession();
      const view = await fetchScopePendingWraps(scope, session.token);
      await shareMissingWraps(scope, view, session);
    },
    [requireSession, shareMissingWraps],
  );

  const unlockLegacy = useCallback(async (scopeId: string, passphrase: string) => {
    caches.current.legacy.set(scopeId, await deriveChannelKey(scopeId, passphrase));
    setKeyEpoch((epoch) => epoch + 1);
  }, []);

  const forgetLegacy = useCallback((scopeId: string) => {
    caches.current.legacy.delete(scopeId);
  }, []);

  const reset = useCallback(() => {
    const { keys, inflight, retryAt, resolving, legacy } = caches.current;
    [keys, inflight, retryAt, resolving, legacy].forEach((cache) => cache.clear());
  }, []);

  return {
    keyEpoch,
    decryptContent,
    encryptContent,
    ensureKey,
    shareCurrentKey,
    unlockLegacy,
    forgetLegacy,
    reset,
  };
}
