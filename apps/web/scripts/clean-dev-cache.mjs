// Removes the `next dev` cache (.next/dev) before a production build. Its generated
// type files are left half-written when a dev server is interrupted, and `next build`
// type-checks them. The folder is recreated by the next `next dev` run.
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
rmSync(path.join(webRoot, '.next', 'dev'), { recursive: true, force: true });
