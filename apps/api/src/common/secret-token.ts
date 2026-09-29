import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

/**
 * Long-lived secrets shown to their owner once (webhook URLs, bot tokens). Only the SHA-256 is
 * stored: 256 bits of entropy make an unsalted fast hash a safe stored form, and the row is found by
 * an id that travels next to the secret, so no per-row bcrypt compare is needed.
 */
export function generateSecretToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSecretToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time over the digests, so the comparison does not leak how much of a guess matched. */
export function secretTokenMatches(token: string, storedHash: string) {
  const candidate = Buffer.from(hashSecretToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/**
 * Credentials for a synthetic author row (a webhook or a bot). The username and email are longer
 * than registration and provider sign-up allow (32 characters) and use a reserved domain, so they
 * can never collide with a person; the password hash is of a random value nobody holds.
 */
export async function syntheticUserIdentity(
  prefix: 'webhook' | 'bot' | 'workflow',
  emailDomain: string,
) {
  const suffix = randomUUID().replaceAll('-', '');
  return {
    username: `${prefix}-${suffix}`,
    email: `${prefix}-${suffix}@${emailDomain}`,
    passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 12),
  };
}
