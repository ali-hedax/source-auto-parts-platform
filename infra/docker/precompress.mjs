// Writes <file>.br (brotli, quality 11) and <file>.gz (gzip -9) next to every text file under the given
// directories, at image build time. Caddy serves them for /_next/static/* (`file_server precompressed`),
// so the content-hashed JS and CSS are compressed once at maximum strength instead of on every request.
// A file that would not shrink by a tenth is left alone. Usage: node precompress.mjs <dir>...
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const TEXT = /\.(js|mjs|css|json|svg|txt|map|html|xml|webmanifest)$/i;
let files = 0;
let before = 0;
let after = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (TEXT.test(name)) compress(path);
  }
}

function compress(path) {
  const raw = readFileSync(path);
  if (raw.length < 1024) return;
  const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
  const gz = gzipSync(raw, { level: 9 });
  if (br.length < raw.length * 0.9) writeFileSync(`${path}.br`, br);
  if (gz.length < raw.length * 0.9) writeFileSync(`${path}.gz`, gz);
  files += 1;
  before += raw.length;
  after += br.length;
}

for (const dir of process.argv.slice(2)) walk(dir);
process.stdout.write(`precompressed ${files} files: ${before} bytes, ${after} as brotli\n`);
