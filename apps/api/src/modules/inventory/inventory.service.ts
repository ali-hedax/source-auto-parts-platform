import { Injectable } from '@nestjs/common';
import { DomainError } from '@hedax/domain';
import type { InventoryMovementType } from '../../generated/prisma/enums.js';
import { PrismaService, type Tx } from '../../common/prisma.service.js';
import { currentActor } from '../../common/request-context.js';

export interface BalanceView {
  onHand: number;
  reserved: number;
  available: number;
  version: number;
  lowStockThreshold: number;
}

/**
 * All stock mutations go through this service (spec §6). Every change is a
 * single conditional UPDATE (atomic under row locks) plus an append-only
 * ledger movement. The DB CHECK `reserved <= on_hand` is the final backstop.
 */
@Injectable()
export class InventoryService {
  private defaultWarehouse: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async defaultWarehouseId(tx?: Tx): Promise<string> {
    if (this.defaultWarehouse) return this.defaultWarehouse;
    const db = tx ?? this.prisma;
    const wh = await db.warehouse.findFirst({ where: { isDefault: true, active: true }, select: { id: true } });
    if (!wh) throw new DomainError('NO_DEFAULT_WAREHOUSE', 'No default warehouse is configured (run the base seed)');
    this.defaultWarehouse = wh.id;
    return wh.id;
  }

  async ensureBalance(tx: Tx, productId: string, warehouseId?: string): Promise<void> {
    const wh = warehouseId ?? (await this.defaultWarehouseId(tx));
    await tx.inventoryBalance.upsert({
      where: { productId_warehouseId: { productId, warehouseId: wh } },
      create: { productId, warehouseId: wh },
      update: {},
    });
  }

