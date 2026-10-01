/**
 * Per-device E2EE key management contract (docs/features/e2ee-key-management.md).
 *
 * Nothing in here carries private key material. The server only ever sees public keys and content
 * keys already wrapped for one specific device, so every type below is either a public key or
 * ciphertext.
 */

/** `e2ee:v1:<iv>:<ciphertext>` — passphrase-derived, legacy, still readable forever. */
export const E2EE_V1_PREFIX = 'e2ee:v1';
/** `e2ee:v2:<keyId>:<iv>:<ciphertext>` — per-device content key, AAD-bound to its scope. */
export const E2EE_V2_PREFIX = 'e2ee:v2';
/** Any encrypted message, either version. */
export const E2EE_PREFIX = 'e2ee:';

/** base64url of the first 16 bytes of SHA-256(raw content key bytes) -> 22 chars, unpadded. */
export const E2EE_KEY_ID_LENGTH = 22;
/** base64 SPKI of an ECDH P-256 public key. */
export const E2EE_PUBLIC_KEY_MAX_LENGTH = 256;
/**
 * A `wrappedKey` is base64 of `sender SPKI (91 bytes) || AES-KW wrap (40 bytes)` = 131 bytes = 176
 * base64 characters.
 *
 * The sender's public key is prepended because the recipient needs it to derive the same ECDH
 * wrapping key and the endpoint has no field for it. That leaks nothing — a device public key is
 * public by construction. It does mean the field is NOT an opaque AES-KW blob: anything that reads
 * or re-encodes it must preserve the split at `E2EE_SENDER_SPKI_BYTES`.
 *
 * The sender is NOT authenticated, so any member who can write to the scope can craft a wrap. The
 * defence is that the unwrapping client recomputes the key id of what it unwrapped and refuses it
 * unless it equals the `keyId` the row claims — so a forged wrap cannot substitute a different key,
 * only fail. See the wrap-poisoning entry in the feature doc's Risks section.
 */
export const E2EE_WRAPPED_KEY_MAX_LENGTH = 256;

/** Length of an uncompressed P-256 SPKI public key, the prefix of every `wrappedKey`. */
export const E2EE_SENDER_SPKI_BYTES = 91;
export const E2EE_DEVICE_LABEL_MAX_LENGTH = 80;
/** One upload call covers one `keyId`; a server with more member devices than this pages. */
export const E2EE_MAX_WRAPS_PER_UPLOAD = 200;

/** A registered device's public identity. Never includes a private key — none exists server-side. */
export interface DeviceKeyView {
  id: string;
  userId: string;
  deviceId: string;
  /** base64 SPKI, ECDH P-256. */
  publicKey: string;
  label: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

/** `POST /devices/keys`. Re-registering the same `deviceId` replaces its public key. */
export interface RegisterDeviceKeyInput {
  deviceId: string;
  publicKey: string;
  label?: string;
}

/** One content key wrapped for one device. See `E2EE_WRAPPED_KEY_MAX_LENGTH` for the field's layout. */
export interface WrappedKeyInput {
  deviceKeyId: string;
  /** base64 of `sender SPKI || AES-KW wrap`, not a bare AES-KW blob. */
  wrappedKey: string;
}

/**
 * `POST /channels/:channelId/encryption/keys` and the conversation equivalent. `keyId` is what the
 * row is keyed on; `version` rides along only as the "current key" ordering hint.
 */
export interface UploadWrappedKeysInput {
  keyId: string;
  version: number;
  wraps: WrappedKeyInput[];
}

/** Idempotent upsert: a wrap already stored for the same `(scope, keyId, deviceKeyId)` is counted, not an error. */
export interface UploadWrappedKeysResult {
  accepted: number;
  alreadyPresent: number;
}

/** A device of some member that holds no wrap for the scope's current `keyId` yet. */
export interface PendingWrapTarget {
  deviceKeyId: string;
  publicKey: string;
  userId: string;
}

/**
 * `GET /channels/:channelId/encryption/pending-wraps` and the conversation equivalent: who still
 * needs a wrap from a caller that already holds the key. `keyId` is null when the scope has no
 * content key at all yet.
 */
export interface PendingWrapsView {
  keyId: string | null;
  version: number;
  missing: PendingWrapTarget[];
}

/** One `(scope, keyId)` pair this device is missing, from the account-wide endpoint. */
export interface PendingWrapScope {
  channelId: string | null;
  conversationId: string | null;
  keyId: string;
  version: number;
}

/**
 * `GET /devices/keys/pending-wraps?deviceId=` — every pair where a sibling device of the same
 * account holds a wrap that this device does not. Carries no key material.
 */
export interface DevicePendingWrapsView {
  pending: PendingWrapScope[];
}

/**
 * `GET /channels/:channelId/encryption/keys?keyId=` and the conversation equivalent — the caller's
 * own wrap for one exact `keyId`. `null` means "not wrapped for this device yet", not an error.
 */
export interface WrappedKeyView {
  keyId: string;
  wrappedKey: string | null;
}

/**
 * The convergence rule for two keys independently generated for the same `version`
 * (docs/features/e2ee-key-management.md -> Edge cases): the lowest `keyId` by byte-wise string
 * comparison wins, decided client-side with no server arbitration so every client agrees.
 */
export function currentContentKeyId(keyIds: readonly string[]): string | null {
  if (!keyIds.length) return null;
  return keyIds.reduce((lowest, candidate) => (candidate < lowest ? candidate : lowest));
}

/**
 * The same candidates in the order a client should try them, lowest `keyId` first. A caller that
 * cannot unwrap the first can walk the rest, which is what keeps a member who uploaded wraps under a
 * forged `keyId` from stalling the whole scope (feature doc -> Risks, forged `keyId`).
 */
export function contentKeyIdsByPreference(keyIds: readonly string[]): string[] {
  return [...keyIds].sort();
}
