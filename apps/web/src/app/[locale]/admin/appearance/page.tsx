import { vehicleBrandLogoMap } from '@/lib/vehicle-brand-logos';
import { VisualBuilder } from '@/components/builder/editor';
export const metadata = { robots: { index: false, follow: false } };
export default function Page() { return <VisualBuilder logos={vehicleBrandLogoMap()} />; }
