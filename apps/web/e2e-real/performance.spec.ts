import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser } from '@playwright/test';

/**
 * Lab measurement of LCP and CLS for public pages (spec §15: "report real
 * results"), on a production build of the web app against the real API. Runs
 * only in the isolated runner's production mode (E2E_PERF=1):
 *   pnpm --filter @hedax/web e2e:real -- --perf
 * Conditions: mobile viewport 390×844, CPU slowed 4×, network ~1.6 Mbps down /
 * 0.75 Mbps up with 150 ms latency (Lighthouse "slow 4G"-like), empty browser
 * cache, one warm-up request per page so server start-up is not measured.
 * Targets: LCP ≤ 2.5 s and CLS < 0.1 (spec). CLS is asserted; LCP is recorded
 * (it depends on the machine) and reported in docs/TEST_REPORT.md as the median
 * of E2E_PERF_SAMPLES loads per page (default 3). The LCP element and its
 * candidates, first paint, long main-thread tasks and the largest layout shifts
 * are recorded too, to explain the numbers. E2E_PERF_TRACE_DIR additionally
 * saves a Chrome performance trace per load (open it in DevTools › Performance).
 */
test.skip(process.env.E2E_PERF !== '1', 'needs the production-mode isolated stack: pnpm --filter @hedax/web e2e:real -- --perf');

const PAGES: Array<[string, string]> = [
  ['home', '/fa'],
  ['search', `/fa/parts?q=${encodeURIComponent('فیلتر')}`],
  ['product', '/fa/parts/demo-demo-0002'],
];

interface Shift { value: number; sources: string[] }
interface Measurement {
  lcpMs: number; fcpMs: number | null; cls: number; lcpElement: string | null; shifts: Shift[];
  lcpCandidates: Array<{ ms: number; element: string; size: number }>;
  longTasks: { count: number; totalMs: number; longestMs: number };
  ttfbMs: number | null; htmlKb: number | null; domContentLoadedMs: number | null;
  resources: Record<string, { count: number; kb: number; lastEndMs: number }>;
}
const results: Array<Measurement & { page: string; path: string; filtersInServerHtml?: boolean }> = [];

let traceCount = 0;

