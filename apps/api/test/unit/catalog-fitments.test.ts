import { describe, expect, it, vi } from 'vitest';
import { fitmentNames } from '@hedax/contracts';
import { CatalogService } from '../../dist/modules/catalog/catalog.service.js';
import type { HydratedProduct } from '../../src/modules/catalog/catalog.service.js';

const vehicle = (name: string, active = true, sortOrder = 0) => ({ slug: name, name, nameEn: null, active, sortOrder });

describe('public card fitments', () => {
  it('serializes only active vehicles/models in order, including model-less vehicles and empty lists', () => {
    const service = new CatalogService(null as never, null as never, { resolve: vi.fn(), toView: () => ({ kind: 'inquiry' }) } as never, {} as never);
    const product = {
      translations: [], media: [], category: { slug: 'engine', nameFa: 'موتور' }, vehicleBrands: [],
      inventory: [], salesUnit: { name: 'عدد', nameEn: null, allowDecimal: false, stepMilli: 1000 },
      vehicles: [
        { vehicle: vehicle('پژو', true, 2), model: vehicle('405') },
        { vehicle: vehicle('خاموش', false), model: null },
        { vehicle: vehicle('دنا', true, 1), model: null },
        { vehicle: vehicle('سمند'), model: vehicle('غیرفعال', false) },
      ],
    } as unknown as HydratedProduct;
    const viewer = { approvedGroupId: null, display: 'IRR' } as const;
    expect(fitmentNames(service.toCard(product, viewer, null).fitments)).toEqual(['دنا', 'پژو 405']);
    expect(service.toCard({ ...product, vehicles: [] }, viewer, null).fitments).toEqual([]);
  });

  it('handles missing cached values, blank names, duplicates and English fallback', () => {
    expect(fitmentNames(undefined)).toEqual([]);
    expect(fitmentNames(null)).toEqual([]);
    const fitment = { vehicle: { slug: 'peugeot', name: { fa: ' پژو ', en: 'Peugeot' } }, model: { slug: '405', name: { fa: '405', en: null } } };
    expect(fitmentNames([fitment, fitment])).toEqual(['پژو 405']);
    expect(fitmentNames([fitment], 'en')).toEqual(['Peugeot 405']);
    expect(fitmentNames([{ vehicle: { slug: 'empty', name: { fa: ' ', en: null } }, model: null }])).toEqual([]);
  });
});
