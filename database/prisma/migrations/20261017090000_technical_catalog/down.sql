-- Manual rollback of 20261017090000_technical_catalog (run only with the previous application version).
-- Removes the technical catalog tables and their enums. Catalog entries, their numbers, fitments and
-- photo records are deleted with them (no other table is touched); take a backup first if they matter.
-- Photo files stay in the public media store under catalog/ and can be removed separately.
DROP TABLE IF EXISTS "catalog_entry_image";
DROP TABLE IF EXISTS "catalog_entry_vehicle_brand";
DROP TABLE IF EXISTS "catalog_entry_vehicle";
DROP TABLE IF EXISTS "catalog_entry_number";
DROP TABLE IF EXISTS "catalog_entry";
DROP TYPE IF EXISTS "CatalogNumberKind";
DROP TYPE IF EXISTS "CatalogEntryStatus";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261017090000_technical_catalog';