async function measure(browser: Browser, baseURL: string, url: string): Promise<Measurement> {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cls: number; __shifts: Shift[]; __lcpAll: Array<{ ms: number; element: string; size: number }>; __long: number[] };
    w.__lcp = 0;
    w.__cls = 0;
    w.__shifts = [];
    w.__lcpAll = [];
    w.__long = [];
    const describe = (node: Node | null | undefined): string => {
      const el = node instanceof Element ? node : node?.parentElement;
      if (!el) return '?';
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.split(' ').slice(0, 3).join('.')}` : '';
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`;
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { element?: Element | null; size: number }>) {
        w.__lcp = entry.startTime;
        (w as unknown as { __lcpElement: string }).__lcpElement = describe(entry.element);
        w.__lcpAll.push({ ms: Math.round(entry.startTime), element: describe(entry.element), size: entry.size });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    // Main-thread tasks over 50 ms (script evaluation, hydration, style and layout).
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__long.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => {
      type LayoutShift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> };
      for (const entry of list.getEntries() as LayoutShift[]) {
        if (entry.hadRecentInput) continue;
        w.__cls += entry.value;
        w.__shifts.push({
          value: Math.round(entry.value * 1000) / 1000,
          sources: (entry.sources ?? []).map((s) => `${describe(s.node)} y ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h ${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Optional Chrome performance trace for diagnosis (E2E_PERF_TRACE_DIR); open it in DevTools › Performance.
  const traceDir = process.env.E2E_PERF_TRACE_DIR;
  if (traceDir) await browser.startTracing(page, { path: path.join(traceDir, `trace-${new URL(url, baseURL).pathname.split('/').filter(Boolean).join('-') || 'root'}-${++traceCount}.json`), screenshots: false });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_500);
  if (traceDir) await browser.stopTracing();
  const value = await page.evaluate(() => {
    const w = window as unknown as { __lcp: number; __cls: number; __shifts: Shift[]; __lcpElement?: string; __lcpAll: Array<{ ms: number; element: string; size: number }>; __long: number[] };
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // Where the time goes: server response, then bytes per resource kind and when the last of each arrived.
    const kinds: Record<string, { count: number; kb: number; lastEndMs: number }> = {};
    for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
      const ext = /\.(woff2?|css|js)(\?|$)/.exec(r.name)?.[1] ?? r.initiatorType;
      const k = (kinds[ext] ??= { count: 0, kb: 0, lastEndMs: 0 });
      k.count += 1;
      k.kb += Math.round(r.transferSize / 102.4) / 10;
      k.lastEndMs = Math.max(k.lastEndMs, Math.round(r.responseEnd));
    }
    return {
      lcpMs: Math.round(w.__lcp),
      fcpMs: fcp ? Math.round(fcp.startTime) : null,
      lcpCandidates: w.__lcpAll,
      longTasks: { count: w.__long.length, totalMs: Math.round(w.__long.reduce((a, b) => a + b, 0)), longestMs: Math.round(Math.max(0, ...w.__long)) },
      cls: Math.round(w.__cls * 1000) / 1000,
      lcpElement: w.__lcpElement ?? null,
      ttfbMs: nav ? Math.round(nav.responseStart) : null,
      htmlKb: nav ? Math.round(nav.transferSize / 102.4) / 10 : null,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      resources: kinds,
      shifts: [...w.__shifts].sort((a, b) => b.value - a.value).slice(0, 5),
    };
  });
  await context.close();
  return value;
}

/** Samples per page: single loads on a laptop vary by up to a second, so the median is reported. */
const SAMPLES = Math.max(1, Number(process.env.E2E_PERF_SAMPLES ?? 3));
const summaries: Array<{ page: string; path: string; samples: number; lcpMs: { median: number; min: number; max: number }; fcpMedianMs: number | null; clsMax: number }> = [];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;

for (const [name, url] of PAGES) {
  test(`lab LCP and CLS: ${name}`, async ({ browser, baseURL, request }) => {
    test.setTimeout(60_000 + SAMPLES * 30_000);
    // Warm-up (server caches are not part of the measurement); also shows whether the filters are server-rendered.
    const html = await (await request.get(url)).text();
    const samples: Measurement[] = [];
    for (let i = 0; i < SAMPLES; i++) samples.push(await measure(browser, baseURL as string, url));
    for (const value of samples) results.push({ page: name, path: url, ...value, ...(name === 'search' ? { filtersInServerHtml: html.includes('id="filter-q"') } : {}) });
    const lcps = samples.map((s) => s.lcpMs);
    const fcps = samples.flatMap((s) => (s.fcpMs === null ? [] : [s.fcpMs]));
    summaries.push({
      page: name, path: url, samples: SAMPLES,
      lcpMs: { median: median(lcps), min: Math.min(...lcps), max: Math.max(...lcps) },
      fcpMedianMs: fcps.length ? median(fcps) : null,
      clsMax: Math.max(...samples.map((s) => s.cls)),
    });
    expect(Math.min(...lcps)).toBeGreaterThan(0);
    expect.soft(Math.max(...samples.map((s) => s.cls)), `CLS on ${name}`).toBeLessThan(0.1);
  });
}

test.afterAll(() => {
  const out = process.env.E2E_PERF_OUT;
  if (out && results.length) {
    const conditions = 'production build; 390×844 mobile; CPU 4×; 1.6 Mbps/0.75 Mbps, 150 ms; cold browser cache';
    writeFileSync(out, `${JSON.stringify({ measuredAt: new Date().toISOString(), conditions, summaries, samples: results }, null, 2)}\n`);
  }
  for (const s of summaries) {
    process.stdout.write(`[perf] ${s.page.padEnd(8)} median of ${s.samples}: LCP ${s.lcpMs.median} ms (range ${s.lcpMs.min}–${s.lcpMs.max}), FCP ${s.fcpMedianMs} ms, CLS max ${s.clsMax}\n`);
  }
  for (const r of results) {
    const ssr = r.filtersInServerHtml === undefined ? '' : `  filters in server HTML: ${r.filtersInServerHtml}`;
    process.stdout.write(`[perf] ${r.page.padEnd(8)} LCP ${r.lcpMs} ms (${r.lcpElement ?? '?'})  FCP ${r.fcpMs} ms  CLS ${r.cls}${ssr}\n`);
    process.stdout.write(`[perf]   LCP candidates: ${r.lcpCandidates.map((c) => `${c.ms} ms ${c.element} (${c.size})`).join(' → ')}\n`);
    process.stdout.write(`[perf]   long tasks: ${r.longTasks.count}, ${r.longTasks.totalMs} ms in total, longest ${r.longTasks.longestMs} ms\n`);
    const kinds = Object.entries(r.resources).map(([k, v]) => `${k} ${v.count}× ${Math.round(v.kb)} KB (last ${v.lastEndMs} ms)`).join(', ');
    process.stdout.write(`[perf]   TTFB ${r.ttfbMs} ms, HTML ${r.htmlKb} KB, DOMContentLoaded ${r.domContentLoadedMs} ms; ${kinds}\n`);
    for (const shift of r.shifts) process.stdout.write(`[perf]   shift ${shift.value}: ${shift.sources.join(' | ')}\n`);
  }
});
