import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, bootApp, loginOwner, services, taxonomy } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Search speed with a large catalog (run on demand: HEDAX_BENCH=1, optionally HEDAX_BENCH_ROWS).
 * Adds N synthetic published parts (each with a main number and an equivalent) straight in SQL, then
 * times the public search: words, an exact number written several ways, an equivalent, a partial
 * number, filters, a part page and a sitemap page. Prints p50 / p95 and keeps loose upper bounds.
 */
const ROWS = Number(process.env.HEDAX_BENCH_ROWS ?? 300_000);
const enabled = process.env.HEDAX_BENCH === '1';

let t: TestApp;
let s: Services;
let anon: Client;

describe.skipIf(!enabled)('search with a large catalog', () => {
  beforeAll(async () => {
    t = await bootApp();
    s = await services(t);
    const owner = await loginOwner(t);
    const tax = await taxonomy(owner);
    const category = tax.categories.find((c) => c.code === 'BRAKE')!.id;
    const unit = tax.units.find((u) => u.name === 'عدد')!;
    anon = new Client(t);
    const have = await s.prisma.product.count({ where: { sku: { startsWith: 'BENCH-' } } });
    if (have < ROWS) {
      const started = Date.now();
      for (let from = have + 1; from <= ROWS; from += 50_000) {
        const to = Math.min(ROWS, from + 49_999);
        await s.prisma.$executeRawUnsafe(`
          INSERT INTO "product" ("id","sku","slug","category_id","part_type","condition","origin","unit","unit_id","oem_codes","specs","published","published_at","is_sellable",
                                 "part_number","part_number_key","search_text","search_compact","created_at","updated_at")
          SELECT gen_random_uuid(), 'BENCH-' || i, 'bench-' || i, '${category}', 'AFTERMARKET', 'NEW', 'UNKNOWN', 'عدد', '${unit.id}', '{}', '[]', TRUE, now(), TRUE,
                 'BN-' || lpad(i::text, 7, '0') || '-X', 'BN' || lpad(i::text, 7, '0') || 'X',
                 'قطعه ازمایشی ' || i || ' bn ' || lpad(i::text, 7, '0') || ' x eq' || i, 'قطعهازمایشی' || i || 'bn' || lpad(i::text, 7, '0') || 'xeq' || i,
                 now(), now()
          FROM generate_series(${from}, ${to}) AS i`);
        await s.prisma.$executeRawUnsafe(`
          INSERT INTO "product_translation" ("product_id","locale","name","aliases")
          SELECT p."id", 'fa', 'قطعه آزمایشی ' || substr(p."sku", 7), '{}' FROM "product" p
          WHERE p."sku" LIKE 'BENCH-%' AND NOT EXISTS (SELECT 1 FROM "product_translation" t WHERE t."product_id" = p."id")`);
        await s.prisma.$executeRawUnsafe(`
          INSERT INTO "product_number" ("id","product_id","number","number_key","kind","sort_order")
          SELECT gen_random_uuid(), p."id", 'EQ' || substr(p."sku", 7), 'EQ' || substr(p."sku", 7), 'EQUIVALENT', 0 FROM "product" p
          WHERE p."sku" LIKE 'BENCH-%' AND NOT EXISTS (SELECT 1 FROM "product_number" n WHERE n."product_id" = p."id")`);
      }
      await s.prisma.$executeRawUnsafe('ANALYZE "product"; ');
      await s.prisma.$executeRawUnsafe('ANALYZE "product_number";');
      console.log(`bench: ${ROWS} parts added in ${Math.round((Date.now() - started) / 1000)} s`);
    }
    // The search document is normalized (آ → ا) like the real one; rows from an older run are fixed once.
    const fixed = await s.prisma.$executeRawUnsafe(`UPDATE "product" SET "search_text" = replace("search_text", 'آ', 'ا'), "search_compact" = replace("search_compact", 'آ', 'ا')
      WHERE "sku" LIKE 'BENCH-%' AND "search_text" LIKE '%آ%'`);
    if (fixed) await s.prisma.$executeRawUnsafe('ANALYZE "product";');
  }, 1_800_000);
  afterAll(async () => {
    await t?.close();
  });

  const time = async (label: string, path: string, times = 15) => {
    const ms: number[] = [];
    for (let i = 0; i < times; i += 1) {
      const t0 = performance.now();
      const res = await anon.get<any>(path);
      ms.push(performance.now() - t0);
      expect(res.status, path).toBe(200);
    }
    ms.sort((a, b) => a - b);
    const p50 = ms[Math.floor(ms.length * 0.5)]!;
    const p95 = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))]!;
    console.log(`bench ${label.padEnd(34)} p50 ${p50.toFixed(0).padStart(5)} ms   p95 ${p95.toFixed(0).padStart(5)} ms`);
    return { p50, p95 };
  };

  it(`stays fast with ${ROWS} parts`, { timeout: 900_000 }, async () => {
    const n = Math.floor(ROWS * 0.37);
    const pad = String(n).padStart(7, '0');
    const results = [
      await time('list, no search (page 1)', '/catalog/products?pageSize=24'),
      await time('words «آزمایشی 12345»', `/catalog/products?q=${encodeURIComponent(`آزمایشی ${n}`)}`),
      await time('exact number BN-…-X', `/catalog/products?q=BN-${pad}-X`),
      await time('number with spaces', `/catalog/products?q=${encodeURIComponent(`bn ${pad} x`)}`),
      await time('number in Persian digits', `/catalog/products?q=${encodeURIComponent(`BN-${pad.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)}-X`)}`),
      await time('equivalent number', `/catalog/products?q=EQ${n}`),
      await time('partial number', `/catalog/products?q=BN-${pad.slice(0, 5)}`),
      // Nothing matches as typed: the near-miss search (one page, capped at 1.5 s).
      await time('typo, no exact match', `/catalog/products?q=${encodeURIComponent('ازمایشیی zz9')}`),
      await time('filter: group + only in stock', '/catalog/products?category=brake&inStock=1'),
      await time('part page', `/catalog/products/bench-${n}`),
      await time('sitemap page', '/catalog/sitemap?page=3', 5),
    ];
    const exact = await anon.get<any>(`/catalog/products?q=BN-${pad}-X`);
    expect(exact.body.items[0].sku).toBe(`BENCH-${n}`);
    // Loose bounds for a developer machine; the numbers printed above are what matters.
    for (const r of results) expect(r.p95).toBeLessThan(5_000);
  });
});
