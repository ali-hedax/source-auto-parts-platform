-- Excel import: an inspection step (sheets and first rows, so the person chooses the sheet, header row,
-- columns and price unit) and the values the preview shows for every row. Additive: no existing data changes.
ALTER TYPE "ImportJobStatus" ADD VALUE IF NOT EXISTS 'INSPECTING' BEFORE 'QUEUED';
ALTER TYPE "ImportJobStatus" ADD VALUE IF NOT EXISTS 'AWAITING_MAPPING' BEFORE 'QUEUED';

ALTER TABLE "import_job" ADD COLUMN "outline" JSONB;

ALTER TABLE "import_row" ADD COLUMN "display" JSONB;
