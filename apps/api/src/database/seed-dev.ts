import { createHash } from 'node:crypto';
import { buildSearchDocument, normalizeSearchText } from '@hedax/domain';
import type { PrismaClient } from '../generated/prisma/client.js';
import { scriptPrisma, seedBase } from './base-data.js';

/**
 * DEVELOPMENT SAMPLE DATA — refused unless APP_ENV is development/test.
 * Every name carries «نمونه»/"SAMPLE" and SKUs start with DEMO- so nothing can
 * be mistaken for real inventory, prices or policies. The FX rate is a
 * placeholder for testing conversions, not a market rate.
 */
async function seedDev(prisma: PrismaClient): Promise<void> {
  const env = process.env.APP_ENV ?? 'development';
  if (!['development', 'test'].includes(env)) throw new Error(`seed-dev refused: APP_ENV=${env}`);
  await seedBase(prisma);

  const categories = [
    { code: 'BRAKE', slug: 'brake', nameFa: 'ترمز', nameEn: 'Brakes' },
    { code: 'FILTER', slug: 'filters', nameFa: 'فیلتر', nameEn: 'Filters' },
    { code: 'ENGINE', slug: 'engine', nameFa: 'موتور', nameEn: 'Engine' },
    { code: 'SUSPENSION', slug: 'suspension', nameFa: 'جلوبندی و تعلیق', nameEn: 'Suspension' },
    { code: 'ELECTRICAL', slug: 'electrical', nameFa: 'برق خودرو', nameEn: 'Electrical' },
    { code: 'BODY', slug: 'body', nameFa: 'بدنه و چراغ', nameEn: 'Body & lights' },
  ];
  for (const [i, c] of categories.entries()) await prisma.category.upsert({ where: { code: c.code }, create: { ...c, sortOrder: i }, update: {} });

  const makers = [
    { slug: 'sample-maker-a', nameFa: 'سازندهٔ نمونه الف', nameEn: 'Sample Maker A' },
    { slug: 'sample-maker-b', nameFa: 'سازندهٔ نمونه ب', nameEn: 'Sample Maker B' },
  ];
  for (const m of makers) await prisma.manufacturerBrand.upsert({ where: { slug: m.slug }, create: { ...m, normalizedName: normalizeSearchText(m.nameEn) }, update: {} });

  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isDefault: true } });
  const brand = async (code: string) => (await prisma.vehicleBrand.findUniqueOrThrow({ where: { code } })).id;
  const category = async (code: string) => (await prisma.category.findUniqueOrThrow({ where: { code } })).id;
  const maker = async (slug: string) => (await prisma.manufacturerBrand.findUniqueOrThrow({ where: { slug } })).id;

  const products: Array<{
    sku: string; fa: string; en: string | null; aliases?: string[]; cat: string; brands: string[]; maker?: string;
    partType: 'GENUINE' | 'OEM' | 'AFTERMARKET'; condition: 'NEW' | 'USED' | 'REFURBISHED'; origin: 'DOMESTIC' | 'IMPORTED' | 'UNKNOWN';
    currency: 'IRR' | 'AED'; price: bigint; onHand: number;
  }> = [
    { sku: 'DEMO-0001', fa: 'لنت ترمز جلو پژو ۲۰۶ (نمونه)', en: 'Front brake pad, Peugeot 206 (SAMPLE)', aliases: ['لنت‌ترمز'], cat: 'BRAKE', brands: ['IKCO'], maker: 'sample-maker-a', partType: 'AFTERMARKET', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 18_500_000n, onHand: 14 },
    { sku: 'DEMO-0002', fa: 'فیلتر روغن سمند (نمونه)', en: 'Oil filter, Samand (SAMPLE)', cat: 'FILTER', brands: ['IKCO'], maker: 'sample-maker-b', partType: 'OEM', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 3_200_000n, onHand: 40 },
    { sku: 'DEMO-0003', fa: 'کمک فنر عقب پراید (نمونه)', en: 'Rear shock absorber, Pride (SAMPLE)', cat: 'SUSPENSION', brands: ['SAIPA'], partType: 'AFTERMARKET', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 24_000_000n, onHand: 6 },
    { sku: 'DEMO-0004', fa: 'چراغ جلو تیبا (نمونه)', en: null, cat: 'BODY', brands: ['SAIPA'], partType: 'GENUINE', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 41_000_000n, onHand: 2 },
    { sku: 'DEMO-0005', fa: 'فیلتر هوای کرولا (نمونه)', en: 'Air filter, Corolla (SAMPLE)', cat: 'FILTER', brands: ['TOYOTA'], maker: 'sample-maker-a', partType: 'GENUINE', condition: 'NEW', origin: 'IMPORTED', currency: 'AED', price: 6_500n, onHand: 9 },
    { sku: 'DEMO-0006', fa: 'شمع موتور النترا (نمونه)', en: 'Spark plug, Elantra (SAMPLE)', cat: 'ENGINE', brands: ['HYUNDAI'], partType: 'OEM', condition: 'NEW', origin: 'IMPORTED', currency: 'AED', price: 2_750n, onHand: 30 },
    { sku: 'DEMO-0007', fa: 'دینام استوک سوناتا (نمونه)', en: 'Alternator, Sonata — used stock (SAMPLE)', cat: 'ELECTRICAL', brands: ['HYUNDAI'], partType: 'GENUINE', condition: 'USED', origin: 'IMPORTED', currency: 'AED', price: 48_000n, onHand: 1 },
    { sku: 'DEMO-0008', fa: 'واتر پمپ پژو ۴۰۵ (نمونه)', en: 'Water pump, Peugeot 405 (SAMPLE)', cat: 'ENGINE', brands: ['IKCO'], partType: 'AFTERMARKET', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 15_900_000n, onHand: 0 },
    { sku: '00123', fa: 'دیسک ترمز کمری بازسازی‌شده (نمونه)', en: 'Brake disc, Camry — refurbished (SAMPLE)', cat: 'BRAKE', brands: ['TOYOTA'], partType: 'GENUINE', condition: 'REFURBISHED', origin: 'IMPORTED', currency: 'AED', price: 21_000n, onHand: 3 },
  ];

  for (const p of products) {
    const doc = buildSearchDocument([p.fa, p.en, ...(p.aliases ?? []), p.sku]);
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (existing) continue;
    const created = await prisma.product.create({
      data: {
        sku: p.sku,
        slug: `demo-${p.sku.toLowerCase()}`,
        categoryId: await category(p.cat),
        manufacturerBrandId: p.maker ? await maker(p.maker) : null,
        partType: p.partType,
        condition: p.condition,
        origin: p.origin,
        oemCodes: [],
        // Used/refurbished demo items stay unpublished until a real photo is added (publish rule).
        published: p.condition === 'NEW',
        publishedAt: p.condition === 'NEW' ? new Date() : null,
        searchText: doc.text,
        searchCompact: doc.compact,
        translations: {
          create: [
            { locale: 'fa', name: p.fa, aliases: p.aliases ?? [] },
            ...(p.en ? [{ locale: 'en' as const, name: p.en, aliases: [] }] : []),
          ],
        },
        vehicleBrands: { create: await Promise.all(p.brands.map(async (b) => ({ vehicleBrandId: await brand(b) }))) },
        basePrice: { create: { baseCurrency: p.currency, baseAmountMinor: p.price } },
      },
    });
    await prisma.inventoryBalance.create({ data: { productId: created.id, warehouseId: warehouse.id, onHand: p.onHand, lowStockThreshold: 2 } });
    if (p.onHand > 0) {
      await prisma.inventoryMovement.create({
        data: { productId: created.id, warehouseId: warehouse.id, type: 'RECEIPT', onHandDelta: p.onHand, reservedDelta: 0, onHandAfter: p.onHand, reservedAfter: 0, reason: 'DEV_SEED' },
      });
    }
  }

  const terms = await prisma.policyVersion.findFirst({ where: { kind: 'TERMS' } });
  if (!terms) {
    const body = 'متن آزمایشی شرایط فروش برای محیط توسعه. پیش از راه‌اندازی، متن تأییدشدهٔ مالک جایگزین شود.\nDEVELOPMENT PLACEHOLDER — replace with the owner-approved terms before launch.';
    await prisma.policyVersion.create({
      data: {
        kind: 'TERMS', version: 1, status: 'PUBLISHED', publishedAt: new Date(), titleFa: 'شرایط فروش (نسخهٔ آزمایشی)', titleEn: 'Terms of sale (development placeholder)',
        bodyFa: body, bodyEn: body, contentHash: createHash('sha256').update(body).digest('hex'),
      },
    });
  }
  if (!(await prisma.shippingMethod.findFirst())) {
    await prisma.shippingMethod.create({
      data: {
        code: 'dev_post', nameFa: 'ارسال آزمایشی (نمونه)', nameEn: 'Test delivery (SAMPLE)', sortOrder: 1,
        zones: { create: [{ provinces: ['تهران'], costIrrMinor: 800_000n, minDays: 1, maxDays: 2 }, { provinces: [], costIrrMinor: 1_500_000n, minDays: 3, maxDays: 5 }] },
      },
    });
    await prisma.shippingMethod.create({
      data: { code: 'dev_freight', nameFa: 'باربری (هزینه نامعلوم — نمونه)', nameEn: 'Freight (cost unknown — SAMPLE)', sortOrder: 2, zones: { create: [{ provinces: [], costIrrMinor: null }] } },
    });
  }
  const owner = await prisma.user.findFirst({ where: { kind: 'STAFF' } });
  if (owner && !(await prisma.exchangeRate.findFirst())) {
    await prisma.exchangeRate.create({ data: { irrPerAed: '160000', effectiveFrom: new Date(), note: 'DEV SAMPLE RATE — not a market rate', createdById: owner.id } });
  }
}

const prisma = scriptPrisma();
seedDev(prisma)
  .then(() => process.stdout.write('development sample data applied (DEMO-* products, placeholder terms, test shipping).\n'))
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