  private async movement(
    tx: Tx,
    input: {
      productId: string;
      warehouseId: string;
      type: InventoryMovementType;
      onHandDelta: number;
      reservedDelta: number;
      reason: string;
      note?: string | null;
      referenceType?: string | null;
      referenceId?: string | null;
    },
  ): Promise<void> {
    const bal = await tx.inventoryBalance.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
    });
    await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        type: input.type,
        onHandDelta: input.onHandDelta,
        reservedDelta: input.reservedDelta,
        onHandAfter: bal.onHand,
        reservedAfter: bal.reserved,
        reason: input.reason,
        note: input.note ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        actorId: currentActor()?.userId ?? null,
      },
    });
  }

  /** Reserves stock for one order line. Throws INSUFFICIENT_STOCK instead of overselling (A08). */
  async reserve(
    tx: Tx,
    input: { productId: string; quantity: number; orderId: string; orderItemId: string; expiresAt: Date; warehouseId?: string },
  ): Promise<string> {
    const warehouseId = input.warehouseId ?? (await this.defaultWarehouseId(tx));
    const updated = await tx.$executeRaw`
      UPDATE "inventory_balance"
         SET "reserved" = "reserved" + ${input.quantity}, "version" = "version" + 1, "updated_at" = now()
       WHERE "product_id" = ${input.productId}::uuid
         AND "warehouse_id" = ${warehouseId}::uuid
         AND "on_hand" - "reserved" >= ${input.quantity}`;
    if (updated !== 1) throw new DomainError('INSUFFICIENT_STOCK', 'Not enough stock is available', { productId: input.productId });
    const reservation = await tx.inventoryReservation.create({
      data: {
        productId: input.productId,
        warehouseId,
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        quantity: input.quantity,
        expiresAt: input.expiresAt,
      },
    });
    await this.movement(tx, {
      productId: input.productId, warehouseId, type: 'RESERVE', onHandDelta: 0, reservedDelta: input.quantity,
      reason: 'CHECKOUT', referenceType: 'order', referenceId: input.orderId,
    });
    return reservation.id;
  }

  /** Releases an ACTIVE reservation exactly once. Returns false if it was not active. */
  async release(tx: Tx, reservationId: string, reason: 'PAYMENT_FAILED' | 'EXPIRED' | 'CANCELLED'): Promise<boolean> {
    const res = await tx.inventoryReservation.findUnique({ where: { id: reservationId } });
    if (!res) return false;
    const changed = await tx.inventoryReservation.updateMany({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: reason === 'EXPIRED' ? 'EXPIRED' : 'RELEASED', releasedAt: new Date(), releaseReason: reason },
    });
    if (changed.count !== 1) return false;
    await tx.$executeRaw`
      UPDATE "inventory_balance"
         SET "reserved" = "reserved" - ${res.quantity}, "version" = "version" + 1, "updated_at" = now()
       WHERE "product_id" = ${res.productId}::uuid AND "warehouse_id" = ${res.warehouseId}::uuid`;
    await this.movement(tx, {
      productId: res.productId, warehouseId: res.warehouseId, type: 'RELEASE', onHandDelta: 0, reservedDelta: -res.quantity,
      reason, referenceType: 'order', referenceId: res.orderId,
    });
    return true;
  }

  /** Converts an ACTIVE reservation into a sale exactly once (A09). */
  async consume(tx: Tx, reservationId: string): Promise<boolean> {
    const res = await tx.inventoryReservation.findUnique({ where: { id: reservationId } });
    if (!res) return false;
    const changed = await tx.inventoryReservation.updateMany({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: 'CONSUMED', consumedAt: new Date() },
    });
    if (changed.count !== 1) return false;
    await tx.$executeRaw`
      UPDATE "inventory_balance"
         SET "on_hand" = "on_hand" - ${res.quantity}, "reserved" = "reserved" - ${res.quantity},
             "version" = "version" + 1, "updated_at" = now()
       WHERE "product_id" = ${res.productId}::uuid AND "warehouse_id" = ${res.warehouseId}::uuid`;
    await this.movement(tx, {
      productId: res.productId, warehouseId: res.warehouseId, type: 'CONSUME', onHandDelta: -res.quantity, reservedDelta: -res.quantity,
      reason: 'PAYMENT_SUCCEEDED', referenceType: 'order', referenceId: res.orderId,
    });
    return true;
  }

  /**
   * Late verified payment after the reservation was released (A12): take the
   * stock directly if it is still available. Returns false when it is not.
   */
  async reallocate(tx: Tx, input: { productId: string; quantity: number; orderId: string; warehouseId: string }): Promise<boolean> {
    const updated = await tx.$executeRaw`
      UPDATE "inventory_balance"
         SET "on_hand" = "on_hand" - ${input.quantity}, "version" = "version" + 1, "updated_at" = now()
       WHERE "product_id" = ${input.productId}::uuid AND "warehouse_id" = ${input.warehouseId}::uuid
         AND "on_hand" - "reserved" >= ${input.quantity}`;
    if (updated !== 1) return false;
    await this.movement(tx, {
      productId: input.productId, warehouseId: input.warehouseId, type: 'REALLOCATE', onHandDelta: -input.quantity, reservedDelta: 0,
      reason: 'LATE_PAYMENT_REALLOCATED', referenceType: 'order', referenceId: input.orderId,
    });
    return true;
  }

  /**
   * Sets the absolute physical count. Refuses on version conflict or when the
   * new count would drop below what is reserved (spec §6, §12).
   */
  async setOnHand(
    tx: Tx,
    input: {
      productId: string;
      newOnHand: number;
      expectedVersion: number | null;
      type: 'ADJUSTMENT' | 'IMPORT_ADJUSTMENT' | 'RECEIPT' | 'RETURN_RESTOCK';
      reason: string;
      note?: string | null;
      referenceType?: string | null;
      referenceId?: string | null;
      warehouseId?: string;
    },
  ): Promise<BalanceView> {
    const warehouseId = input.warehouseId ?? (await this.defaultWarehouseId(tx));
    await this.ensureBalance(tx, input.productId, warehouseId);
    const [locked] = await tx.$queryRaw<Array<{ on_hand: number; reserved: number; version: number; low_stock_threshold: number }>>`
      SELECT "on_hand", "reserved", "version", "low_stock_threshold" FROM "inventory_balance"
       WHERE "product_id" = ${input.productId}::uuid AND "warehouse_id" = ${warehouseId}::uuid
       FOR UPDATE`;
    if (!locked) throw new DomainError('NOT_FOUND');
    if (input.expectedVersion !== null && locked.version !== input.expectedVersion) {
      throw new DomainError('VERSION_CONFLICT', 'Stock changed since it was loaded', { currentVersion: locked.version });
    }
    if (input.newOnHand < locked.reserved) {
      throw new DomainError('ON_HAND_BELOW_RESERVED', 'Physical count cannot be lower than reserved quantity', { reserved: locked.reserved });
    }
    const delta = input.newOnHand - locked.on_hand;
    const updated = await tx.inventoryBalance.update({
      where: { productId_warehouseId: { productId: input.productId, warehouseId } },
      data: { onHand: input.newOnHand, version: { increment: 1 } },
    });
    if (delta !== 0) {
      await this.movement(tx, {
        productId: input.productId, warehouseId, type: input.type, onHandDelta: delta, reservedDelta: 0,
        reason: input.reason, note: input.note ?? null, referenceType: input.referenceType ?? null, referenceId: input.referenceId ?? null,
      });
    }
    return {
      onHand: updated.onHand,
      reserved: updated.reserved,
      available: updated.onHand - updated.reserved,
      version: updated.version,
      lowStockThreshold: updated.lowStockThreshold,
    };
  }
}
