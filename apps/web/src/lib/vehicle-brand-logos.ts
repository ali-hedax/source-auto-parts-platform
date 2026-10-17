import { existsSync } from 'node:fs';
import { join } from 'node:path';

const LOGO_DIR = join(process.cwd(), 'public', 'brand', 'vehicle-brands');
const EXTENSIONS = ['svg', 'png', 'webp'] as const;

/**
 * The brand's own emblem, if the owner has placed one at
 * `public/brand/vehicle-brands/<slug>.(svg|png|webp)` (see the README next to those files). Checked
 * on the filesystem at render time — no admin upload yet, no database column. A brand with no file
 * here has no logo, and callers fall back to its name in text.
 */
export function vehicleBrandLogo(slug: string): string | null {
  for (const ext of EXTENSIONS) {
    if (existsSync(join(LOGO_DIR, `${slug}.${ext}`))) return `/brand/vehicle-brands/${slug}.${ext}`;
  }
  return null;
}
