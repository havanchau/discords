import { BadRequestException } from '@nestjs/common';
import { createPublicKey } from 'node:crypto';
import type { DeviceKey } from '@prisma/client';
import type { DeviceKeyView } from '@discord-clone/shared';

const INVALID_PUBLIC_KEY_MESSAGE = 'Invalid device public key';

/** Public fields only: a `DeviceKey` row never holds private material, but the view is explicit anyway. */
export function toDeviceKeyView(deviceKey: DeviceKey): DeviceKeyView {
  return {
    id: deviceKey.id,
    userId: deviceKey.userId,
    deviceId: deviceKey.deviceId,
    publicKey: deviceKey.publicKey,
    label: deviceKey.label,
    createdAt: deviceKey.createdAt,
    revokedAt: deviceKey.revokedAt,
  };
}

/**
 * The contract is an ECDH P-256 key in SPKI form (docs/features/e2ee-key-management.md Rules item 1).
 * Parsing it here keeps a malformed or wrong-curve key from ever being handed to another member as a
 * wrap target, where it would only fail later and silently on their client.
 */
export function assertP256SpkiPublicKey(publicKey: string) {
  let keyType: string | undefined;
  let curve: string | undefined;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    keyType = key.asymmetricKeyType;
    curve = key.asymmetricKeyDetails?.namedCurve;
  } catch (error) {
    throw new BadRequestException(INVALID_PUBLIC_KEY_MESSAGE, { cause: error });
  }
  if (keyType !== 'ec' || curve !== 'prime256v1') {
    throw new BadRequestException(INVALID_PUBLIC_KEY_MESSAGE);
  }
}
