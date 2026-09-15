import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotp,
  totpStep,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B, SHA-1 test key.
const rfcSecret = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [seconds, expected] of vectors) {
      assert.equal(generateTotp(rfcSecret, totpStep(seconds * 1000), 8), expected, String(seconds));
    }
  });

  it('accepts codes from the previous and next step only', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);

    assert.equal(verifyTotp(rfcSecret, generateTotp(rfcSecret, step - 1), now), step - 1);
    assert.equal(verifyTotp(rfcSecret, generateTotp(rfcSecret, step + 1), now), step + 1);
    assert.equal(verifyTotp(rfcSecret, generateTotp(rfcSecret, step - 2), now), null);
  });

  it('refuses malformed codes', () => {
    assert.equal(verifyTotp(rfcSecret, '12345', Date.now()), null);
    assert.equal(verifyTotp(rfcSecret, 'abcdef', Date.now()), null);
  });

  it('round-trips base32 and ignores spacing and case', () => {
    const encoded = base32Encode(rfcSecret);

    assert.equal(encoded, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.deepEqual(
      base32Decode(
        encoded
          .toLowerCase()
          .match(/.{1,4}/g)!
          .join(' '),
      ),
      rfcSecret,
    );
  });

  it('builds an otpauth URL authenticator apps can read', () => {
    const url = new URL(buildOtpauthUrl('Discords', 'ada@example.com', 'ABC'));

    assert.equal(url.protocol, 'otpauth:');
    assert.equal(url.searchParams.get('secret'), 'ABC');
    assert.equal(url.searchParams.get('period'), '30');
  });
});
