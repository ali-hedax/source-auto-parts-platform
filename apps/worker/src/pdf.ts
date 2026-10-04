import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { type Browser, type LaunchOptions, chromium } from 'playwright';

const require = createRequire(import.meta.url);

/** Self-hosted brand fonts embedded as data URLs: Vazirmatn (Persian + Latin) and Montserrat (Latin). */
export async function documentFontCss(): Promise<string> {
  const faces: string[] = [];
  for (const [family, weight, file] of [
    ['Vazirmatn', 400, '@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2'],
    ['Vazirmatn', 700, '@fontsource/vazirmatn/files/vazirmatn-arabic-700-normal.woff2'],
    ['Vazirmatn', 400, '@fontsource/vazirmatn/files/vazirmatn-latin-400-normal.woff2'],
    ['Vazirmatn', 700, '@fontsource/vazirmatn/files/vazirmatn-latin-700-normal.woff2'],
    ['Montserrat', 400, '@fontsource/montserrat/files/montserrat-latin-400-normal.woff2'],
    ['Montserrat', 700, '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2'],
  ] as const) {
    const data = await readFile(require.resolve(file));
    faces.push(`@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')}`);
  }
  return faces.join('\n');
}

/** Browser selection: PDF_BROWSER_CHANNEL (msedge/chrome) or PDF_BROWSER_EXECUTABLE (e.g. /usr/bin/chromium in Docker). */
export function browserLaunchOptions(env: NodeJS.ProcessEnv = process.env): LaunchOptions {
  return {
    headless: true,
    ...(env.PDF_BROWSER_EXECUTABLE ? { executablePath: env.PDF_BROWSER_EXECUTABLE } : {}),
    ...(env.PDF_BROWSER_CHANNEL ? { channel: env.PDF_BROWSER_CHANNEL } : {}),
  };
}

/**
 * Renders trusted, escaped HTML to an A4 PDF with a headless browser so Persian
 * text is shaped correctly. JavaScript is disabled and the page is offline.
 */
export class PdfRenderer {
  private browser: Browser | null = null;

  constructor(private readonly launch: LaunchOptions = browserLaunchOptions()) {}

  async render(html: string): Promise<Buffer> {
    this.browser ??= await chromium.launch(this.launch);
    const context = await this.browser.newContext({ javaScriptEnabled: false, offline: true });
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
    } finally {
      await context.close();
    }
  }

  /** PNG of the first page area (used for visual checks in the test report). */
  async screenshot(html: string): Promise<Buffer> {
    this.browser ??= await chromium.launch(this.launch);
    const context = await this.browser.newContext({ javaScriptEnabled: false, offline: true, viewport: { width: 794, height: 1123 } });
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return Buffer.from(await page.screenshot({ fullPage: true }));
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
