import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BuilderDocument, type BuilderState, newBuilderBlock } from '@hedax/contracts';
import { vehicleKey } from '@hedax/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, bootApp, createProduct, loginOwner, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Home-page vehicle finder (group → vehicle → model → year) and the reviewed vehicle dataset import:
 * dry run changes nothing; apply reuses only the existing rows it names and keeps their ids, slugs,
 * names and product links; a second apply creates nothing; the server rejects invalid selections
 * instead of listing unrelated parts; years are compared only in their own calendar; older rows
 * count only through a confirmed equivalence.
 */
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let t: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36);
const dir = mkdtempSync(path.join(tmpdir(), 'hedax-finder-'));
const file = path.join(dir, 'dataset.json');
const anon = () => new Client(t);
const ids: Record<string, string> = {};

const OFFICIAL = 'test-official';
const SECONDARY = 'test-secondary';
const src = (ref: string, claim = 'listed') => ({ ref, claim });
const dataset = {
  version: 1, market: 'IR', generatedOn: '2026-10-25',
  sources: {
    [OFFICIAL]: { url: 'https://example.com/official', title: 'Official product list', publisher: 'Maker', kind: 'official', market: 'IR', checkedOn: '2026-10-25' },
    [SECONDARY]: { url: 'https://example.com/wiki', title: 'Encyclopedia', publisher: 'Wiki', kind: 'secondary', market: 'IR', checkedOn: '2026-10-25' },
  },
  vehicles: [
    {
      key: 'ikco.samand', groups: ['IKCO'], name: { fa: 'سمند', en: 'Samand' }, aliases: ['samand'], make: { fa: 'ایران‌خودرو', en: 'Iran Khodro' },
      existing: { slug: 'samand' }, status: 'official', sources: [src(OFFICIAL)],
      models: [
        { key: `ikco.samand.lx${run}`, name: { fa: `سمند LX ${run}`, en: `Samand LX ${run}` }, supply: 'domestic', years: { from: 1390, to: 1400, calendar: 'jalali', source: src(OFFICIAL, 'years') }, status: 'official', sources: [src(OFFICIAL)] },
        { key: `ikco.samand.se${run}`, name: { fa: `سمند SE ${run}`, en: `Samand SE ${run}` }, years: { from: 1385, to: 1390, calendar: 'jalali', source: src(SECONDARY, 'years') }, status: 'official', sources: [src(OFFICIAL)] },
      ],
    },
    {
      key: `ikco.peugeot-2008-${run}`, groups: ['IKCO'], name: { fa: `پژو ۲۰۰۸ ${run}`, en: `Peugeot 2008 ${run}` }, make: { fa: 'پژو', en: 'Peugeot' }, status: 'official', sources: [src(OFFICIAL)],
      equivalences: [{ key: `eq.p2008-${run}`, model: null, legacy: { vehicleSlug: 'peugeot', modelSlug: `p2008-${run}` }, status: 'confirmed', note: 'same vehicle' }],
    },
    {
      key: `ikco.vitara-${run}`, groups: ['IKCO'], name: { fa: `گرند ویتارا ${run}`, en: `Grand Vitara ${run}` }, make: { fa: 'سوزوکی', en: 'Suzuki' }, status: 'official', sources: [src(OFFICIAL)],
      equivalences: [{ key: `eq.vitara-${run}`, model: null, legacy: { vehicleSlug: 'suzuki', modelSlug: null }, status: 'uncertain', note: 'maybe all generations' }],
    },
    { key: `ikco.tondar-${run}`, groups: ['IKCO', 'SAIPA'], name: { fa: `تندر ${run}`, en: `Tondar ${run}` }, make: { fa: 'رنو', en: 'Renault' }, status: 'official', sources: [src(OFFICIAL)] },
    { key: `saipa.nomake-${run}`, groups: ['SAIPA'], name: { fa: `بی‌نام ${run}`, en: `Nomake ${run}` }, make: null, status: 'official', sources: [src(OFFICIAL)] },
    { key: `saipa.review-${run}`, groups: ['SAIPA'], name: { fa: `بررسی ${run}`, en: `Review ${run}` }, make: null, status: 'needs_review', sources: [src(SECONDARY)] },
  ],
};

const importer = (args: string[], env: Record<string, string> = {}) =>
  execFileSync(process.execPath, ['dist/database/import-vehicles.js', '--file', file, ...args], { cwd: apiRoot, env: { ...process.env, ...env }, stdio: 'pipe' }).toString();
