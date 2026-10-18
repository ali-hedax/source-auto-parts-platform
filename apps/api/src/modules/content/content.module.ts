import { Module } from '@nestjs/common';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';
import { BuilderService } from './builder.service.js';
import { BuilderController } from './builder.controller.js';

@Module({
  controllers: [ContentController, BuilderController],
  providers: [ContentService, BuilderService],
  exports: [ContentService],
})
export class ContentModule {}
