-- Sales units (panel → units): «عدد», «دست», «لیتر» and whatever the owner adds later.
-- Quantities keep their integer columns: a product's stored quantities count steps of its unit
-- (for every whole-number unit with step 1, the stored number is the quantity itself, so the data
-- already in stock, carts and orders keeps its meaning). Additive only; nothing is dropped and the
-- free-text product.unit column stays (kept equal to the unit's name). Rollback: down.sql.

-- CreateTable
CREATE TABLE "unit" (
    "id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "name_en" VARCHAR(30),
    "allow_decimal" BOOLEAN NOT NULL DEFAULT false,
    "step_milli" INTEGER NOT NULL DEFAULT 1000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "unit_step_check" CHECK ("step_milli" BETWEEN 1 AND 1000000 AND ("allow_decimal" OR "step_milli" % 1000 = 0))
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_name_key" ON "unit"("name");

-- The starting units.
INSERT INTO "unit" ("id", "name", "name_en", "allow_decimal", "step_milli", "sort_order", "updated_at") VALUES
  (uuidv7(), 'عدد', 'pc', false, 1000, 1, CURRENT_TIMESTAMP),
  (uuidv7(), 'دست', 'set', false, 1000, 2, CURRENT_TIMESTAMP),
  (uuidv7(), 'لیتر', 'L', true, 500, 3, CURRENT_TIMESTAMP);

-- Any other unit name already typed on a product becomes a whole-number unit of its own, so no
-- product loses what it showed (live data: every product is «عدد»).
INSERT INTO "unit" ("id", "name", "allow_decimal", "step_milli", "sort_order", "updated_at")
SELECT uuidv7(), d."unit", false, 1000, 100, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT btrim("unit") AS "unit" FROM "product" WHERE btrim("unit") <> '') d
WHERE NOT EXISTS (SELECT 1 FROM "unit" u WHERE u."name" = d."unit");

-- AlterTable: every product gets its unit (empty text → «عدد»).
ALTER TABLE "product" ADD COLUMN "unit_id" UUID;
UPDATE "product" p SET "unit_id" = u."id", "unit" = u."name"
FROM "unit" u WHERE u."name" = COALESCE(NULLIF(btrim(p."unit"), ''), 'عدد');
ALTER TABLE "product" ALTER COLUMN "unit_id" SET NOT NULL;
CREATE INDEX "product_unit_id_idx" ON "product"("unit_id");
ALTER TABLE "product" ADD CONSTRAINT "product_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: an order line keeps the unit it was sold in (name and step), whatever happens to the unit later.
ALTER TABLE "order_item" ADD COLUMN "unit_name" VARCHAR(30) NOT NULL DEFAULT 'عدد';
ALTER TABLE "order_item" ADD COLUMN "unit_step_milli" INTEGER NOT NULL DEFAULT 1000;
UPDATE "order_item" oi SET "unit_name" = p."unit" FROM "product" p WHERE p."id" = oi."product_id";

-- The line total is the price per unit × the amount in the unit (steps × step), rounded half up to
-- the rial. For whole-number units (step 1000) this is exactly the previous rule price × quantity.
ALTER TABLE "order_item" DROP CONSTRAINT "order_item_line_total";
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_line_total"
  CHECK ("line_total_minor"::numeric = floor(("unit_price_minor"::numeric * "quantity" * "unit_step_milli" + 500) / 1000));
