-- Rollback of 20261015110000_vehicle_fitment (run by hand with psql, then deploy the previous release).
-- Removes the fitment links, models, vehicles and categories added by this release (the previous
-- release does not read them) and the vehicles.manage permission. Product rows are not touched.
-- Take an encrypted backup first if fitment data entered since the release should be kept.
BEGIN;
DELETE FROM "role_permission" WHERE "permission_key" = 'vehicles.manage';
DELETE FROM "permission" WHERE "key" = 'vehicles.manage';
DROP TABLE "product_vehicle";
DROP TABLE "vehicle_model";
DROP TABLE "vehicle";
DROP TABLE "vehicle_category";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261015110000_vehicle_fitment';
COMMIT;
