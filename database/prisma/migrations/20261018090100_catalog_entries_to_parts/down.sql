-- Manual rollback of 20261018090100_catalog_entries_to_parts (run only with the previous application
-- version). The catalog_entry* tables were never changed, so the technical catalog is intact.
-- Parts made from entries (merged = false) are removed with their numbers, fitment, brands and photo
-- records, unless they were sold or edited into real stock meanwhile (those stay as ordinary parts).
-- What was added to merged parts (numbers, fitment, brands, photos, empty fields filled) stays.
BEGIN;
-- Parts made from entries may be deleted here (see hedax_forbid_product_delete).
SET LOCAL hedax.allow_product_delete = 'on';
DELETE FROM "product_number" WHERE "product_id" IN (SELECT "product_id" FROM "catalog_entry_migration" WHERE NOT "merged");
DELETE FROM "product_vehicle" WHERE "product_id" IN (SELECT "product_id" FROM "catalog_entry_migration" WHERE NOT "merged");
DELETE FROM "product_vehicle_brand" WHERE "product_id" IN (SELECT "product_id" FROM "catalog_entry_migration" WHERE NOT "merged");
DELETE FROM "product_media" WHERE "product_id" IN (SELECT "product_id" FROM "catalog_entry_migration" WHERE NOT "merged")
  AND "storage_key" IN (SELECT "storage_key" FROM "catalog_entry_image");
DELETE FROM "product_translation" t USING "catalog_entry_migration" m
  WHERE t."product_id" = m."product_id" AND NOT m."merged"
    AND NOT EXISTS (SELECT 1 FROM "order_item" oi WHERE oi."product_id" = m."product_id")
    AND NOT EXISTS (SELECT 1 FROM "product_price" pp WHERE pp."product_id" = m."product_id");
DELETE FROM "product" p USING "catalog_entry_migration" m
  WHERE p."id" = m."product_id" AND NOT m."merged"
    AND NOT EXISTS (SELECT 1 FROM "order_item" oi WHERE oi."product_id" = p."id")
    AND NOT EXISTS (SELECT 1 FROM "product_price" pp WHERE pp."product_id" = p."id")
    AND NOT EXISTS (SELECT 1 FROM "inventory_balance" ib WHERE ib."product_id" = p."id");
DELETE FROM "catalog_entry_migration";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261018090100_catalog_entries_to_parts';
COMMIT;
