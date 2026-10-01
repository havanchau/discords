/**
 * IndexedDB home of everything the E2EE feature keeps on a device. `CryptoKey` objects are stored
 * as-is (structured clone), so the device private key is never serialized to bytes — it stays a
 * non-extractable handle that nothing, including this module, can read out.
 */

const DATABASE_NAME = 'discord-clone-e2ee';
const DATABASE_VERSION = 1;
const DEVICE_STORE = 'device';
const CONTENT_KEY_STORE = 'contentKeys';
const VERIFIED_STORE = 'verifiedDevices';
const KEY_SEPARATOR = '\u0000';

export interface StoredDeviceIdentity {
  deviceId: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  /** base64 SPKI of `publicKey`, the exact string registered with the server. */
  publicKeySpki: string;
}

export interface EncryptionScopeRef {
  kind: 'channel' | 'conversation';
  id: string;
}

export interface StoredContentKey {
  keyId: string;
  /** Null when the key was fetched for an old message and its rotation version is not known. */
  version: number | null;
  key: CryptoKey;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore(DEVICE_STORE);
      database.createObjectStore(CONTENT_KEY_STORE);
      database.createObjectStore(VERIFIED_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Cannot open the key database'));
  });
  databasePromise = opening;
  // A failed open must not stay cached, or every later call would fail the same way. The rejection
  // itself still reaches every caller through `opening`.
  opening.catch(() => {
    databasePromise = null;
  });
  return opening;
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Key database request failed'));
  });
}

/** IndexedDB hands back `any`; callers narrow it with the guards below before trusting it. */
async function readStore(
  storeName: string,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  const database = await openDatabase();
  return settle<unknown>(run(database.transaction(storeName, 'readonly').objectStore(storeName)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStoredDeviceIdentity(value: unknown): value is StoredDeviceIdentity {
  return (
    isRecord(value) &&
    typeof value.deviceId === 'string' &&
    typeof value.publicKeySpki === 'string' &&
    value.privateKey instanceof CryptoKey &&
    value.publicKey instanceof CryptoKey
  );
}

function isStoredContentKey(value: unknown): value is StoredContentKey {
  return (
    isRecord(value) &&
    typeof value.keyId === 'string' &&
    (typeof value.version === 'number' || value.version === null) &&
    value.key instanceof CryptoKey
  );
}

async function writeStore(storeName: string, run: (store: IDBObjectStore) => IDBRequest) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Key database write failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Key database write aborted'));
  });
  run(transaction.objectStore(storeName));
  await done;
}

function contentKeyPrefix(userId: string, scope: EncryptionScopeRef) {
  return [userId, scope.kind, scope.id, ''].join(KEY_SEPARATOR);
}

/* ---------------------------------------- device ---------------------------------------- */

export async function loadDeviceIdentity(userId: string) {
  const stored = await readStore(DEVICE_STORE, (store) => store.get(userId));
  return isStoredDeviceIdentity(stored) ? stored : null;
}

export function saveDeviceIdentity(userId: string, identity: StoredDeviceIdentity) {
  return writeStore(DEVICE_STORE, (store) => store.put(identity, userId));
}

export function deleteDeviceIdentity(userId: string) {
  return writeStore(DEVICE_STORE, (store) => store.delete(userId));
}

/* ------------------------------------- content keys ------------------------------------- */

export async function loadContentKey(userId: string, scope: EncryptionScopeRef, keyId: string) {
  const stored = await readStore(CONTENT_KEY_STORE, (store) =>
    store.get(contentKeyPrefix(userId, scope) + keyId),
  );
  return isStoredContentKey(stored) ? stored : null;
}

export function saveContentKey(userId: string, scope: EncryptionScopeRef, key: StoredContentKey) {
  return writeStore(CONTENT_KEY_STORE, (store) =>
    store.put(key, contentKeyPrefix(userId, scope) + key.keyId),
  );
}

/** Key ids this device holds for one scope at one rotation version. */
export async function listContentKeyIds(
  userId: string,
  scope: EncryptionScopeRef,
  version: number,
) {
  const prefix = contentKeyPrefix(userId, scope);
  // `\uffff` sorts after every character a key can contain, closing the prefix range.
  const stored = await readStore(CONTENT_KEY_STORE, (store) =>
    store.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)),
  );
  return (Array.isArray(stored) ? stored : [])
    .filter(isStoredContentKey)
    .filter((item) => item.version === version)
    .map((item) => item.keyId);
}

/* ------------------------------------ verified devices ------------------------------------ */

/**
 * A device counts as verified only while its registered public key is still the one that was
 * compared, so re-registering with a new key drops it back to unverified.
 */
export async function isDeviceVerified(userId: string, deviceKeyId: string, publicKey: string) {
  const verifiedKey = await readStore(VERIFIED_STORE, (store) =>
    store.get([userId, deviceKeyId].join(KEY_SEPARATOR)),
  );
  return verifiedKey === publicKey;
}

export function markDeviceVerified(userId: string, deviceKeyId: string, publicKey: string) {
  return writeStore(VERIFIED_STORE, (store) =>
    store.put(publicKey, [userId, deviceKeyId].join(KEY_SEPARATOR)),
  );
}
