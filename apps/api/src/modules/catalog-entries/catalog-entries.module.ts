import { Module } from '@nestjs/common';
import { CatalogEntriesAdminController, CatalogEntriesPublicController } from './catalog-entries.controller.js';
import { CatalogEntriesService } from './catalog-entries.service.js';
import { CatalogImportService } from './catalog-import.service.js';

/** Technical parts catalog: panel editing, bulk import (worker) and the public /catalog API. */
@Module({
  controllers: [CatalogEntriesAdminController, CatalogEntriesPublicController],
  providers: [CatalogEntriesService, CatalogImportService],
  exports: [CatalogEntriesService, CatalogImportService],
})
export class CatalogEntriesModule {}