const report = (reportDir: string) => JSON.parse(readFileSync(path.join(reportDir, 'report.json'), 'utf8')) as { counts: Record<string, number>; report: any[] };
const counts = async () => ({
  vehicles: await s.prisma.vehicle.count(), models: await s.prisma.vehicleModel.count(), sources: await s.prisma.vehicleSource.count(),
  equivalences: await s.prisma.vehicleEquivalence.count(), groups: await s.prisma.vehicleFinderGroup.count(), links: await s.prisma.productVehicle.count(),
});
const links = () => s.prisma.productVehicle.findMany({ orderBy: { id: 'asc' }, select: { id: true, productId: true, vehicleId: true, modelId: true, yearFrom: true, yearTo: true } });
const search = (qs: string) => anon().get<any>(`/catalog/products?${qs}&pageSize=60`);
const skus = async (qs: string) => {
  const res = await search(qs);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body.items as any[]).map((p) => p.sku).sort();
};

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  writeFileSync(file, JSON.stringify(dataset));
  const peugeot = await s.prisma.vehicle.findUniqueOrThrow({ where: { slug: 'peugeot' } });
  const suzuki = await s.prisma.vehicle.findUniqueOrThrow({ where: { slug: 'suzuki' } });
  const m2008 = await s.prisma.vehicleModel.create({ data: { vehicleId: peugeot.id, name: `2008 ${run}`, nameKey: vehicleKey(`2008 ${run}`), slug: `p2008-${run}` } });
  ids.peugeot = peugeot.id;
  ids.m2008 = m2008.id;
  // Parts linked before the import to older make-level rows (as on the live catalogue).
  await createProduct(owner, { sku: `VF-LEG2008-${run}`, nameFa: 'قطعهٔ پژو ۲۰۰۸ قدیمی', onHand: 1, vehicles: [{ vehicleId: peugeot.id, modelId: m2008.id }] });
  await createProduct(owner, { sku: `VF-LEGPEUGEOT-${run}`, nameFa: 'قطعهٔ کلی پژو', onHand: 1, vehicles: [{ vehicleId: peugeot.id, modelId: null }] });
  await createProduct(owner, { sku: `VF-LEGSUZUKI-${run}`, nameFa: 'قطعهٔ سوزوکی قدیمی', onHand: 1, vehicles: [{ vehicleId: suzuki.id, modelId: null }] });
});

afterAll(async () => {
  await t?.close();
});

describe('dataset import', () => {
  it('a dry run writes the report and changes nothing', async () => {
    const before = await counts();
    const out = importer(['--report', path.join(dir, 'dry')]);
    expect(out).toContain('dry run');
    expect(await counts()).toEqual(before);
    const r = report(path.join(dir, 'dry'));
    expect(r.counts.conflict).toBe(0);
    const kinds = Object.fromEntries(r.report.map((x) => [`${x.entity}:${x.key}`, x.kind]));
    expect(kinds['vehicle:ikco.samand']).toBe('matched');
    expect(kinds[`vehicle:saipa.review-${run}`]).toBe('uncertain');
    expect(kinds[`years:ikco.samand.se${run}`]).toBe('uncertain');
    expect(kinds[`equivalence:eq.vitara-${run}`]).toBe('uncertain');
    expect(kinds[`equivalence:eq.p2008-${run}`]).toBe('matched');
    expect(kinds[`vehicle:saipa.nomake-${run}`]).toBe('new');
    expect(r.report.some((x) => x.key === `saipa.nomake-${run}` && x.kind === 'uncertain')).toBe(true);
  });

  it('apply keeps existing rows and links, never links vehicles to parts, and a second apply creates nothing', async () => {
    const samandBefore = await s.prisma.vehicle.findUniqueOrThrow({ where: { slug: 'samand' } });
    const linksBefore = await links();
    importer(['--report', path.join(dir, 'apply1'), '--apply']);
    const after1 = await counts();
    const samand = await s.prisma.vehicle.findUniqueOrThrow({ where: { slug: 'samand' } });
    expect({ id: samand.id, name: samand.name, slug: samand.slug }).toEqual({ id: samandBefore.id, name: samandBefore.name, slug: samandBefore.slug });
    expect(samand).toMatchObject({ finderVisible: true, makeFa: 'ایران‌خودرو', dataKey: 'ikco.samand' });
    expect(await links()).toEqual(linksBefore);
    expect(await s.prisma.vehicle.findFirst({ where: { dataKey: `saipa.review-${run}` } })).toBeNull();
    const se = await s.prisma.vehicleModel.findFirstOrThrow({ where: { dataKey: `ikco.samand.se${run}` } });
    expect([se.yearFrom, se.yearTo, se.yearCalendar]).toEqual([null, null, null]);
    expect((await s.prisma.vehicle.findUniqueOrThrow({ where: { slug: 'peugeot' } })).finderVisible).toBe(false);

    importer(['--report', path.join(dir, 'apply2'), '--apply']);
    expect(await counts()).toEqual(after1);
    const r2 = report(path.join(dir, 'apply2'));
    expect(r2.counts.new).toBe(0);
    expect(r2.counts.matched).toBe(0);
    expect(await links()).toEqual(linksBefore);
    expect(await s.prisma.auditLog.count({ where: { action: 'vehicles.dataset_imported' } })).toBeGreaterThanOrEqual(2);
  });

  it('refuses to write with APP_ENV=production without the explicit owner approval flag', () => {
    expect(() => importer(['--report', path.join(dir, 'prod'), '--apply'], { APP_ENV: 'production' })).toThrow(/refused/);
  });
});

