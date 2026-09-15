import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPublicAddress } from './address-policy';

describe('isPublicAddress', () => {
  it('allows public IPv4 and IPv6 addresses', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:2800:220:1:248:1893:25c8:1946']) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  it('refuses private, loopback, link-local, and reserved IPv4 ranges', () => {
    for (const address of [
      '0.0.0.0',
      '10.1.2.3',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.1',
      '192.0.2.10',
      '192.168.1.1',
      '198.18.0.1',
      '198.51.100.7',
      '203.0.113.9',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it('keeps addresses next to private ranges public', () => {
    assert.equal(isPublicAddress('172.32.0.1'), true);
    assert.equal(isPublicAddress('100.128.0.1'), true);
  });

  it('refuses special IPv6 ranges', () => {
    for (const address of [
      '::',
      '::1',
      'fd00::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '64:ff9b::a00:1',
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it('judges IPv4-mapped IPv6 addresses by their IPv4 address', () => {
    assert.equal(isPublicAddress('::ffff:127.0.0.1'), false);
    assert.equal(isPublicAddress('::ffff:7f00:1'), false);
    assert.equal(isPublicAddress('::ffff:8.8.8.8'), true);
  });

  it('refuses values that are not IP addresses', () => {
    assert.equal(isPublicAddress('localhost'), false);
    assert.equal(isPublicAddress(''), false);
  });
});
