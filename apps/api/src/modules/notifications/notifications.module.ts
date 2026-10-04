import { Controller, Get, Module, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { smsProviderFactory } from '../../integrations/sms/sms.provider.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.notifications.list(actor);
  }

  @Post(':id/read')
  async read(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (id !== 'all' && !/^[0-9a-f-]{36}$/.test(id)) return { ok: false };
    await this.notifications.markRead(actor, id === 'all' ? 'all' : id);
    return { ok: true };
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, smsProviderFactory],
  exports: [NotificationsService],
})
export class NotificationsModule {}