describe('finder steps', () => {
  it('lists groups, then only classified vehicles of a group, then models with years in their own calendar', async () => {
    const groups = (await anon().get<any[]>('/catalog/vehicle-finder/groups')).body;
    expect(groups.map((g) => g.slug)).toEqual(expect.arrayContaining(['iran-khodro', 'saipa', 'toyota', 'hyundai']));
    const ikco = (await anon().get<any[]>('/catalog/vehicle-finder/vehicles?group=iran-khodro')).body;
    const saipa = (await anon().get<any[]>('/catalog/vehicle-finder/vehicles?group=saipa')).body;
    const tondar = await s.prisma.vehicle.findFirstOrThrow({ where: { dataKey: `ikco.tondar-${run}` } });
    ids.tondar = tondar.slug;
    expect(ikco.map((v) => v.slug)).toEqual(expect.arrayContaining(['samand', tondar.slug]));
    expect(ikco.map((v) => v.slug)).not.toContain('peugeot');
    expect(saipa.map((v) => v.slug)).toContain(tondar.slug);
    expect(saipa.map((v) => v.slug)).not.toContain('samand');
    expect(ikco.find((v) => v.slug === 'samand')).toMatchObject({ make: { fa: 'ایران‌خودرو', en: 'Iran Khodro' }, aliases: ['samand'] });
    expect(saipa.find((v) => v.name.en === `Nomake ${run}`).make).toBeNull();

    const models = (await anon().get<any[]>('/catalog/vehicle-finder/models?group=iran-khodro&vehicle=samand')).body;
    const lx = models.find((m) => m.name.en === `Samand LX ${run}`);
    ids.lx = lx.slug;
    expect(lx).toMatchObject({ supply: 'domestic', years: { from: 1390, to: 1400, calendar: 'jalali' } });
    expect(models.find((m) => m.name.en === `Samand SE ${run}`).years).toBeNull();

    const wrong = await anon().get<any>('/catalog/vehicle-finder/models?group=saipa&vehicle=samand');
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatchObject({ code: 'VEHICLE_SELECTION_INVALID', details: { field: 'vehicle' } });
    expect((await anon().get<any>('/catalog/vehicle-finder/vehicles?group=nope')).status).toBe(400);
    // Every step is optional: the vehicle list also works without a group and names each vehicle's groups.
    const all = (await anon().get<any[]>('/catalog/vehicle-finder/vehicles')).body;
    expect(all.find((v) => v.slug === tondar.slug).groups).toEqual(['iran-khodro', 'saipa']);
    expect(all.map((v) => v.slug)).not.toContain('peugeot');
    expect((await anon().get<any[]>('/catalog/vehicle-finder/models?vehicle=samand')).body.length).toBe(models.length);
  });
});

