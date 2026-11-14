import Image from 'next/image';

/** Keep the original SOURCE artwork; give its small signature a readable, centred line. */
export function HeaderWordmark({ src, mobileSrc, alt }: { src: string; mobileSrc?: string; alt: string }) {
  if (src !== '/brand/source/atelier/logo.webp' || (mobileSrc && mobileSrc !== src)) {
    return <picture>{mobileSrc ? <source media="(max-width: 639px)" srcSet={mobileSrc} /> : null}<Image src={src} width={2169} height={725} unoptimized preload alt={alt} /></picture>;
  }
  return <span className="header-wordmark" role="img" aria-label={alt}>
    <span className="header-wordmark-art" aria-hidden><Image src={src} width={1100} height={360} unoptimized preload alt="" /></span>
    <span className="header-wordmark-signature" dir="ltr" aria-hidden><span>by</span> HEDAX</span>
  </span>;
}
