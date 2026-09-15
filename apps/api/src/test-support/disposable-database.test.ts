import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertDisposableDatabaseUrl } from './disposable-database';

describe('assertDisposableDatabaseUrl', () => {
  it('accepts a database whose name contains "test"', () => {
    assert.doesNotThrow(() =>
      assertDisposableDatabaseUrl('postgresql://u:p@localhost:5432/discord_clone_test'),
    );
  });

  it('refuses a database whose name does not contain "test"', () => {
    assert.throws(
      () => assertDisposableDatabaseUrl('postgresql://u:p@localhost:5432/discord_clone'),
      /must contain "test"/,
    );
  });

  it('refuses a missing URL', () => {
    assert.throws(() => assertDisposableDatabaseUrl(undefined), /TEST_DATABASE_URL is required/);
  });
});
