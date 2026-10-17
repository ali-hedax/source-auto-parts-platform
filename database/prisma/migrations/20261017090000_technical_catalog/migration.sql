-- Technical parts catalog (panel → knowledge center → catalog parts; site → /catalog).
-- Additive only: two enums and five new tables; no existing table or row changes.
-- Rollback: see down.sql next to this file.
-- CreateEnum
CREATE TYPE "CatalogEntryStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CatalogNumberKind" AS ENUM ('EQUIVALENT', 'REPLACEMENT');

-- CreateTable
CREATE TABLE "catalog_entry" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "part_number" VARCHAR(80) NOT NULL,
    "part_number_key" VARCHAR(80) NOT NULL,
    "name_fa" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200),
    "manufacturer_brand_id" UUID,
    "category_id" UUID,
    "specs" JSONB NOT NULL DEFAULT '[]',
    "description_fa" TEXT,
    "description_en" TEXT,
    "source_document_id" UUID,
    "product_id" UUID,
    "status" "CatalogEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_entry_number" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "number" VARCHAR(80) NOT NULL,
    "number_key" VARCHAR(80) NOT NULL,
    "kind" "CatalogNumberKind" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalog_entry_number_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_entry_vehicle" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "model_id" UUID,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "note" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalog_entry_vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_entry_vehicle_brand" (
    "entry_id" UUID NOT NULL,
    "vehicle_brand_id" UUID NOT NULL,

    CONSTRAINT "catalog_entry_vehicle_brand_pkey" PRIMARY KEY ("entry_id","vehicle_brand_id")
);

-- CreateTable
CREATE TABLE "catalog_entry_image" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "storage_key" VARCHAR(200) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime" VARCHAR(40) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "alt_fa" VARCHAR(200) NOT NULL,
    "alt_en" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_entry_image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_entry_slug_key" ON "catalog_entry"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_entry_part_number_key_key" ON "catalog_entry"("part_number_key");

-- CreateIndex
CREATE INDEX "catalog_entry_status_published_at_idx" ON "catalog_entry"("status", "published_at");

-- CreateIndex
CREATE INDEX "catalog_entry_category_id_idx" ON "catalog_entry"("category_id");

-- CreateIndex
CREATE INDEX "catalog_entry_manufacturer_brand_id_idx" ON "catalog_entry"("manufacturer_brand_id");

-- CreateIndex
CREATE INDEX "catalog_entry_product_id_idx" ON "catalog_entry"("product_id");

-- CreateIndex
CREATE INDEX "catalog_entry_number_number_key_idx" ON "catalog_entry_number"("number_key");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_entry_number_entry_id_number_key_key" ON "catalog_entry_number"("entry_id", "number_key");

-- CreateIndex
CREATE INDEX "catalog_entry_vehicle_entry_id_idx" ON "catalog_entry_vehicle"("entry_id");

-- CreateIndex
CREATE INDEX "catalog_entry_vehicle_vehicle_id_idx" ON "catalog_entry_vehicle"("vehicle_id");

-- CreateIndex
CREATE INDEX "catalog_entry_vehicle_model_id_idx" ON "catalog_entry_vehicle"("model_id");

-- CreateIndex
CREATE INDEX "catalog_entry_vehicle_brand_vehicle_brand_id_idx" ON "catalog_entry_vehicle_brand"("vehicle_brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_entry_image_storage_key_key" ON "catalog_entry_image"("storage_key");

-- CreateIndex
CREATE INDEX "catalog_entry_image_entry_id_sort_order_idx" ON "catalog_entry_image"("entry_id", "sort_order");

-- AddForeignKey
ALTER TABLE "catalog_entry" ADD CONSTRAINT "catalog_entry_manufacturer_brand_id_fkey" FOREIGN KEY ("manufacturer_brand_id") REFERENCES "manufacturer_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry" ADD CONSTRAINT "catalog_entry_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry" ADD CONSTRAINT "catalog_entry_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "catalog_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry" ADD CONSTRAINT "catalog_entry_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry_number" ADD CONSTRAINT "catalog_entry_number_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "catalog_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry_vehicle" ADD CONSTRAINT "catalog_entry_vehicle_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "catalog_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry_vehicle" ADD CONSTRAINT "catalog_entry_vehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry_vehicle" ADD CONSTRAINT "catalog_entry_vehicle_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry_vehicle_brand" ADD CONSTRAINT "catalog_entry_vehicle_brand_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "catalog_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry_vehicle_brand" ADD CONSTRAINT "catalog_entry_vehicle_brand_vehicle_brand_id_fkey" FOREIGN KEY ("vehicle_brand_id") REFERENCES "vehicle_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_entry_image" ADD CONSTRAINT "catalog_entry_image_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "catalog_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

