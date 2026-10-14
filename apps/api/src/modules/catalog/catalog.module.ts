import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';
import { VehiclesAdminController, VehiclesPublicController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';

@Module({
  imports: [InventoryModule, PricingModule],
  controllers: [CatalogController, AdminCatalogController, UnitsController, VehiclesAdminController, VehiclesPublicController],
  providers: [CatalogService, AdminCatalogService, UnitsService, VehiclesService],
  exports: [CatalogService, UnitsService, VehiclesService],
})
export class CatalogModule {}
