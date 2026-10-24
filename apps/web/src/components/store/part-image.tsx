'use client';

import Image, { type ImageProps } from 'next/image';
import { useState, type ReactNode } from 'react';

/**
 * A part photo that shows the SOURCE placeholder instead of a broken image when the file cannot be
 * loaded (a missing or non-public storage object). The placeholder still says «no image».
 */
export function PartImage({ fallback, ...props }: ImageProps & { fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <Image {...props} onError={() => setFailed(true)} />;
}
