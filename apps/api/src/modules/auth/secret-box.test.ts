import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSecretBox } from './secret-box';

describe('createSecretBox', () => {
  const box = createSecretBox('test-key-material-with-enough-length');

  it('round-trips a secret and never stores it in plain text', () => {
    const sealed = box.seal('JBSWY3DPEHPK3PXP');

    assert.ok(!sealed.includes('JBSWY3DPEHPK3PXP'));
    assert.equal(box.open(sealed), 'JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh IV for every seal', () => {
    assert.notEqual(box.seal('same'), box.seal('same'));
  });

  it('rejects tampered ciphertext', () => {
    const [version, iv, tag, ciphertext] = box.seal('secret').split(':');
    const tampered = Buffer.from(ciphertext, 'base64url');
    tampered[0] ^= 0xff;

    assert.throws(() => box.open([version, iv, tag, tampered.toString('base64url')].join(':')));
  });

  it('rejects a different key', () => {
    const sealed = box.seal('secret');

    assert.throws(() => createSecretBox('another-key-material-entirely').open(sealed));
  });
});
