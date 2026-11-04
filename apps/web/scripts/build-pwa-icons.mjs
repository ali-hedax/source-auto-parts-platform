// Builds the app icons from the brand's own square mark. Run once, when the artwork changes:
//   node apps/web/scripts/build-pwa-icons.mjs
// The mark already sits inside the middle 60% of its dark ground, so the same art is safe as a maskable icon.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(path.resolve(webRoot, '../api/package.json'))('sharp');
const source = path.join(webRoot, 'public/brand/source/app-icon-dark.png');
const icons = path.join(webRoot, 'public/icons');
mkdirSync(icons, { recursive: true });

const write = (size, file) => sharp(source).resize(size, size).flatten({ background: '#1a202c' }).png({ compressionLevel: 9, palette: true }).toFile(file);
await write(192, path.join(icons, 'icon-192.png'));
await write(512, path.join(icons, 'icon-512.png'));
await write(192, path.join(icons, 'maskable-192.png'));
await write(512, path.join(icons, 'maskable-512.png'));
// Safari looks for this at the site root as well as in the page's links.
await write(180, path.join(webRoot, 'public/apple-touch-icon.png'));
process.stdout.write('icons written\n');
