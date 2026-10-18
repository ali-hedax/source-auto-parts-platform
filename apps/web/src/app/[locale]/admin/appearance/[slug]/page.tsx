import { notFound } from 'next/navigation';
import { VisualBuilder } from '@/components/builder/editor';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();
  return <VisualBuilder key={slug} slug={slug} />;
}
