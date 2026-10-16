import { Module } from '@nestjs/common';
import { KnowledgeCatalogController } from './knowledge-catalog.controller.js';
import { KnowledgeCatalogService } from './knowledge-catalog.service.js';

@Module({ controllers: [KnowledgeCatalogController], providers: [KnowledgeCatalogService] })
export class KnowledgeCatalogModule {}
