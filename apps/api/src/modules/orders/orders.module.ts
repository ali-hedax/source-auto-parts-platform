import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CheckoutService } from './checkout.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { StockOrderSettlement } from './stock-order-settlement.js';

@Module({
  imports: [CartModule, CatalogModule, InventoryModule, PaymentsModule, PricingModule, SettingsModule],
  controllers: [OrdersController],
  providers: [CheckoutService, OrdersService, StockOrderSettlement],
  exports: [OrdersService, StockOrderSettlement],
})
export class OrdersModule {}
