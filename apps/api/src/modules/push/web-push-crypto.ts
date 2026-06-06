import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  createSign,
  randomBytes,
} from 'crypto';

const DEFAULT_RECORD_SIZE = 4096;

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface EncryptedWebPushRequest {
  body: Buffer;
  headers: Record<string, string>;
}

export function createVapidJwt(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string,
) {
  const audience = new URL(endpoint).origin;
  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = base64UrlEncode(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e0201010420', 'hex'),
      base64UrlDecode(privateKey),
      Buffer.from('a00706052b8104000a', 'hex'),
    ]),
    format: 'der',
    type: 'sec1',
  });
  const derSignature = createSign('SHA256').update(signingInput).sign(key);
  return `${signingInput}.${base64UrlEncode(derToJose(derSignature, 64))}`;
}

export function encryptWebPushPayload(
  subscription: WebPushSubscription,
  payload: string,
): EncryptedWebPushRequest {
  const receiverPublicKey = base64UrlDecode(subscription.keys.p256dh);
  const authSecret = base64UrlDecode(subscription.keys.auth);
  const salt = randomBytes(16);
  const localKey = createECDH('prime256v1');
  localKey.generateKeys();
  const senderPublicKey = localKey.getPublicKey();
  const sharedSecret = localKey.computeSecret(receiverPublicKey);

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    receiverPublicKey,
    senderPublicKey,
  ]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  const plainText = Buffer.concat([Buffer.from(payload), Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const cipherText = Buffer.concat([cipher.update(plainText), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(DEFAULT_RECORD_SIZE, 0);

  return {
    body: Buffer.concat([
      salt,
      recordSize,
      Buffer.from([senderPublicKey.length]),
      senderPublicKey,
      cipherText,
    ]),
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '2419200',
    },
  };
}

export function base64UrlEncode(value: string | Buffer) {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value;
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64UrlDecode(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(`${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number) {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  const buffers: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let counter = 0;
  while (Buffer.concat(buffers).length < length) {
    counter += 1;
    previous = createHmac('sha256', prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    buffers.push(previous);
  }
  return Buffer.concat(buffers).subarray(0, length);
}

function derToJose(signature: Buffer, size: number) {
  let offset = 3;
  let rLength = signature[offset - 1];
  if (signature[1] === 0x81) {
    offset += 1;
    rLength = signature[offset - 1];
  }
  const r = signature.subarray(offset, offset + rLength);
  offset += rLength + 1;
  const sLength = signature[offset - 1];
  const s = signature.subarray(offset, offset + sLength);
  return Buffer.concat([leftPadUnsigned(r, size / 2), leftPadUnsigned(s, size / 2)]);
}

function leftPadUnsigned(value: Buffer, length: number) {
  let next = value;
  while (next.length > length && next[0] === 0) {
    next = next.subarray(1);
  }
  if (next.length > length) {
    throw new Error('Invalid ECDSA signature length');
  }
  return Buffer.concat([Buffer.alloc(length - next.length), next]);
}
