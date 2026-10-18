-- Manual rollback of 20261018090000_unified_parts (run only with the previous application version,
-- after 20261018090100_catalog_entries_to_parts was rolled back). Parts created by brand imports are
-- kept as ordinary parts (their link to the import is dropped with the column).
CREATE OR REPLACE FUNCTION hedax_forbid_product_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'products are archived, not deleted (product %)', OLD.id USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
DROP TABLE IF EXISTS "catalog_entry_migration";
DROP TABLE IF EXISTS "brand_import_error";
DROP TABLE IF EXISTS "brand_import_change";
ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "product_source_brand_import_id_fkey";
DROP TABLE IF EXISTS "brand_import";
DROP TABLE IF EXISTS "brand_import_profile";
DROP TABLE IF EXISTS "product_number";
ALTER TABLE "product_vehicle" DROP COLUMN IF EXISTS "year_from", DROP COLUMN IF EXISTS "year_to", DROP COLUMN IF EXISTS "note";
ALTER TABLE "product" DROP COLUMN IF EXISTS "part_number", DROP COLUMN IF EXISTS "part_number_key", DROP COLUMN IF EXISTS "source_brand_import_id";
DROP TYPE IF EXISTS "BrandImportChangeAction";
DROP TYPE IF EXISTS "BrandImportStatus";
DROP TYPE IF EXISTS "ProductNumberKind";
-- PostgreSQL cannot drop the enum value AttachmentPurpose 'BRAND_IMPORT'; the previous version ignores it.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261018090000_unified_parts';
