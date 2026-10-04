import { Module } from '@nestjs/common';
import { smsProviderFactory } from '../../integrations/sms/sms.provider.js';
import { CartModule } from '../cart/cart.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [CartModule],
  controllers: [AuthController],
  providers: [AuthService, smsProviderFactory],
  exports: [AuthService],
})
export class AuthModule {}
