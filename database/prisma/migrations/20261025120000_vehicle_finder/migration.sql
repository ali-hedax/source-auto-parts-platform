-- Vehicle finder (additive only): make and groups of a vehicle, model years with their calendar,
-- provenance of the reviewed vehicle dataset and reviewed equivalences to older vehicle rows.
-- Existing ids, slugs, names and product links are not changed.
ALTER TABLE "vehicle"
  ADD COLUMN "make_fa" VARCHAR(80),
  ADD COLUMN "make_en" VARCHAR(80),
  ADD COLUMN "finder_visible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "data_key" VARCHAR(120),
  ADD COLUMN "data_status" VARCHAR(20);
CREATE UNIQUE INDEX "vehicle_data_key_key" ON "vehicle"("data_key");

CREATE TABLE "vehicle_finder_group" (
  "vehicle_id" UUID NOT NULL,
  "vehicle_brand_id" UUID NOT NULL,
  CONSTRAINT "vehicle_finder_group_pkey" PRIMARY KEY ("vehicle_id", "vehicle_brand_id")
);
CREATE INDEX "vehicle_finder_group_vehicle_brand_id_idx" ON "vehicle_finder_group"("vehicle_brand_id");
ALTER TABLE "vehicle_finder_group" ADD CONSTRAINT "vehicle_finder_group_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_finder_group" ADD CONSTRAINT "vehicle_finder_group_vehicle_brand_id_fkey" FOREIGN KEY ("vehicle_brand_id") REFERENCES "vehicle_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_model"
  ADD COLUMN "year_from" INTEGER,
  ADD COLUMN "year_to" INTEGER,
  ADD COLUMN "year_calendar" VARCHAR(10),
  ADD COLUMN "supply" VARCHAR(12),
  ADD COLUMN "supplier_fa" VARCHAR(80),
  ADD COLUMN "supplier_en" VARCHAR(80),
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "data_key" VARCHAR(160),
  ADD COLUMN "data_status" VARCHAR(20);
CREATE UNIQUE INDEX "vehicle_model_data_key_key" ON "vehicle_model"("data_key");
ALTER TABLE "vehicle_model" ADD CONSTRAINT "vehicle_model_year_calendar_check" CHECK ("year_calendar" IS NULL OR "year_calendar" IN ('jalali', 'gregorian'));
ALTER TABLE "vehicle_model" ADD CONSTRAINT "vehicle_model_years_check" CHECK (("year_from" IS NULL AND "year_to" IS NULL) OR ("year_from" IS NOT NULL AND "year_to" IS NOT NULL AND "year_from" <= "year_to" AND "year_calendar" IS NOT NULL));
ALTER TABLE "vehicle_model" ADD CONSTRAINT "vehicle_model_supply_check" CHECK ("supply" IS NULL OR "supply" IN ('domestic', 'assembled', 'imported'));

CREATE TABLE "vehicle_source" (
  "id" UUID NOT NULL,
  "vehicle_id" UUID,
  "model_id" UUID,
  "source_key" VARCHAR(220) NOT NULL,
  "url" VARCHAR(600) NOT NULL,
  "title" VARCHAR(240),
  "market" VARCHAR(20) NOT NULL,
  "checked_on" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "claim" VARCHAR(300),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_source_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicle_source_target_check" CHECK ("vehicle_id" IS NOT NULL OR "model_id" IS NOT NULL),
  CONSTRAINT "vehicle_source_status_check" CHECK ("status" IN ('official', 'secondary'))
);
CREATE UNIQUE INDEX "vehicle_source_source_key_key" ON "vehicle_source"("source_key");
CREATE INDEX "vehicle_source_vehicle_id_idx" ON "vehicle_source"("vehicle_id");
CREATE INDEX "vehicle_source_model_id_idx" ON "vehicle_source"("model_id");
ALTER TABLE "vehicle_source" ADD CONSTRAINT "vehicle_source_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_source" ADD CONSTRAINT "vehicle_source_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "vehicle_equivalence" (
  "id" UUID NOT NULL,
  "data_key" VARCHAR(160) NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "model_id" UUID,
  "legacy_vehicle_id" UUID NOT NULL,
  "legacy_model_id" UUID,
  "note" VARCHAR(300),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_equivalence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicle_equivalence_data_key_key" ON "vehicle_equivalence"("data_key");
CREATE INDEX "vehicle_equivalence_vehicle_id_idx" ON "vehicle_equivalence"("vehicle_id");
CREATE INDEX "vehicle_equivalence_legacy_vehicle_id_idx" ON "vehicle_equivalence"("legacy_vehicle_id");
ALTER TABLE "vehicle_equivalence" ADD CONSTRAINT "vehicle_equivalence_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_equivalence" ADD CONSTRAINT "vehicle_equivalence_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_equivalence" ADD CONSTRAINT "vehicle_equivalence_legacy_vehicle_id_fkey" FOREIGN KEY ("legacy_vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicle_equivalence" ADD CONSTRAINT "vehicle_equivalence_legacy_model_id_fkey" FOREIGN KEY ("legacy_model_id") REFERENCES "vehicle_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
