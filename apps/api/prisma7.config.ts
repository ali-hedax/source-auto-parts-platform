// Prisma 7 CLI configuration. The schema and migrations live in /database (spec §3 layout).
// DATABASE_URL is read from the environment (see .env.example); it is not needed for
// `prisma validate`, `prisma generate` or `prisma migrate diff --from-empty`.
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../../database/prisma/schema.prisma',
  migrations: {
    path: '../../database/prisma/migrations',
    seed: 'node --env-file-if-exists=../../.env dist/database/seed-dev.js',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
