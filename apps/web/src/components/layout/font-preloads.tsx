/** <link rel="preload"> for fonts; React moves these into the document head. */
export function FontPreloads({ hrefs }: { hrefs: string[] }) {
  return (
    <>
      {hrefs.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
      ))}
    </>
  );
}
