import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { inventoryAdjustSchema, paginationQuerySchema } from '@hedax/contracts';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { InventoryService } from './inventory.service.js';

const listQuery = paginationQuerySchema.extend({
  lowStock: z.enum(['1', '0']).optional(),
  q: z.string().max(80).optional(),
});

@ApiTags('admin/inventory')
@Controller('admin/inventory')
export class InventoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  /** on_hand / reserved / available per product in the default warehouse. */
  @RequirePermissions('inventory.read')
  @Get()
  async list(@Query(zod(listQuery)) q: z.infer<typeof listQuery>) {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const where = {
      warehouseId,
      product: { archivedAt: null, ...(q.q ? { OR: [{ sku: { contains: q.q, mode: 'insensitive' as const } }, { searchText: { contains: q.q.toLowerCase() } }] } : {}) },
    };
    const rows = await this.prisma.inventoryBalance.findMany({
      where,
      include: { product: { select: { id: true, sku: true, translations: { where: { locale: 'fa' }, select: { name: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    const mapped = rows
      .map((b) => ({
        productId: b.productId,
        sku: b.product.sku,
        nameFa: b.product.translations[0]?.name ?? '',
        onHand: b.onHand,
        reserved: b.reserved,
        available: b.onHand - b.reserved,
        lowStockThreshold: b.lowStockThreshold,
        isLow: b.onHand - b.reserved <= b.lowStockThreshold,
        version: b.version,
        updatedAt: b.updatedAt.toISOString(),
      }))
      .filter((r) => (q.lowStock === '1' ? r.isLow : true));
    const start = (q.page - 1) * q.pageSize;
    return { items: mapped.slice(start, start + q.pageSize), page: q.page, pageSize: q.pageSize, total: mapped.length };
  }

  @RequirePermissions('inventory.read')
  @Get(':productId/movements')
  async movements(@Param('productId', ParseUUIDPipe) productId: string) {
    const rows = await this.prisma.inventoryMovement.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map((m) => ({
      id: m.id,
      type: m.type,
      onHandDelta: m.onHandDelta,
      reservedDelta: m.reservedDelta,
      onHandAfter: m.onHandAfter,
      reservedAfter: m.reservedAfter,
      reason: m.reason,
      note: m.note,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /** Absolute physical count with optimistic lock; never below reserved. Side effects: ledger + audit. */
  @RequirePermissions('inventory.adjust')
  @Post('adjust')
  @ApiZodBody(inventoryAdjustSchema)
  async adjust(@Body(zod(inventoryAdjustSchema)) body: z.infer<typeof inventoryAdjustSchema>) {
    return this.prisma.tx(async (tx) => {
      const result = await this.inventory.setOnHand(tx, {
        productId: body.productId,
        newOnHand: body.newOnHand,
        expectedVersion: body.expectedVersion,
        type: body.reason === 'RECEIVED' ? 'RECEIPT' : body.reason === 'RETURN_RESTOCK' ? 'RETURN_RESTOCK' : 'ADJUSTMENT',
        reason: body.reason,
        note: body.note ?? null,
        ...(body.warehouseId ? { warehouseId: body.warehouseId } : {}),
      });
      await this.audit.record(tx, { action: 'inventory.adjusted', entityType: 'product', entityId: body.productId, after: { ...result, reason: body.reason } });
      return result;
    });
  }
}