describe('parts for a selection', () => {
  it('accepts any combination of steps but rejects selections that do not belong together', async () => {
    const lx = await s.prisma.vehicleModel.findFirstOrThrow({ where: { dataKey: `ikco.samand.lx${run}` } });
    for (const qs of ['group=iran-khodro', 'group=iran-khodro&vehicle=samand', 'group=iran-khodro&vehicle=samand&year=1395', `group=iran-khodro&vehicle=samand&model=${lx.slug}`]) {
      expect((await search(qs)).status, qs).toBe(200);
    }
    const cases: Array<[string, string]> = [
      ['group=nope&vehicle=samand', 'group'],
      ['group=saipa&vehicle=samand', 'vehicle'],
      ['group=iran-khodro&vehicle=peugeot', 'vehicle'],
      ['group=iran-khodro&model=x', 'model'],
      ['group=iran-khodro&year=1395', 'year'],
      ['group=iran-khodro&vehicle=samand&model=not-a-model', 'model'],
      [`group=iran-khodro&vehicle=${ids.tondar}&model=${lx.slug}`, 'model'],
      [`group=iran-khodro&vehicle=samand&model=${lx.slug}&year=1401`, 'year'],
      [`group=iran-khodro&vehicle=samand&model=${lx.slug}&year=2015`, 'year'],
      ['vehicle=samand&year=1395', 'year'],
    ];
    for (const [qs, field] of cases) {
      const res = await search(qs);
      expect(res.status, qs).toBe(400);
      expect(res.body.error, qs).toMatchObject({ code: 'VEHICLE_SELECTION_INVALID', details: { field } });
    }
  });

  it('ranks parts: verified links first, then unconfirmed, then suggestions — never claiming an unrecorded fit', async () => {
    const lx = await s.prisma.vehicleModel.findFirstOrThrow({ where: { dataKey: `ikco.samand.lx${run}` } });
    const se = await s.prisma.vehicleModel.findFirstOrThrow({ where: { dataKey: `ikco.samand.se${run}` } });
    const samand = await s.prisma.vehicle.findUniqueOrThrow({ where: { slug: 'samand' } });
    const v = (vehicles: any[]) => vehicles as Array<{ vehicleId: string; modelId: string | null }>;
    await createProduct(owner, { sku: `VF-COVER-${run}`, nameFa: 'سال تأییدشده', onHand: 1, vehicles: v([{ vehicleId: samand.id, modelId: lx.id, yearFrom: 1395, yearTo: 1398 }]) });
    await createProduct(owner, { sku: `VF-NOYEAR-${run}`, nameFa: 'بدون سال', onHand: 1, vehicles: v([{ vehicleId: samand.id, modelId: lx.id }]) });
    await createProduct(owner, { sku: `VF-OUT-${run}`, nameFa: 'سال دیگر', onHand: 1, vehicles: v([{ vehicleId: samand.id, modelId: lx.id, yearFrom: 1380, yearTo: 1385 }]) });
    await createProduct(owner, { sku: `VF-GREG-${run}`, nameFa: 'سال میلادی', onHand: 1, vehicles: v([{ vehicleId: samand.id, modelId: lx.id, yearFrom: 2010, yearTo: 2012 }]) });
    await createProduct(owner, { sku: `VF-SE-${run}`, nameFa: 'فقط SE', onHand: 1, vehicles: v([{ vehicleId: samand.id, modelId: se.id }]) });
    await createProduct(owner, { sku: `VF-WHOLE-${run}`, nameFa: 'کل سمند', onHand: 1, vehicles: v([{ vehicleId: samand.id, modelId: null }]) });
    await createProduct(owner, { sku: `VF-TAG-${run}`, nameFa: 'برچسب گروه', onHand: 1, vehicleBrandCodes: ['IKCO'] });
    await createProduct(owner, { sku: `VF-NAME-${run}`, nameFa: 'فیلتر روغن سمند', onHand: 1, vehicleBrandCodes: ['TOYOTA'] });
    await createProduct(owner, { sku: `VF-TXT-${run}`, nameFa: 'شمع موتور', onHand: 1, vehicleBrandCodes: ['TOYOTA'] });

    const ranked = async (qs: string) => {
      const res = await search(qs);
      expect(res.status, qs).toBe(200);
      const items = (res.body.items as any[]).filter((p) => p.sku.endsWith(run));
      return {
        body: res.body,
        order: items.map((p) => p.sku.replace(`-${run}`, '') as string),
        match: Object.fromEntries(items.map((p) => [p.sku.replace(`-${run}`, ''), `${p.finderMatch?.tier}:${p.finderMatch?.reason}`])) as Record<string, string>,
      };
    };
    const tierOrder = (order: string[], match: Record<string, string>) => order.map((k) => ['verified', 'relevant', 'related', 'text'].indexOf(match[k]!.split(':')[0]!));

    // Vehicle only: a whole-vehicle link is verified; a link to one model is relevant (the model is not known).
    let r = await ranked('group=iran-khodro&vehicle=samand');
    expect(r.match).toMatchObject({
      'VF-WHOLE': 'verified:VEHICLE', 'VF-COVER': 'relevant:SOME_MODEL', 'VF-NOYEAR': 'relevant:SOME_MODEL', 'VF-OUT': 'relevant:SOME_MODEL',
      'VF-GREG': 'relevant:SOME_MODEL', 'VF-SE': 'relevant:SOME_MODEL', 'VF-TAG': 'related:GROUP_TAG', 'VF-NAME': 'related:NAME_MATCH',
    });
    expect(tierOrder(r.order, r.match)).toEqual([...tierOrder(r.order, r.match)].sort());
    expect(r.body.tiers.verified).toBeGreaterThanOrEqual(1);

    // With the model: links to it or to the whole vehicle are verified; another model is only a suggestion.
    r = await ranked(`group=iran-khodro&vehicle=samand&model=${lx.slug}`);
    expect(r.match).toMatchObject({ 'VF-COVER': 'verified:MODEL', 'VF-NOYEAR': 'verified:MODEL', 'VF-OUT': 'verified:MODEL', 'VF-GREG': 'verified:MODEL', 'VF-WHOLE': 'verified:MODEL', 'VF-SE': 'related:OTHER_MODEL' });

    // With a year: only a covering range in the same calendar is verified.
    r = await ranked(`group=iran-khodro&vehicle=samand&model=${lx.slug}&year=1396`);
    expect(r.match).toMatchObject({
      'VF-COVER': 'verified:MODEL', 'VF-NOYEAR': 'relevant:YEAR_UNCONFIRMED', 'VF-GREG': 'relevant:YEAR_UNCONFIRMED', 'VF-WHOLE': 'relevant:YEAR_UNCONFIRMED',
      'VF-OUT': 'related:OTHER_YEARS', 'VF-SE': 'related:OTHER_MODEL',
    });
    expect(r.order[0]).toBe('VF-COVER');
    expect(r.body.selection).toMatchObject({ group: { slug: 'iran-khodro' }, vehicle: { slug: 'samand' }, model: { slug: lx.slug }, year: 1396, calendar: 'jalali' });

    // A year without a model compares the links' own years.
    r = await ranked('group=iran-khodro&vehicle=samand&year=1396');
    expect(r.match['VF-WHOLE']).toBe('relevant:YEAR_UNCONFIRMED');
    expect(r.match['VF-COVER']).toBe('relevant:SOME_MODEL');

    // Only a group: parts recorded for a vehicle of the group, then parts tagged with it.
    r = await ranked('group=iran-khodro');
    expect(r.body.selection.vehicle).toBeNull();
    expect(r.match).toMatchObject({ 'VF-COVER': 'verified:GROUP', 'VF-WHOLE': 'verified:GROUP', 'VF-TAG': 'related:GROUP_TAG' });
    expect(r.match['VF-TXT']).toBeUndefined();

    // A typed search is narrowed by the selection but keeps other matches last, labelled as text only.
    r = await ranked(`group=iran-khodro&vehicle=samand&q=${encodeURIComponent('شمع موتور')}`);
    expect(r.match).toEqual({ 'VF-TXT': 'text:TEXT' });
    expect((await ranked(`group=iran-khodro&vehicle=samand&q=VF-WHOLE-${run}`)).match).toEqual({ 'VF-WHOLE': 'verified:VEHICLE' });

    // Nothing related and no text: no fitted parts and never the whole catalogue.
    const nomake = await s.prisma.vehicle.findFirstOrThrow({ where: { dataKey: `saipa.nomake-${run}` } });
    const empty = await search(`group=saipa&vehicle=${nomake.slug}`);
    expect(empty.status).toBe(200);
    expect((empty.body.items as any[]).every((p) => p.finderMatch?.tier === 'related')).toBe(true);
    expect((empty.body.items as any[]).filter((p) => p.sku.endsWith(run))).toEqual([]);
    expect(empty.body.tiers.verified + empty.body.tiers.relevant).toBe(0);
  });

  it('older rows count only through a confirmed equivalence with the exact older model', async () => {
    const p2008 = await s.prisma.vehicle.findFirstOrThrow({ where: { dataKey: `ikco.peugeot-2008-${run}` } });
    const vitara = await s.prisma.vehicle.findFirstOrThrow({ where: { dataKey: `ikco.vitara-${run}` } });
    const verified = async (qs: string) => ((await search(qs)).body.items as any[]).filter((p) => p.sku.endsWith(run) && p.finderMatch?.tier === 'verified').map((p) => p.sku);
    expect(await verified(`group=iran-khodro&vehicle=${p2008.slug}`)).toEqual([`VF-LEG2008-${run}`]);
    expect(await verified(`group=iran-khodro&vehicle=${vitara.slug}`)).toEqual([]);
    // The /cars pages and the older vehicle filter keep working on the original rows.
    expect((await skus('vehicle=peugeot')).filter((x) => x.endsWith(run))).toEqual([`VF-LEG2008-${run}`, `VF-LEGPEUGEOT-${run}`].sort());
  });
});

