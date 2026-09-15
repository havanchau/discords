/*
 * Refuses any database whose name does not contain "test", so a misconfigured TEST_DATABASE_URL
 * can never truncate a development or production database.
 */
export function assertDisposableDatabaseUrl(url: string | undefined): asserts url is string {
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required for integration tests');
  }
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(databaseName)) {
    throw new Error(`Refusing to use database "${databaseName}": its name must contain "test"`);
  }
}
