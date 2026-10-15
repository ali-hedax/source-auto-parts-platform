import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MessengerBotsController } from './messenger-bots.controller.js';
import { MessengerBotsService } from './messenger-bots.service.js';

/** Opt-in bot transport. No bot is enabled unless its token and webhook secret are configured. */
@Module({
  imports: [CatalogModule],
  controllers: [MessengerBotsController],
  providers: [MessengerBotsService],
  exports: [MessengerBotsService],
})
export class MessengerBotsModule {}
