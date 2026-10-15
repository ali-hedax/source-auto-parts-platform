import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { unitUpdateSchema, unitUpsertSchema } from '@hedax/contracts';
import type { z } from 'zod';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { UnitsService } from './units.service.js';

/** Panel → products → units: whoever manages products manages the units (owner, manager, catalog). */
@ApiTags('admin/units')
@Controller('admin/units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @RequirePermissions('products.read')
  @Get()
  list() {
    return this.units.list();
  }

  @RequirePermissions('products.write')
  @Post()
  @ApiZodBody(unitUpsertSchema)
  create(@Body(zod(unitUpsertSchema)) body: z.infer<typeof unitUpsertSchema>) {
    return this.units.create(body);
  }

  @RequirePermissions('products.write')
  @Patch(':id')
  @ApiZodBody(unitUpdateSchema)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(unitUpdateSchema)) body: z.infer<typeof unitUpdateSchema>) {
    return this.units.update(id, body);
  }

  @RequirePermissions('products.write')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.units.remove(id);
  }
}
