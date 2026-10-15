import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  vehicleCategorySchema, vehicleCategoryUpdateSchema, vehicleMergeSchema, vehicleModelSchema, vehicleModelUpdateSchema, vehicleQuickAddSchema,
  vehicleReorderSchema, vehicleSchema, vehicleUpdateSchema,
} from '@hedax/contracts';
import type { z } from 'zod';
import { Public, RequirePermissions } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { VehiclesService } from './vehicles.service.js';

/**
 * Panel → vehicles. Managing the list (vehicles, categories, models, order, merge, delete) needs
 * vehicles.manage (owner and manager). Product editors (products.write) can only add a missing
 * vehicle or model quickly from the product form.
 */
@ApiTags('admin/vehicles')
@Controller('admin')
export class VehiclesAdminController {
  constructor(private readonly vehicles: VehiclesService) {}

  @RequirePermissions('products.read')
  @Get('vehicles')
  list() {
    return this.vehicles.adminList();
  }

  /** For the product form picker (all vehicles and models, inactive ones marked). */
  @RequirePermissions('products.read')
  @Get('vehicles/options')
  options() {
    return this.vehicles.options();
  }

  @RequirePermissions('products.write')
  @Post('vehicles/quick')
  @ApiZodBody(vehicleQuickAddSchema)
  quickAdd(@Body(zod(vehicleQuickAddSchema)) body: z.infer<typeof vehicleQuickAddSchema>) {
    return this.vehicles.quickAdd(body.name, body.confirmNew);
  }

  @RequirePermissions('products.write')
  @Post('vehicles/:id/models/quick')
  @ApiZodBody(vehicleModelSchema)
  quickAddModel(@Param('id', ParseUUIDPipe) id: string, @Body(zod(vehicleModelSchema)) body: z.infer<typeof vehicleModelSchema>) {
    return this.vehicles.createModel(id, { name: body.name });
  }

  @RequirePermissions('vehicles.manage')
  @Post('vehicles')
  @ApiZodBody(vehicleSchema)
  create(@Body(zod(vehicleSchema)) body: z.infer<typeof vehicleSchema>) {
    return this.vehicles.createVehicle(body);
  }

  @RequirePermissions('vehicles.manage')
  @Post('vehicles/reorder')
  @HttpCode(200)
  @ApiZodBody(vehicleReorderSchema)
  reorder(@Body(zod(vehicleReorderSchema)) body: z.infer<typeof vehicleReorderSchema>) {
    return this.vehicles.reorder('vehicle', body.ids);
  }

  @RequirePermissions('vehicles.manage')
  @Patch('vehicles/:id')
  @ApiZodBody(vehicleUpdateSchema)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(vehicleUpdateSchema)) body: z.infer<typeof vehicleUpdateSchema>) {
    return this.vehicles.updateVehicle(id, body);
  }

  @RequirePermissions('vehicles.manage')
  @Delete('vehicles/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.deleteVehicle(id);
  }

  /** The vehicle in the path stays; `sourceId` (the duplicate) is merged into it and deleted. */
  @RequirePermissions('vehicles.manage')
  @Post('vehicles/:id/merge')
  @HttpCode(200)
  @ApiZodBody(vehicleMergeSchema)
  merge(@Param('id', ParseUUIDPipe) id: string, @Body(zod(vehicleMergeSchema)) body: z.infer<typeof vehicleMergeSchema>) {
    return this.vehicles.merge(id, body.sourceId);
  }

  @RequirePermissions('vehicles.manage')
  @Post('vehicles/:id/models')
  @ApiZodBody(vehicleModelSchema)
  createModel(@Param('id', ParseUUIDPipe) id: string, @Body(zod(vehicleModelSchema)) body: z.infer<typeof vehicleModelSchema>) {
    return this.vehicles.createModel(id, body);
  }

  @RequirePermissions('vehicles.manage')
  @Post('vehicles/:id/models/reorder')
  @HttpCode(200)
  @ApiZodBody(vehicleReorderSchema)
  reorderModels(@Param('id', ParseUUIDPipe) id: string, @Body(zod(vehicleReorderSchema)) body: z.infer<typeof vehicleReorderSchema>) {
    return this.vehicles.reorder('model', body.ids, id);
  }

  @RequirePermissions('vehicles.manage')
  @Patch('vehicles/:id/models/:modelId')
  @ApiZodBody(vehicleModelUpdateSchema)
  updateModel(@Param('id', ParseUUIDPipe) id: string, @Param('modelId', ParseUUIDPipe) modelId: string, @Body(zod(vehicleModelUpdateSchema)) body: z.infer<typeof vehicleModelUpdateSchema>) {
    return this.vehicles.updateModel(id, modelId, body);
  }

  @RequirePermissions('vehicles.manage')
  @Delete('vehicles/:id/models/:modelId')
  removeModel(@Param('id', ParseUUIDPipe) id: string, @Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.vehicles.deleteModel(id, modelId);
  }

  @RequirePermissions('vehicles.manage')
  @Post('vehicle-categories')
  @ApiZodBody(vehicleCategorySchema)
  createCategory(@Body(zod(vehicleCategorySchema)) body: z.infer<typeof vehicleCategorySchema>) {
    return this.vehicles.createCategory(body);
  }

  @RequirePermissions('vehicles.manage')
  @Post('vehicle-categories/reorder')
  @HttpCode(200)
  @ApiZodBody(vehicleReorderSchema)
  reorderCategories(@Body(zod(vehicleReorderSchema)) body: z.infer<typeof vehicleReorderSchema>) {
    return this.vehicles.reorder('category', body.ids);
  }

  @RequirePermissions('vehicles.manage')
  @Patch('vehicle-categories/:id')
  @ApiZodBody(vehicleCategoryUpdateSchema)
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body(zod(vehicleCategoryUpdateSchema)) body: z.infer<typeof vehicleCategoryUpdateSchema>) {
    return this.vehicles.updateCategory(id, body);
  }

  @RequirePermissions('vehicles.manage')
  @Delete('vehicle-categories/:id')
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.deleteCategory(id);
  }
}

/** Public vehicles: filters, /cars and /cars/[slug]. */
@ApiTags('catalog')
@Public()
@Controller('catalog')
export class VehiclesPublicController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('vehicles')
  list(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return this.vehicles.publicList();
  }

  @Get('vehicles/:slug')
  async detail(@Param('slug') slug: string, @Res({ passthrough: true }) res: Response) {
    const v = await this.vehicles.publicBySlug(slug.slice(0, 80));
    if (!v) throw notFound();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return v;
  }
}
