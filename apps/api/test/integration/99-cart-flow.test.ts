import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type TestApp, addAddress, bootApp, createProduct, loginOwner, reviewCheckout, uniqueMobile } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The purchase path the owner checks by hand (2026-11-15), on the throwaway test database (never Production):
 * two different parts are two lines, the amount changes and a line goes away, the cart is still there when the
 * page is loaded again, checkout asks a visitor to sign in, and after signing in the same cart is ready for
 * the address step. Payment is not touched.
 */
let t: TestApp;
let owner: Client;
const run = Date.now().toString(36).toUpperCase();

beforeAll(async () => {
  t = await bootApp();
  owner = await loginOwner(t);
});
afterAll(async () => {
  await t?.close();
});

describe('cart: visitor → sign-in → address step', () => {
  it('keeps two parts as two lines through changes, a reload and signing in', async () => {
    const a = await createProduct(owner, { sku: `CART-A-${run}`, nameFa: 'لنت ترمز آزمایشی سبد', priceIrr: 2_000_000n, onHand: 10 });
    const b = await createProduct(owner, { sku: `CART-B-${run}`, nameFa: 'فیلتر روغن آزمایشی سبد', priceIrr: 500_000n, onHand: 10 });
    const visitor = new Client(t);

    // Two different parts: two separate lines.
    expect((await visitor.post('/cart/items', { productId: a.id, quantity: 1 })).status).toBe(201);
    const two = await visitor.post('/cart/items', { productId: b.id, quantity: 1 });
    expect(two.status).toBe(201);
    let cart = await visitor.get('/cart');
    expect(cart.body.lines).toHaveLength(2);
    expect(new Set(cart.body.lines.map((l: any) => l.productId))).toEqual(new Set([a.id, b.id]));

    // The same part again adds to its line instead of making a third.
    await visitor.post('/cart/items', { productId: a.id, quantity: 1 });
    cart = await visitor.get('/cart');
    expect(cart.body.lines).toHaveLength(2);
    const lineA = cart.body.lines.find((l: any) => l.productId === a.id);
    expect(lineA.quantity).toBe(2);

    // Change the amount, then remove the other line.
    const changed = await visitor.patch(`/cart/items/${encodeURIComponent(lineA.id)}`, { quantity: 3 });
    expect(changed.status).toBe(200);
    expect(changed.body.lines.find((l: any) => l.productId === a.id).quantity).toBe(3);
    const lineB = changed.body.lines.find((l: any) => l.productId === b.id);
    const removed = await visitor.del(`/cart/items/${encodeURIComponent(lineB.id)}`);
    expect(removed.status).toBe(200);
    expect(removed.body.lines.map((l: any) => l.productId)).toEqual([a.id]);
    await visitor.post('/cart/items', { productId: b.id, quantity: 1 });

    // A reload (a fresh request with the same browser cookie) shows the same cart.
    const reloaded = new Client(t);
    for (const [k, v] of visitor.cookies) reloaded.cookies.set(k, v);
    cart = await reloaded.get('/cart');
    expect(cart.body.lines).toHaveLength(2);
    expect(cart.body.canCheckout).toBe(true);
    expect(cart.body.lines.find((l: any) => l.productId === a.id).quantity).toBe(3);

    // «ادامه و تکمیل خرید» without signing in: the checkout asks for sign-in and nothing is lost.
    expect((await reloaded.get('/checkout/preview?currency=IRR')).status).toBe(401);

    // Sign in on the same browser: the cart moves to the account unchanged.
    const mobile = uniqueMobile();
    const sent = await reloaded.post<{ devCode?: string }>('/auth/otp/request', { mobile });
    expect(sent.status).toBe(200);
    expect((await reloaded.post('/auth/otp/verify', { mobile, code: sent.body.devCode })).status).toBe(200);
    cart = await reloaded.get('/cart');
    expect(cart.body.lines).toHaveLength(2);
    expect(cart.body.lines.find((l: any) => l.productId === a.id).quantity).toBe(3);
    expect(cart.body.lines.find((l: any) => l.productId === b.id).quantity).toBe(1);

    // Back at the same step: the address and delivery review works with that cart.
    expect((await reloaded.put('/account/profile', { fullName: 'مشتری آزمایشی سبد', preferredLocale: 'fa' })).status).toBe(200);
    const addressId = await addAddress(reloaded);
    const { preview } = await reviewCheckout(reloaded, addressId);
    expect(preview.blockers).not.toContain('CART_NOT_READY');
    expect(preview.cart.lines).toHaveLength(2);
    expect(preview.totals.grandTotal).not.toBeNull();
  });
});
