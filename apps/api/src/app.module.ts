import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ReturnsModule } from './modules/returns/returns.module.js';
import { AccountModule } from './modules/account/account.module.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { ImportsModule } from './modules/imports/imports.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { SourcingModule } from './modules/sourcing/sourcing.module.js';

@Module({
  imports: [
    CommonModule,
    PricingModule,
    InventoryModule,
    CatalogModule,
    CartModule,
    AuthModule,
    AccountModule,
    SettingsModule,
    PaymentsModule,
    OrdersModule,
    AttachmentsModule,
    ConversationsModule,
    SourcingModule,
    ImportsModule,
    NotificationsModule,
    ReturnsModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
