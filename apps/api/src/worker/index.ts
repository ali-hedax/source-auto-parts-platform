import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommonModule } from '../common/common.module.js';
import { JsonLogger } from '../common/logger.js';
import { loadEnv } from '../config/env.js';
import { AttachmentsModule } from '../modules/attachments/attachments.module.js';
import { ImportsModule } from '../modules/imports/imports.module.js';
import { NotificationsModule } from '../modules/notifications/notifications.module.js';
import { OrdersModule } from '../modules/orders/orders.module.js';
import { PaymentsModule } from '../modules/payments/payments.module.js';
import { QuoteDocumentService } from '../modules/sourcing/quote-document.js';
import { SourcingModule } from '../modules/sourcing/sourcing.module.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';

/**
 * The worker reuses the API's modules (same business rules, same DB access)
 * but runs as a separate process without HTTP. Long jobs (Excel, scanning,
 * PDFs, reconciliation) never run inside a web request.
 */
@Module({
  imports: [CommonModule, PaymentsModule, OrdersModule, SourcingModule, AttachmentsModule, ImportsModule, NotificationsModule],
  providers: [OutboxDispatcher, QuoteDocumentService],
})
export class WorkerModule {}

export async function createWorkerContext() {
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: new JsonLogger(env.LOG_LEVEL) });
  app.enableShutdownHooks();
  return {
    app,
    dispatcher: app.get(OutboxDispatcher),
    quoteDocuments: app.get(QuoteDocumentService),
  };
}

export { OutboxDispatcher, QuoteDocumentService };
export { renderQuoteHtml, type QuoteDocumentLocale } from '../modules/sourcing/quote-document.js';
