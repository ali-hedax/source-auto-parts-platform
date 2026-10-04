import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { ProcurementService } from './procurement.service.js';
import { QuotesService } from './quotes.service.js';
import { SourcingController } from './sourcing.controller.js';
import { SourcingService } from './sourcing.service.js';

@Module({
  imports: [AttachmentsModule, ConversationsModule, OrdersModule, PaymentsModule, PricingModule, SettingsModule],
  controllers: [SourcingController],
  providers: [SourcingService, QuotesService, ProcurementService],
  exports: [QuotesService, ProcurementService],
})
export class SourcingModule {}
