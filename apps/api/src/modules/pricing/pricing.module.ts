import { Module } from '@nestjs/common';
import { FxController } from './fx.controller.js';
import { PricingService } from './pricing.service.js';

@Module({
  controllers: [FxController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
