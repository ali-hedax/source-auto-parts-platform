import { vehicleBrandLogoMap } from '@/lib/vehicle-brand-logos';
import { notFound } from 'next/navigation';
import { VisualBuilder } from '@/components/builder/editor';
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();
  return <VisualBuilder slug={slug} fullPreview logos={vehicleBrandLogoMap()} />;
}
