import { createWorkerContext } from '@hedax/api/worker';
import { PdfRenderer, documentFontCss } from './pdf.js';

async function main(): Promise<void> {
  const { app, dispatcher, quoteDocuments } = await createWorkerContext();
  const css = await documentFontCss();
  const renderer = new PdfRenderer();

  /**
   * Quote PDFs in Persian (RTL) and English (LTR), both from the stored version
   * data only. The HTML is built from escaped quote data; the page has no
   * JavaScript and no network access.
   */
  dispatcher.register('quote.pdf.render', async (payload) => {
    for (const locale of ['fa', 'en'] as const) {
      const loaded = await quoteDocuments.load(String(payload.quoteVersionId), locale);
      if (!loaded) return;
      const pdf = await renderer.render(quoteDocuments.html(loaded.view, loaded.customerName, css, locale));
      await quoteDocuments.save(loaded.view.versionId, pdf, locale);
    }
  });

  await dispatcher.start();

  const shutdown = async () => {
    await renderer.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err: unknown) => {
  process.stderr.write(`${JSON.stringify({ level: 'fatal', msg: err instanceof Error ? err.message : String(err) })}\n`);
  process.exit(1);
});
