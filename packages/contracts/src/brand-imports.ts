import { z } from 'zod';
import { idSchema } from './common.js';
import { partTypeSchema } from './catalog.js';

/**
 * Brand database import (panel → «ورود دیتابیس برند»): a manufacturer's whole parts database
 * (xlsx, csv in UTF-8 or Windows-1256, or a zip of csv files), mapped once per brand and source.
 */
export const BRAND_IMPORT_STATUSES = [
  'INSPECTING', 'AWAITING_MAPPING', 'PREVIEWING', 'PREVIEW_READY', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLING_BACK', 'ROLLED_BACK',
] as const;
export type BrandImportStatus = (typeof BRAND_IMPORT_STATUSES)[number];

/** Field → header names of the file (several for equivalents, replacements, fitment and specs). */
export const brandMappingSchema = z.record(z.string().max(40), z.array(z.string().max(200)).max(40));

export const brandImportOptionsSchema = z.object({
  /** Publish the new parts at once (shown with «درخواست تأمین», no price), or keep them as drafts. */
  publish: z.boolean().default(false),
  partType: partTypeSchema.default('GENUINE'),
  /** CSV text encoding; auto = UTF-8 when valid, else Windows-1256. */
  encoding: z.enum(['auto', 'utf-8', 'windows-1256']).default('auto'),
  /** Optional per-sheet/file choices. Omitted sources use the shared mapping for legacy clients. */
  sources: z.record(z.string().max(190), z.object({
    enabled: z.boolean(),
    /** 0 = no header. Other values must identify a row in the inspected sample. */
    headerRow: z.number().int().min(0).max(1_048_576),
    mapping: brandMappingSchema,
  })).refine(s => Object.keys(s).length <= 500).optional(),
});
export type BrandImportOptions = z.infer<typeof brandImportOptionsSchema>;

/** Sent with the file (multipart fields). */
export const brandImportUploadSchema = z.object({
  manufacturerBrandId: idSchema,
  source: z.string().trim().min(1).max(120),
});

export const brandImportMappingSchema = z.object({
  mapping: brandMappingSchema,
  options: brandImportOptionsSchema,
});

export interface BrandImportSourceOutline {
  /** Sheet name or csv file name inside the zip. */
  name: string;
  headers: string[];
  samples: string[][];
  encoding: string | null;
  delimiter: string | null;
  /** Absent on imports inspected before per-source mapping was introduced. */
  headerRow?: number;
  needsHeaderReview?: boolean;
  sampleRows?: Array<{ line: number; cells: string[] }>;
}

export interface BrandImportPreviewRow {
  rowRef: string;
  state: 'NEW' | 'UPDATE' | 'DUPLICATE' | 'ERROR';
  partNumber: string;
  nameFa: string | null;
  equivalents: string[];
  fitments: string[];
  specs: string[];
  issues: string[];
}

export interface BrandImportStats {
  rows?: number;
  new?: number;
  update?: number;
  duplicate?: number;
  error?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  /** Vehicles in the file that are not in the panel (not created; listed in the error report). */
  unknownVehicles?: number;
  /** After undo: untouched parts deleted/restored, later edits and commercial use preserved. */
  deleted?: number;
  preserved?: number;
  /** Historical imports only. New undo operations keep used parts unchanged. */
  archived?: number;
  restored?: number;
}

export interface BrandImportView {
  id: string;
  manufacturer: { id: string; nameFa: string };
  source: string;
  filename: string;
  status: BrandImportStatus;
  outline: BrandImportSourceOutline[] | null;
  mapping: Record<string, string[]>;
  options: BrandImportOptions;
  /** Headers of the saved mapping that this file does not have. */
  missingColumns: string[];
  preview: BrandImportPreviewRow[];
  stats: BrandImportStats;
  totalRows: number | null;
  processedRows: number;
  failureReason: string | null;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  rolledBackAt: string | null;
  /** Only the latest import of a brand that is not undone can be undone. */
  canRollback: boolean;
  errorCount: number;
}

export type BrandImportListItem = Pick<BrandImportView, 'id' | 'manufacturer' | 'source' | 'filename' | 'status' | 'stats' | 'totalRows' | 'processedRows' | 'createdBy' | 'createdAt' | 'finishedAt' | 'rolledBackAt' | 'canRollback' | 'errorCount'>;
