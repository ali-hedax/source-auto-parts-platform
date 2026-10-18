import { Module } from '@nestjs/common';
import { BrandImportsController } from './brand-imports.controller.js';
import { BrandImportsService } from './brand-imports.service.js';

/** Brand database import: upload, mapping, preview, run and undo (the heavy steps run in the worker). */
@Module({ controllers: [BrandImportsController], providers: [BrandImportsService], exports: [BrandImportsService] })
export class BrandImportsModule {}
