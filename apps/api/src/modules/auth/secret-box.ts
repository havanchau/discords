import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const VERSION = 'v1';

/** AES-256-GCM sealing for small secrets at rest; the key is derived from configured key material. */
export function createSecretBox(keyMaterial: string) {
  const key = createHash('sha256').update(keyMaterial).digest();

  return {
    seal(plaintext: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [VERSION, iv, cipher.getAuthTag(), ciphertext]
        .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
        .join(':');
    },

    open(sealed: string) {
      const [version, iv, tag, ciphertext] = sealed.split(':');
      if (version !== VERSION || !iv || !tag || !ciphertext) {
        throw new Error('Unsupported sealed secret format');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
