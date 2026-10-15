-- Rollback of 20261015100000_product_units (run by hand with psql, then deploy the previous release).
-- product.unit (the unit's name) was kept in step all along, so dropping the link loses nothing the
-- previous release used. Stored quantities of products in decimal units (e.g. litres in steps of
-- 0.5) would be read by the previous release as whole units: check before rolling back that no
-- product uses a unit whose step is not 1:
--   SELECT p.sku, u.name, u.step_milli FROM product p JOIN unit u ON u.id = p.unit_id WHERE u.step_milli <> 1000;
BEGIN;
-- The previous rule (price × quantity) holds again only for whole-number lines; this fails when a
-- decimal line exists, which is the intended stop.
ALTER TABLE "order_item" DROP CONSTRAINT "order_item_line_total";
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_line_total" CHECK ("line_total_minor" = "unit_price_minor" * "quantity");
ALTER TABLE "order_item" DROP COLUMN "unit_step_milli";
ALTER TABLE "order_item" DROP COLUMN "unit_name";
ALTER TABLE "product" DROP CONSTRAINT "product_unit_id_fkey";
DROP INDEX "product_unit_id_idx";
ALTER TABLE "product" DROP COLUMN "unit_id";
DROP TABLE "unit";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261015100000_product_units';
COMMIT;
