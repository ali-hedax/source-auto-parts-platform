import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, addAddress, bootApp, checkout, createProduct, inviteStaff, loginCustomer, loginOwner, services, taxonomy } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Sales units (panel → units): «عدد» and «دست» whole numbers, «لیتر» in steps of 0.5. Stock,
 * carts, orders and invoices follow the product's unit; prices are per unit; a unit in use is
 * never deleted (only deactivated) and keeps its step; every existing product starts as «عدد».
 */
let t: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36);
const unitByName = async (name: string) => (await owner.get<any[]>('/admin/units')).body.find((u) => u.name === name);
const adjust = async (productId: string, newOnHand: number) => {
  const detail = await owner.get<any>(`/admin/products/${productId}`);
  return owner.post<any>('/admin/inventory/adjust', { productId, newOnHand, reason: 'RECEIVED', expectedVersion: detail.body.inventory.version });
};

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
});

afterAll(async () => {
  await t?.close();
});

describe('starting units and existing products', () => {
  it('seeds «عدد», «دست» and «لیتر»; every product has a unit and the text copy matches it', async () => {
    const units = (await owner.get<any[]>('/admin/units')).body;
    expect(units.find((u) => u.name === 'عدد')).toMatchObject({ allowDecimal: false, step: 1, active: true });
    expect(units.find((u) => u.name === 'دست')).toMatchObject({ allowDecimal: false, step: 1, active: true });
    expect(units.find((u) => u.name === 'لیتر')).toMatchObject({ allowDecimal: true, step: 0.5, active: true });
    const mismatched = await s.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM product p JOIN unit u ON u.id = p.unit_id WHERE p.unit <> u.name`;
    expect(Number(mismatched[0]!.n)).toBe(0);
  });
});

describe('managing units', () => {
  it('owner and manager manage units; staff without products.write cannot; rules are checked and audited', async () => {
    const manager = await inviteStaff(t, owner, 'manager');
    const support = await inviteStaff(t, owner, 'support');
    expect((await support.post('/admin/units', { name: `متر ${run}`, allowDecimal: true, step: 0.1 })).status).toBe(403);
    const created = await manager.post<any>('/admin/units', { name: `متر ${run}`, nameEn: 'm', allowDecimal: true, step: 0.1 });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    // Same name with Arabic letters / extra spaces is the same unit.
    expect((await owner.post<any>('/admin/units', { name: `  متر  ${run}`, allowDecimal: false, step: 1 })).body.error.code).toBe('UNIT_NAME_TAKEN');
    expect((await owner.post<any>('/admin/units', { name: `جفت ${run}`, allowDecimal: false, step: 0.5 })).body.error.code).toBe('STEP_NOT_WHOLE');
    // Unused: the rule may change, and it can be deleted.
    expect((await owner.patch(`/admin/units/${created.body.id}`, { step: 0.25 })).status).toBe(200);
    expect((await owner.del<any>(`/admin/units/${created.body.id}`)).status).toBe(200);
    const actions = await s.prisma.auditLog.findMany({ where: { entityId: created.body.id }, select: { action: true } });
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['unit.created', 'unit.updated', 'unit.deleted']));
  });

  it('a unit in use cannot be deleted or change its step; it can be deactivated and stays on its products', async () => {
    const pair = await owner.post<any>('/admin/units', { name: `جفت ${run}`, allowDecimal: false, step: 1 });
    expect(pair.status).toBe(201);
    const p = await createProduct(owner, { sku: `PAIR-${run}`, nameFa: 'لاستیک جفتی آزمایشی', onHand: 4, unit: `جفت ${run}` });
    const del = await owner.del<any>(`/admin/units/${pair.body.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('UNIT_IN_USE');
    expect((await owner.patch<any>(`/admin/units/${pair.body.id}`, { allowDecimal: true, step: 0.5 })).body.error.code).toBe('UNIT_IN_USE_LOCKED');
    // Renaming is fine and reaches the product.
    expect((await owner.patch(`/admin/units/${pair.body.id}`, { name: `جفت‌ها ${run}` })).status).toBe(200);
    expect((await s.prisma.product.findUnique({ where: { id: p.id } }))?.unit).toBe(`جفت‌ها ${run}`);
    expect((await owner.patch(`/admin/units/${pair.body.id}`, { active: false })).status).toBe(200);
    expect((await new Client(t).get<any>(`/catalog/products/${p.slug}`)).body.unit.name).toBe(`جفت‌ها ${run}`);
    // An inactive unit is not offered to other products.
    const tax = await taxonomy(owner);
    const other = await owner.post<any>('/admin/products', {
      sku: `INACT-${run}`, nameFa: 'کالای آزمایشی', categoryId: tax.categories[0]!.id, unitId: pair.body.id, partType: 'GENUINE', condition: 'NEW', origin: 'DOMESTIC', basePrice: { currency: 'IRR', amountMinor: '1000000' },
    });
    expect(other.body.error.code).toBe('UNIT_UNAVAILABLE');
    // A product without a unit is refused (the field is required).
    const none = await owner.post<any>('/admin/products', { sku: `NOUNIT-${run}`, nameFa: 'کالای آزمایشی', categoryId: tax.categories[0]!.id, partType: 'GENUINE', condition: 'NEW', origin: 'DOMESTIC', basePrice: { currency: 'IRR', amountMinor: '1000000' } });
    expect(none.status).toBe(400);
  });
});

describe('quantities follow the unit', () => {
  it('litres: stock, cart, price per unit, checkout, order line and quantity prices in steps of 0.5', { timeout: 120_000 }, async () => {
    const p = await createProduct(owner, { sku: `OIL-${run}`, nameFa: 'روغن موتور آزمایشی', priceIrr: 1_000_000n, onHand: 0, unit: 'لیتر' });
    expect((await adjust(p.id, 12.3)).body.error.code).toBe('UNIT_QUANTITY_INVALID');
    const ok = await adjust(p.id, 12.5);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body).toMatchObject({ onHand: 12.5, unit: 'لیتر' });
    const row = (await owner.get<any>(`/admin/products?q=OIL-${run}`)).body.items[0];
    expect(row).toMatchObject({ onHand: 12.5, available: 12.5, unit: { name: 'لیتر', step: 0.5 } });

    const page = (await new Client(t).get<any>(`/catalog/products/${p.slug}`)).body;
    expect(page.unit).toMatchObject({ name: 'لیتر', allowDecimal: true, step: 0.5 });
    expect(page.maxOrderQuantity).toBe(12.5);

    const customer = await loginCustomer(t);
    expect((await customer.post<any>('/cart/items', { productId: p.id, quantity: 1.25 })).body.error.code).toBe('UNIT_QUANTITY_INVALID');
    expect((await customer.post('/cart/items', { productId: p.id, quantity: 1.5 })).status).toBe(201);
    const cart = (await customer.get<any>('/cart')).body;
    expect(cart.lines[0]).toMatchObject({ quantity: 1.5, unit: { name: 'لیتر' }, lineTotalPayableIrr: { amountMinor: '1500000' } });
    expect((await customer.patch<any>(`/cart/items/${cart.lines[0].id}`, { quantity: 2.7 })).body.error.code).toBe('UNIT_QUANTITY_INVALID');

    const start = await checkout(customer, await addAddress(customer));
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    const item = await s.prisma.orderItem.findFirstOrThrow({ where: { orderId: start.body.orderId } });
    expect(item).toMatchObject({ quantity: 3, unitName: 'لیتر', unitStepMilli: 500, lineTotalMinor: 1_500_000n });
    const order = (await customer.get<any>(`/orders/${start.body.orderId}`)).body;
    expect(order.lines[0]).toMatchObject({ quantity: 1.5, unit: { name: 'لیتر', step: 0.5 }, lineTotal: { amountMinor: '1500000' } });
    // Reserved stock is counted in litres too.
    expect((await owner.get<any>(`/admin/products/${p.id}`)).body.inventory).toMatchObject({ onHand: 12.5, reserved: 1.5 });

    // A product with stock cannot move to a unit with another step.
    const detail = (await owner.get<any>(`/admin/products/${p.id}`)).body;
    const piece = await unitByName('عدد');
    const moved = await owner.put<any>(`/admin/products/${p.id}`, {
      sku: detail.sku, nameFa: detail.nameFa, categoryId: detail.categoryId, unitId: piece.id, partType: detail.partType, condition: detail.condition, origin: detail.origin,
      basePrice: { currency: 'IRR', amountMinor: '1000000' }, version: detail.version,
    });
    expect(moved.body.error.code).toBe('UNIT_CHANGE_LOCKED');

    // Quantity prices are set in litres.
    expect((await owner.post<any>(`/admin/products/${p.id}/price-rules`, { customerGroupId: null, minQty: 2.5, maxQty: null, basePrice: { currency: 'IRR', amountMinor: '900000' } })).status).toBe(201);
    expect((await owner.get<any>(`/admin/products/${p.id}`)).body.priceRules[0]).toMatchObject({ minQty: 2.5, maxQty: null });
    expect((await owner.post<any>(`/admin/products/${p.id}/price-rules`, { customerGroupId: null, minQty: 2.3, maxQty: null, basePrice: { currency: 'IRR', amountMinor: '900000' } })).body.error.code).toBe('UNIT_QUANTITY_INVALID');
  });

  it('«عدد» and «دست» accept whole numbers only', async () => {
    for (const unit of ['عدد', 'دست']) {
      const p = await createProduct(owner, { sku: `WHOLE-${unit === 'عدد' ? 'P' : 'S'}-${run}`, nameFa: `کالای ${unit}`, onHand: 5, unit });
      expect((await adjust(p.id, 2.5)).body.error.code).toBe('UNIT_QUANTITY_INVALID');
      const customer = await loginCustomer(t);
      expect((await customer.post<any>('/cart/items', { productId: p.id, quantity: 1.5 })).body.error.code).toBe('UNIT_QUANTITY_INVALID');
      expect((await customer.post('/cart/items', { productId: p.id, quantity: 2 })).status).toBe(201);
      expect((await customer.get<any>('/cart')).body.lines[0]).toMatchObject({ quantity: 2, unit: { name: unit, allowDecimal: false, step: 1 } });
      const card = (await new Client(t).get<any>(`/catalog/products/${p.slug}`)).body;
      expect(card.unit.name).toBe(unit);
    }
  });
});
