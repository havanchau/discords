const E2EE_PREFIX = 'e2ee:v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function isEncryptedMessage(content: string) {
  return content.startsWith(`${E2EE_PREFIX}:`);
}

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

export async function encryptChannelMessage(key: CryptoKey, plaintext: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  return `${E2EE_PREFIX}:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptChannelMessage(key: CryptoKey, content: string) {
  const [, version, ivValue, encryptedValue] = content.split(':');
  if (version !== 'v1' || !ivValue || !encryptedValue) {
    throw new Error('Unsupported encrypted message');
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivValue) },
    key,
    fromBase64(encryptedValue),
  );
  return decoder.decode(decrypted);
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
