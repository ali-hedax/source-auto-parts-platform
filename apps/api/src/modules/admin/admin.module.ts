import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { InvitationsService } from './invitations.service.js';
import { StaffErasureService } from './staff-erasure.service.js';
import { MailAdminController } from './mail-admin.controller.js';
import { OperationsController } from './operations.controller.js';
import { StaffController } from './staff.controller.js';

@Module({
  imports: [AuthModule, PaymentsModule, SettingsModule],
  controllers: [StaffController, OperationsController, MailAdminController],
  providers: [InvitationsService, StaffErasureService],
})
export class AdminModule {}
