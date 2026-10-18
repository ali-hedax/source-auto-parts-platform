-- Unified parts (phase 4): one concept «قطعه» = product. Additive only.
--   product: main technical number (+ normalized key, unique per manufacturer brand), the brand import
--            that created it; product_number: equivalent / replacement numbers; product_vehicle: years;
--   brand database import: profiles (saved mapping per brand), imports, per-part changes (rollback), errors;
--   catalog_entry_migration: technical catalog entry → part (and the 301 /catalog/[slug] redirects).
-- Rollback: see down.sql next to this file.
-- CreateEnum
CREATE TYPE "ProductNumberKind" AS ENUM ('EQUIVALENT', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "BrandImportStatus" AS ENUM ('INSPECTING', 'AWAITING_MAPPING', 'PREVIEWING', 'PREVIEW_READY', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLING_BACK', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "BrandImportChangeAction" AS ENUM ('CREATED', 'UPDATED');

-- AlterEnum
ALTER TYPE "AttachmentPurpose" ADD VALUE 'BRAND_IMPORT';

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "part_number" VARCHAR(80),
ADD COLUMN     "part_number_key" VARCHAR(80),
ADD COLUMN     "source_brand_import_id" UUID;

-- AlterTable
ALTER TABLE "product_vehicle" ADD COLUMN     "note" VARCHAR(200),
ADD COLUMN     "year_from" INTEGER,
ADD COLUMN     "year_to" INTEGER;

-- CreateTable
CREATE TABLE "product_number" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "number" VARCHAR(80) NOT NULL,
    "number_key" VARCHAR(80) NOT NULL,
    "kind" "ProductNumberKind" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_number_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_import_profile" (
    "id" UUID NOT NULL,
    "manufacturer_brand_id" UUID NOT NULL,
    "source" VARCHAR(120) NOT NULL,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "options" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brand_import_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_import" (
    "id" UUID NOT NULL,
    "manufacturer_brand_id" UUID NOT NULL,
    "source" VARCHAR(120) NOT NULL,
    "attachment_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "status" "BrandImportStatus" NOT NULL DEFAULT 'INSPECTING',
    "outline" JSONB,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "options" JSONB NOT NULL DEFAULT '{}',
    "preview" JSONB,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "total_rows" INTEGER,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "rolled_back_at" TIMESTAMPTZ(3),
    "rolled_back_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brand_import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_import_change" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "action" "BrandImportChangeAction" NOT NULL,
    "before" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_import_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_import_error" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "row_ref" VARCHAR(200) NOT NULL,
    "part_number" VARCHAR(120),
    "codes" TEXT[],
    "detail" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_import_error_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_entry_migration" (
    "entry_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "legacy_slug" VARCHAR(120) NOT NULL,
    "merged" BOOLEAN NOT NULL,
    "migrated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_entry_migration_pkey" PRIMARY KEY ("entry_id")
);

-- CreateIndex
CREATE INDEX "product_number_number_key_idx" ON "product_number"("number_key");

-- CreateIndex
CREATE UNIQUE INDEX "product_number_product_id_number_key_key" ON "product_number"("product_id", "number_key");

-- CreateIndex
CREATE UNIQUE INDEX "brand_import_profile_manufacturer_brand_id_source_key" ON "brand_import_profile"("manufacturer_brand_id", "source");

-- CreateIndex
CREATE INDEX "brand_import_manufacturer_brand_id_created_at_idx" ON "brand_import"("manufacturer_brand_id", "created_at");

-- CreateIndex
CREATE INDEX "brand_import_status_idx" ON "brand_import"("status");

-- CreateIndex
CREATE INDEX "brand_import_change_product_id_idx" ON "brand_import_change"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "brand_import_change_import_id_product_id_key" ON "brand_import_change"("import_id", "product_id");

-- CreateIndex
CREATE INDEX "brand_import_error_import_id_idx" ON "brand_import_error"("import_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_entry_migration_legacy_slug_key" ON "catalog_entry_migration"("legacy_slug");

-- CreateIndex
CREATE INDEX "catalog_entry_migration_product_id_idx" ON "catalog_entry_migration"("product_id");

-- CreateIndex
CREATE INDEX "product_part_number_key_idx" ON "product"("part_number_key");

-- CreateIndex
CREATE INDEX "product_manufacturer_brand_id_idx" ON "product"("manufacturer_brand_id");

-- CreateIndex
CREATE INDEX "product_source_brand_import_id_idx" ON "product"("source_brand_import_id");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_source_brand_import_id_fkey" FOREIGN KEY ("source_brand_import_id") REFERENCES "brand_import"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_number" ADD CONSTRAINT "product_number_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_import_profile" ADD CONSTRAINT "brand_import_profile_manufacturer_brand_id_fkey" FOREIGN KEY ("manufacturer_brand_id") REFERENCES "manufacturer_brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_import" ADD CONSTRAINT "brand_import_manufacturer_brand_id_fkey" FOREIGN KEY ("manufacturer_brand_id") REFERENCES "manufacturer_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_import_change" ADD CONSTRAINT "brand_import_change_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "brand_import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_import_change" ADD CONSTRAINT "brand_import_change_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_import_error" ADD CONSTRAINT "brand_import_error_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "brand_import"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One part per technical number and manufacturer brand (and one per number among parts without a brand).
CREATE UNIQUE INDEX "product_part_number_brand_uq" ON "product"("part_number_key", "manufacturer_brand_id")
  WHERE "part_number_key" IS NOT NULL AND "manufacturer_brand_id" IS NOT NULL;
CREATE UNIQUE INDEX "product_part_number_nobrand_uq" ON "product"("part_number_key")
  WHERE "part_number_key" IS NOT NULL AND "manufacturer_brand_id" IS NULL;
-- Partial-number search («0450102» finds 0450102805) on the main number and the other numbers.
CREATE INDEX "product_part_number_key_trgm_idx" ON "product" USING GIN ("part_number_key" gin_trgm_ops);
CREATE INDEX "product_number_number_key_trgm_idx" ON "product_number" USING GIN ("number_key" gin_trgm_ops);

-- Existing parts with exactly one technical number get it as their main number (the key follows
-- partNumberKey for Latin codes; the migration check re-normalizes every key with the application's
-- function). Numbers shared by two parts of the same manufacturer stay unassigned.
WITH one AS (
  SELECT "id", "manufacturer_brand_id", "oem_codes"[1] AS "code",
         upper(regexp_replace(translate("oem_codes"[1], '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^[:alnum:]]', '', 'g')) AS "k"
  FROM "product" WHERE cardinality("oem_codes") = 1 AND "part_number_key" IS NULL
), ok AS (
  SELECT o.* FROM one o
  WHERE length(o."k") BETWEEN 1 AND 80 AND length(o."code") <= 80
    AND (SELECT count(*) FROM one x WHERE x."k" = o."k" AND x."manufacturer_brand_id" IS NOT DISTINCT FROM o."manufacturer_brand_id") = 1
)
UPDATE "product" p SET "part_number" = ok."code", "part_number_key" = ok."k" FROM ok WHERE p."id" = ok."id";

-- Undoing a brand database import deletes the parts that import created. Products stay protected:
-- a delete passes only when the transaction explicitly allows it (SET LOCAL hedax.allow_product_delete
-- = 'on', used by that undo) and the part was never ordered. Everything else is still refused.
CREATE OR REPLACE FUNCTION hedax_forbid_product_delete() RETURNS trigger AS $$
BEGIN
  IF current_setting('hedax.allow_product_delete', true) = 'on'
     AND NOT EXISTS (SELECT 1 FROM "order_item" oi WHERE oi."product_id" = OLD."id") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'products are archived, not deleted (product %)', OLD.id USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
