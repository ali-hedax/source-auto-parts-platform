import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { inventoryAdjustSchema, paginationQuerySchema } from '@hedax/contracts';
import { quantityToSteps, stepsToQuantity } from '@hedax/domain';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
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
      include: { product: { select: { id: true, sku: true, salesUnit: true, translations: { where: { locale: 'fa' }, select: { name: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    const mapped = rows
      .map((b) => ({
        productId: b.productId,
        sku: b.product.sku,
        nameFa: b.product.translations[0]?.name ?? '',
        // In the product's unit (stored as steps of it).
        unit: { name: b.product.salesUnit.name, allowDecimal: b.product.salesUnit.allowDecimal, step: b.product.salesUnit.stepMilli / 1000 },
        onHand: stepsToQuantity(b.onHand, b.product.salesUnit),
        reserved: stepsToQuantity(b.reserved, b.product.salesUnit),
        available: stepsToQuantity(b.onHand - b.reserved, b.product.salesUnit),
        lowStockThreshold: stepsToQuantity(b.lowStockThreshold, b.product.salesUnit),
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
    const [rows, product] = await Promise.all([
      this.prisma.inventoryMovement.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.product.findUnique({ where: { id: productId }, select: { salesUnit: true } }),
    ]);
    const u = product?.salesUnit ?? { stepMilli: 1000 };
    return rows.map((m) => ({
      id: m.id,
      type: m.type,
      onHandDelta: stepsToQuantity(m.onHandDelta, u),
      reservedDelta: stepsToQuantity(m.reservedDelta, u),
      onHandAfter: stepsToQuantity(m.onHandAfter, u),
      reservedAfter: stepsToQuantity(m.reservedAfter, u),
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
      // The count comes in the product's unit (12.5 litres) and is stored as steps of it.
      const product = await tx.product.findUnique({ where: { id: body.productId }, select: { salesUnit: true } });
      if (!product) throw notFound();
      const unit = product.salesUnit;
      const result = await this.inventory.setOnHand(tx, {
        productId: body.productId,
        newOnHand: quantityToSteps(body.newOnHand, unit, { allowZero: true }),
        expectedVersion: body.expectedVersion,
        type: body.reason === 'RECEIVED' ? 'RECEIPT' : body.reason === 'RETURN_RESTOCK' ? 'RETURN_RESTOCK' : 'ADJUSTMENT',
        reason: body.reason,
        note: body.note ?? null,
        ...(body.warehouseId ? { warehouseId: body.warehouseId } : {}),
      });
      const view = {
        onHand: stepsToQuantity(result.onHand, unit), reserved: stepsToQuantity(result.reserved, unit), available: stepsToQuantity(result.available, unit),
        version: result.version, lowStockThreshold: stepsToQuantity(result.lowStockThreshold, unit), unit: unit.name,
      };
      await this.audit.record(tx, { action: 'inventory.adjusted', entityType: 'product', entityId: body.productId, after: { ...view, reason: body.reason } });
      return view;
    });
  }
}
