/**
 * Resolves the client address the same way Express does with `trust proxy = hops`:
 * walk `X-Forwarded-For` from the right, trusting one entry per proxy hop. Entries further
 * left were written by the client and are ignored, so spoofing them has no effect.
 */
export function resolveForwardedIp(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined,
  hops: number,
) {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '');
  const forwarded = header
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const addresses = [remoteAddress ?? 'unknown', ...forwarded.reverse()];
  return addresses[Math.min(hops, addresses.length - 1)];
}
