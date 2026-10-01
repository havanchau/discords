import {
  E2EE_DEVICE_LABEL_MAX_LENGTH,
  E2EE_KEY_ID_LENGTH,
  E2EE_PUBLIC_KEY_MAX_LENGTH,
  E2EE_WRAPPED_KEY_MAX_LENGTH,
} from '@discord-clone/shared';

export { E2EE_DEVICE_LABEL_MAX_LENGTH, E2EE_PUBLIC_KEY_MAX_LENGTH, E2EE_WRAPPED_KEY_MAX_LENGTH };

/** base64url, unpadded: the first 16 bytes of a SHA-256 digest is exactly 22 characters. */
export const KEY_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${E2EE_KEY_ID_LENGTH}}$`);
/** Client-generated `crypto.randomUUID()`-shaped identifier; kept loose so a different generator still fits. */
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
/** base64 or base64url, optionally padded. */
export const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;
