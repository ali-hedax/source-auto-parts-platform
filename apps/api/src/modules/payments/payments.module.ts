import { Module } from '@nestjs/common';
import { PaymentProviderRegistry } from './provider-registry.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderRegistry],
  exports: [PaymentsService, PaymentProviderRegistry],
})
export class PaymentsModule {}
