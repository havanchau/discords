import { E2EE_PREFIX, E2EE_V2_PREFIX } from '@discord-clone/shared';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** An ECDH P-256 SPKI public key is always this long; the sender's key is prepended to each wrap. */
const P256_SPKI_BYTES = 91;
const KEY_ID_BYTES = 16;
const SAFETY_NUMBER_GROUP_BYTES = 5;
const SAFETY_NUMBER_GROUPS = 6;
const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;

export type ParsedEncryptedMessage =
  | { version: 'v1'; iv: string; ciphertext: string }
  | { version: 'v2'; keyId: string; iv: string; ciphertext: string };

export function isEncryptedMessage(content: string) {
  return content.startsWith(E2EE_PREFIX);
}

/**
 * Branches on the version segment first and only then splits by that version's part count, so a
 * `v1` message (no key id) and a `v2` message (key id) are both read correctly. Returns null for
 * anything that is not a well-formed encrypted message.
 */
export function parseEncryptedMessage(content: string): ParsedEncryptedMessage | null {
  const [scheme, version, ...parts] = content.split(':');
  if (scheme !== 'e2ee' || parts.some((part) => !part)) return null;
  if (version === 'v1' && parts.length === 2) {
    return { version, iv: parts[0], ciphertext: parts[1] };
  }
  if (version === 'v2' && parts.length === 3) {
    return { version, keyId: parts[0], iv: parts[1], ciphertext: parts[2] };
  }
  return null;
}

/* ---------------------------------- v1: legacy passphrase ---------------------------------- */

export async function deriveChannelKey(channelId: string, passphrase: string) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode(`discord-clone:${channelId}`),
      iterations: 210_000,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Opens a legacy `e2ee:v1:` message. Nothing writes `v1` any more; it stays readable forever. */
export async function decryptChannelMessage(key: CryptoKey, content: string) {
  const parsed = parseEncryptedMessage(content);
  if (parsed?.version !== 'v1') {
    throw new Error('Unsupported encrypted message');
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(parsed.iv) },
    key,
    fromBase64(parsed.ciphertext),
  );
  return decoder.decode(decrypted);
}

/* ------------------------------------ device key pair ------------------------------------ */

/** Non-extractable: the private half never exists as bytes in JS, only as a `CryptoKey` handle. */
export function generateDeviceKeyPair() {
  return crypto.subtle.generateKey(ECDH_PARAMS, false, ['deriveKey']);
}

export async function exportPublicKey(publicKey: CryptoKey) {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('spki', publicKey)));
}

function importPublicKey(spki: Uint8Array<ArrayBuffer>) {
  return crypto.subtle.importKey('spki', spki, ECDH_PARAMS, true, []);
}

function deriveWrappingKey(privateKey: CryptoKey, peerPublicKey: CryptoKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/* ------------------------------------- content key ------------------------------------- */

/** Extractable on purpose: it has to be exported to be wrapped for another device. */
export function generateContentKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** First 16 bytes of SHA-256(raw key bytes), base64url — the id every `v2` message names. */
export async function computeKeyId(rawKeyBytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rawKeyBytes));
  return toBase64Url(digest.slice(0, KEY_ID_BYTES));
}

export async function computeContentKeyId(contentKey: CryptoKey) {
  return computeKeyId(new Uint8Array(await crypto.subtle.exportKey('raw', contentKey)));
}

/**
 * ECDH(sender private, recipient public) -> AES-KW wrap of the content key. The output is one
 * base64 string of `sender SPKI (91 bytes) || wrapped key`: the recipient needs the sender's public
 * key to derive the same wrapping key, and the API has no field for it.
 */
export async function wrapContentKey(
  contentKey: CryptoKey,
  senderPrivateKey: CryptoKey,
  senderPublicKeySpki: string,
  recipientPublicKeySpki: string,
) {
  const senderSpki = fromBase64(senderPublicKeySpki);
  if (senderSpki.length !== P256_SPKI_BYTES) {
    throw new Error('Unexpected device public key length');
  }
  const recipientPublicKey = await importPublicKey(fromBase64(recipientPublicKeySpki));
  const wrappingKey = await deriveWrappingKey(senderPrivateKey, recipientPublicKey);
  const wrapped = new Uint8Array(
    await crypto.subtle.wrapKey('raw', contentKey, wrappingKey, 'AES-KW'),
  );
  const combined = new Uint8Array(senderSpki.length + wrapped.length);
  combined.set(senderSpki, 0);
  combined.set(wrapped, senderSpki.length);
  return toBase64(combined);
}

/** Inverse of `wrapContentKey`. The caller must still check the result against the expected key id. */
export async function unwrapContentKey(wrappedKey: string, recipientPrivateKey: CryptoKey) {
  const combined = fromBase64(wrappedKey);
  if (combined.length <= P256_SPKI_BYTES) {
    throw new Error('Wrapped key is too short');
  }
  const senderPublicKey = await importPublicKey(combined.slice(0, P256_SPKI_BYTES));
  const wrappingKey = await deriveWrappingKey(recipientPrivateKey, senderPublicKey);
  return crypto.subtle.unwrapKey(
    'raw',
    combined.slice(P256_SPKI_BYTES),
    wrappingKey,
    'AES-KW',
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt'],
  );
}

/* ------------------------------------ v2 messages ------------------------------------ */

/** `scopeId` (channel or conversation id) is AES-GCM associated data, so a copy elsewhere fails. */
export async function encryptScopedMessage(
  key: CryptoKey,
  keyId: string,
  scopeId: string,
  plaintext: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(scopeId) },
    key,
    encoder.encode(plaintext),
  );
  return `${E2EE_V2_PREFIX}:${keyId}:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptScopedMessage(key: CryptoKey, scopeId: string, content: string) {
  const parsed = parseEncryptedMessage(content);
  if (parsed?.version !== 'v2') {
    throw new Error('Unsupported encrypted message');
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(parsed.iv), additionalData: encoder.encode(scopeId) },
    key,
    fromBase64(parsed.ciphertext),
  );
  return decoder.decode(decrypted);
}

/* ------------------------------------ safety number ------------------------------------ */

/**
 * SHA-256 over the sorted SPKI keys of everyone involved, shown as groups of five decimal digits
 * (the grouped-digits pattern Signal popularised). Sorting makes both sides compute the same number.
 */
export async function computeSafetyNumber(publicKeys: readonly string[]) {
  const sorted = [...publicKeys].sort().map(fromBase64);
  const joined = new Uint8Array(sorted.reduce((total, bytes) => total + bytes.length, 0));
  let offset = 0;
  sorted.forEach((bytes) => {
    joined.set(bytes, offset);
    offset += bytes.length;
  });
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
  const groups: string[] = [];
  for (let index = 0; index < SAFETY_NUMBER_GROUPS; index += 1) {
    let value = 0;
    for (let byte = 0; byte < SAFETY_NUMBER_GROUP_BYTES; byte += 1) {
      value = (value * 256 + digest[index * SAFETY_NUMBER_GROUP_BYTES + byte]) % 100_000;
    }
    groups.push(String(value).padStart(5, '0'));
  }
  return groups.join(' ');
}

/* ------------------------------------------ base64 ------------------------------------------ */

function toBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
