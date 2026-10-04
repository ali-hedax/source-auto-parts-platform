// Local PostgreSQL for development and integration tests WITHOUT Docker.
// Uses the native PostgreSQL 18 binaries shipped in the `embedded-postgres` dev
// dependency. Binds to 127.0.0.1 only; data lives in apps/api/.local-pg (gitignored).
// Production uses a real PostgreSQL server (see docs/DEPLOYMENT.md).
//
//   pnpm --filter @hedax/api db:local          # start and keep running (Ctrl+C stops)
//
// Connection: postgresql://hedax:<LOCAL_PG_PASSWORD>@127.0.0.1:<LOCAL_PG_PORT>/hedax
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(root, '..', '.local-pg', process.env.LOCAL_PG_NAME ?? 'data');
const port = Number(process.env.LOCAL_PG_PORT ?? 55432);
const password = process.env.LOCAL_PG_PASSWORD ?? 'hedax-local-dev-only';
const database = process.env.LOCAL_PG_DATABASE ?? 'hedax';

mkdirSync(path.dirname(dataDir), { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'hedax',
  password,
  port,
  persistent: true,
  authMethod: 'scram-sha-256',
  // A Unicode-aware LC_CTYPE is required: with the "C" locale pg_trgm extracts no
  // trigrams from Persian text, so fuzzy search and ranking silently degrade.
  initdbFlags: ['--encoding=UTF8', process.platform === 'win32' ? '--locale=en-US' : '--locale=C.UTF-8'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'max_connections=100'],
  onLog: () => undefined,
  onError: (e) => process.stderr.write(`[postgres] ${String(e).slice(0, 300)}\n`),
});

if (!existsSync(path.join(dataDir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase(database);
} catch {
  // already exists
}
process.stdout.write(`PostgreSQL ready on 127.0.0.1:${port} (database "${database}", user "hedax")\n`);

const stop = async () => {
  await pg.stop().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Keep the process alive while the server runs.
setInterval(() => undefined, 1 << 30);
