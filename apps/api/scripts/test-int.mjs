// Pushes the Prisma schema to the disposable test database, then runs *.int.test.ts sequentially.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL is required for integration tests');
  process.exit(1);
}
const databaseName = new URL(url).pathname.replace(/^\//, '');
if (!/test/i.test(databaseName)) {
  console.error(`Refusing to use database "${databaseName}": its name must contain "test"`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function findTests(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return findTests(path);
    return path.endsWith('.int.test.ts') ? [path] : [];
  });
}

const testFiles = process.argv.slice(2).length ? process.argv.slice(2) : findTests('src');
run('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss']);
run('npx', ['tsx', '--test', '--test-concurrency=1', ...testFiles]);
