import { existsSync, readdirSync } from 'node:fs';
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

/**
 * Every brand emblem present in `public/brand/vehicle-brands`, as slug → public path (same preference
 * order as `vehicleBrandLogo`). Read on the server and handed to views that also render in the browser
 * (the visual builder's live preview), where the filesystem is not available.
 */
export function vehicleBrandLogoMap(): Record<string, string> {
  const map: Record<string, string> = {};
  let files: string[];
  try {
    files = readdirSync(LOGO_DIR);
  } catch {
    return map;
  }
  for (const ext of [...EXTENSIONS].reverse()) {
    for (const file of files) {
      if (file.endsWith(`.${ext}`)) map[file.slice(0, -(ext.length + 1))] = `/brand/vehicle-brands/${file}`;
    }
  }
  return map;
}
