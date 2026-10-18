import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommonModule } from '../common/common.module.js';
import { JsonLogger } from '../common/logger.js';
import { loadEnv } from '../config/env.js';
import { AttachmentsModule } from '../modules/attachments/attachments.module.js';
import { ImportsModule } from '../modules/imports/imports.module.js';
import { MailModule } from '../modules/mail/mail.module.js';
import { NotificationsModule } from '../modules/notifications/notifications.module.js';
import { OrdersModule } from '../modules/orders/orders.module.js';
import { PaymentsModule } from '../modules/payments/payments.module.js';
import { QuoteDocumentService } from '../modules/sourcing/quote-document.js';
import { SourcingModule } from '../modules/sourcing/sourcing.module.js';
import { TrashModule } from '../modules/trash/trash.module.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { KnowledgeCatalogModule } from '../modules/knowledge-catalog/knowledge-catalog.module.js';
import { KnowledgeCatalogService } from '../modules/knowledge-catalog/knowledge-catalog.service.js';
import { BrandImportsModule } from '../modules/brand-imports/brand-imports.module.js';
import { BrandImportsService } from '../modules/brand-imports/brand-imports.service.js';
import { MessengerBotsModule } from '../modules/messenger-bots/messenger-bots.module.js';
import { MessengerBotsService } from '../modules/messenger-bots/messenger-bots.service.js';

/**
 * The worker reuses the API's modules (same business rules, same DB access)
 * but runs as a separate process without HTTP. Long jobs (Excel, scanning,
 * PDFs, reconciliation) never run inside a web request.
 */
@Module({
  imports: [CommonModule, MailModule, PaymentsModule, OrdersModule, SourcingModule, AttachmentsModule, ImportsModule, NotificationsModule, TrashModule, MessengerBotsModule, KnowledgeCatalogModule, BrandImportsModule],
  providers: [OutboxDispatcher, QuoteDocumentService],
})
export class WorkerModule {}

export async function createWorkerContext() {
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: new JsonLogger(env.LOG_LEVEL) });
  app.enableShutdownHooks();
  app.get(OutboxDispatcher).register('catalog.extract', (payload) => app.get(KnowledgeCatalogService).extract(String(payload.documentId)));
  // Brand database imports: the heavy steps (reading large files, writing in batches, undo) run here.
  app.get(OutboxDispatcher).register('brand-import.inspect', (p) => app.get(BrandImportsService).inspect(String(p.importId)));
  app.get(OutboxDispatcher).register('brand-import.preview', (p) => app.get(BrandImportsService).preview(String(p.importId)));
  app.get(OutboxDispatcher).register('brand-import.run', (p) => app.get(BrandImportsService).run(String(p.importId)));
  app.get(OutboxDispatcher).register('brand-import.rollback', (p) => app.get(BrandImportsService).undo(String(p.importId)));
  app.get(OutboxDispatcher).register('messenger.reply', (payload) => app.get(MessengerBotsService).deliver(payload));
  return {
    app,
    dispatcher: app.get(OutboxDispatcher),
    quoteDocuments: app.get(QuoteDocumentService),
  };
}

export { OutboxDispatcher, QuoteDocumentService };
export { renderQuoteHtml, type QuoteDocumentLocale } from '../modules/sourcing/quote-document.js';
