import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, type Tx } from '../../common/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

const DAY_MS = 86_400_000;

/** Deletes one trashed item for good when its time in the trash is over (no person acting). */
export type TrashPurger = (entityId: string) => Promise<unknown>;

export interface TrashEntryInput {
  /** What is in the trash, e.g. "staff" (later also "product"). */
  kind: string;
  entityId: string;
  /** The name shown in the trash and typed again to delete for good. */
  label: string;
  /** What restoring needs to put back (e.g. the status before the trash). */
  restoreState?: Record<string, unknown>;
  trashedById: string | null;
}

/**
 * The trash: one table for every kind of item. Each kind keeps its own rules (who may restore,
 * what "delete for good" means) and registers a purger for the daily job, which deletes items
 * older than site settings → trash retention days. The retention is read when the job runs, so
 * changing it in the panel applies to items already in the trash.
 */
@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);
  private readonly purgers = new Map<string, TrashPurger>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  register(kind: string, purger: TrashPurger): void {
    this.purgers.set(kind, purger);
  }

  async retentionDays(tx?: Tx): Promise<number> {
    return (await this.settings.site(tx)).trashRetentionDays;
  }

  /** When an item trashed at `trashedAt` is deleted by the daily job, and whole days left until then. */
  schedule(trashedAt: Date, retentionDays: number, now = new Date()): { purgeAt: Date; daysLeft: number } {
    const purgeAt = new Date(trashedAt.getTime() + retentionDays * DAY_MS);
    return { purgeAt, daysLeft: Math.max(0, Math.ceil((purgeAt.getTime() - now.getTime()) / DAY_MS)) };
  }

  async put(tx: Tx, input: TrashEntryInput) {
    return tx.trashEntry.create({
      data: { kind: input.kind, entityId: input.entityId, label: input.label.slice(0, 200), restoreState: (input.restoreState ?? {}) as object, trashedById: input.trashedById },
    });
  }

  async find(kind: string, entityId: string, tx?: Tx) {
    return (tx ?? this.prisma).trashEntry.findUnique({ where: { kind_entityId: { kind, entityId } } });
  }

  async remove(tx: Tx, kind: string, entityId: string): Promise<void> {
    await tx.trashEntry.deleteMany({ where: { kind, entityId } });
  }

  async list(kind: string) {
    return this.prisma.trashEntry.findMany({ where: { kind }, orderBy: { trashedAt: 'desc' } });
  }

  async count(kind: string): Promise<number> {
    return this.prisma.trashEntry.count({ where: { kind } });
  }

  /** The daily job: deletes for good every item whose retention period is over. One failure does not stop the rest. */
  async purgeExpired(now = new Date()): Promise<{ purged: number; failed: number }> {
    const days = await this.retentionDays();
    const due = await this.prisma.trashEntry.findMany({ where: { trashedAt: { lte: new Date(now.getTime() - days * DAY_MS) } }, orderBy: { trashedAt: 'asc' }, take: 500 });
    let purged = 0;
    let failed = 0;
    for (const entry of due) {
      const purger = this.purgers.get(entry.kind);
      if (!purger) {
        this.logger.warn(`trash: no purger for kind ${entry.kind}`);
        failed += 1;
        continue;
      }
      try {
        await purger(entry.entityId);
        purged += 1;
      } catch (e) {
        failed += 1;
        this.logger.warn(`trash: purging ${entry.kind} ${entry.id} failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }
    return { purged, failed };
  }
}
