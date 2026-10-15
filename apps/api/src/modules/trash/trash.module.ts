import { Module } from '@nestjs/common';
import { StaffErasureService } from '../admin/staff-erasure.service.js';
import { StaffTrashService } from '../admin/staff-trash.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TrashService } from './trash.service.js';

/**
 * The trash and the kinds that use it (today: staff). Shared by the API (panel) and the worker
 * (daily purge), so each kind registers its purger in both processes.
 */
@Module({
  imports: [AuthModule, SettingsModule],
  providers: [TrashService, StaffErasureService, StaffTrashService],
  exports: [TrashService, StaffErasureService, StaffTrashService],
})
export class TrashModule {}