describe('Appearance', () => {
  it('the finder and the shopping paths are ordinary blocks: saved, moved and published without touching other sections', async () => {
    const endpoint = `/admin/content/builder/finder-${run}`;
    const draft = (await owner.get<BuilderState>(endpoint)).body;
    const film = newBuilderBlock('cinematic-hero', `film-${run}`);
    const products = newBuilderBlock('new-products', `products-${run}`);
    const finder = newBuilderBlock('vehicle-finder', `finder-${run}`);
    const paths = newBuilderBlock('shopping-paths', `paths-${run}`);
    const first = { ...draft.document, sections: [paths, film, finder, products] };
    expect((await owner.put(endpoint, { version: draft.version, document: first })).status).toBe(200);
    // Move the shopping paths to the end (as the owner does in the panel) and publish.
    const saved = (await owner.get<BuilderState>(endpoint)).body;
    expect(saved.document.sections.map((b) => b.kind)).toEqual(['shopping-paths', 'cinematic-hero', 'vehicle-finder', 'new-products']);
    const moved = { ...saved.document, sections: [film, finder, products, paths] };
    expect((await owner.put(endpoint, { version: saved.version, document: moved })).status).toBe(200);
    const again = (await owner.get<BuilderState>(endpoint)).body;
    expect((await owner.post(`${endpoint}/publish`, { version: again.version })).status).toBe(201);
    const live = (await anon().get<BuilderDocument>(`/site/builder/finder-${run}`)).body;
    expect(live.sections.map((b) => b.id)).toEqual([film.id, finder.id, products.id, paths.id]);
    expect(live.sections.find((b) => b.id === film.id)).toEqual(film);
    expect(live.sections.find((b) => b.id === products.id)).toEqual(products);
    expect(live.sections.find((b) => b.id === finder.id)).toMatchObject({ kind: 'vehicle-finder', button: finder.button, title: finder.title });
  });

  it('header logos and the home header style are managed in the page settings, with safe defaults for older pages', async () => {
    const endpoint = `/admin/content/builder/logo-${run}`;
    const draft = (await owner.get<BuilderState>(endpoint)).body;
    // An older page saved without the new fields gets the defaults.
    const { logo: _logo, homeHeader: _homeHeader, ...olderChrome } = draft.document.chrome as any;
    expect((await owner.put(endpoint, { version: draft.version, document: { ...draft.document, chrome: olderChrome } })).status).toBe(200);
    const saved = (await owner.get<BuilderState>(endpoint)).body;
    expect(saved.document.chrome).toMatchObject({ homeHeader: 'minimal', logo: { headerUrl: '', mobileUrl: '', onLightUrl: '', size: 'lg', align: 'center' } });
    const logo = { headerUrl: '/media/content/logo/new-header.webp', mobileUrl: '/media/content/logo/new-mobile.webp', onLightUrl: '', size: 'xl', align: 'start' };
    const next = { ...saved.document, chrome: { ...saved.document.chrome, logo, homeHeader: 'classic' } };
    expect((await owner.put(endpoint, { version: saved.version, document: next })).status).toBe(200);
    const again = (await owner.get<BuilderState>(endpoint)).body;
    expect((await owner.post(`${endpoint}/publish`, { version: again.version })).status).toBe(201);
    const live = (await anon().get<BuilderDocument>(`/site/builder/logo-${run}`)).body;
    expect(live.chrome).toMatchObject({ homeHeader: 'classic', logo });
    // Only safe presets and site-relative or https images are accepted.
    for (const bad of [{ size: 'huge' }, { align: 'end' }, { headerUrl: 'javascript:alert(1)' }]) {
      const res = await owner.put(endpoint, { version: again.version + 1, document: { ...next, chrome: { ...next.chrome, logo: { ...logo, ...bad } } } });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});
