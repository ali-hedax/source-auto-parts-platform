import type { BuilderDocument, BuilderBlock, CategoryView, FinderGroupView, ManufacturerView, ProductCard, SearchResult, SiteContentView, VehicleBrandView, VehiclePublicView } from '@hedax/contracts';

export interface BuilderData {
  now: number;
  /** Vehicle-brand emblems (slug → public path), resolved on the server. */
  logos: Record<string, string>;
  /** Optional owner-editable home artwork, separate from official catalogue emblems. */
  brandArtwork?: Record<string, string>;
  otherBrand?: BuilderBlock['items'][number];
  homeCopy?: Record<string, { title: string; subtitle: string }>;
  vehicles: VehiclePublicView[];
  content: SiteContentView | null; featured: SearchResult | null; brands: VehicleBrandView[]; categories: CategoryView[];
  makers: ManufacturerView[]; products: Record<string, ProductCard[]>;
  /** Step 1 of the vehicle finder (only when the page has one; later steps load in the browser). */
  finderGroups: FinderGroupView[];
}
export async function loadBuilderData(document: BuilderDocument | null, get: <T>(path: string) => Promise<T>, currency = 'IRR', logos: Record<string, string> = {}): Promise<BuilderData> {
  const [content, featured, brands, categories, makers, vehicles] = await Promise.all([
    get<SiteContentView>('/site/content'),
    get<SearchResult>(`/catalog/products?inStock=1&pageSize=8&currency=${currency}`).catch(() => null),
    get<VehicleBrandView[]>('/catalog/vehicle-brands').catch(() => []),
    get<CategoryView[]>('/catalog/categories').catch(() => []),
    get<ManufacturerView[]>('/catalog/manufacturers').catch(() => []),
    get<VehiclePublicView[]>('/catalog/vehicles').catch(() => []),
  ]);
  const finderGroups = document?.sections.some(b => b.kind === 'vehicle-finder')
    ? await get<FinderGroupView[]>('/catalog/vehicle-finder/groups').catch(() => [])
    : [];
  const products: Record<string, ProductCard[]> = {};
  await Promise.all((document?.sections ?? []).map(async block => {
    if (!['new-products', 'bestsellers', 'discounts', 'offers', 'selected-products', 'vehicle-products'].includes(block.kind)) return;
    const q = block.query;
    if (['bestsellers', 'discounts', 'selected-products', 'offers'].includes(block.kind)) {
      products[block.id] = await get<ProductCard[]>(`/catalog/collections/${block.kind}?currency=${currency}&limit=${q.limit}&slugs=${q.productSlugs.join(',')}`).catch(() => []);
    } else {
      const params = new URLSearchParams({ currency, pageSize: String(q.limit), sort: 'newest' });
      for (const k of ['category', 'brand', 'vehicle', 'model'] as const) if (q[k]) params.set(k, q[k]);
      products[block.id] = (await get<SearchResult>(`/catalog/products?${params}`).catch(() => null))?.items ?? [];
    }
  }));
  return { now: Date.now(), logos, content, featured, brands, categories, makers, vehicles, products, finderGroups };
}
