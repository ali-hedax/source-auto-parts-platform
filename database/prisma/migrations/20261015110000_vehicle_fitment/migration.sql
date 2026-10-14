-- Vehicle fitment («کاربرد در خودرو»): vehicle categories, vehicles, optional models/trims and the
-- link from products (a whole vehicle, or one of its models). Separate from the existing vehicle
-- brands («برند خودرو»), which stay unchanged. Additive only. Rollback: down.sql next to this file.

-- CreateTable
CREATE TABLE "vehicle_category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80),
    "slug" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80),
    "name_key" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seo_title" VARCHAR(120),
    "seo_description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_model" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80),
    "name_key" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_vehicle" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "model_id" UUID,

    CONSTRAINT "product_vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_category_slug_key" ON "vehicle_category"("slug");
CREATE UNIQUE INDEX "vehicle_name_key_key" ON "vehicle"("name_key");
CREATE UNIQUE INDEX "vehicle_slug_key" ON "vehicle"("slug");
CREATE INDEX "vehicle_category_id_idx" ON "vehicle"("category_id");
CREATE UNIQUE INDEX "vehicle_model_vehicle_id_name_key_key" ON "vehicle_model"("vehicle_id", "name_key");
CREATE UNIQUE INDEX "vehicle_model_vehicle_id_slug_key" ON "vehicle_model"("vehicle_id", "slug");
CREATE INDEX "product_vehicle_product_id_idx" ON "product_vehicle"("product_id");
CREATE INDEX "product_vehicle_vehicle_id_idx" ON "product_vehicle"("vehicle_id");
CREATE INDEX "product_vehicle_model_id_idx" ON "product_vehicle"("model_id");
-- One link per product and whole vehicle, one per product and model (NULL model = the whole vehicle).
CREATE UNIQUE INDEX "product_vehicle_whole_key" ON "product_vehicle"("product_id", "vehicle_id") WHERE "model_id" IS NULL;
CREATE UNIQUE INDEX "product_vehicle_model_key" ON "product_vehicle"("product_id", "model_id") WHERE "model_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vehicle_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_model" ADD CONSTRAINT "vehicle_model_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_vehicle" ADD CONSTRAINT "product_vehicle_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_vehicle" ADD CONSTRAINT "product_vehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_vehicle" ADD CONSTRAINT "product_vehicle_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The starting vehicles (no category: the owner sorts them into categories in the panel).
-- name_key = the name without spaces/half-spaces/dashes, lower case (same as the app's vehicleKey).
INSERT INTO "vehicle" ("id", "name", "name_en", "name_key", "slug", "sort_order", "updated_at") VALUES
  (uuidv7(), 'سوزوکی', 'Suzuki', 'سوزوکی', 'suzuki', 1, CURRENT_TIMESTAMP),
  (uuidv7(), 'سمند', 'Samand', 'سمند', 'samand', 2, CURRENT_TIMESTAMP),
  (uuidv7(), 'رنو', 'Renault', 'رنو', 'renault', 3, CURRENT_TIMESTAMP),
  (uuidv7(), 'رانا', 'Rana', 'رانا', 'rana', 4, CURRENT_TIMESTAMP),
  (uuidv7(), 'دنا', 'Dena', 'دنا', 'dena', 5, CURRENT_TIMESTAMP),
  (uuidv7(), 'دنا پلاس', 'Dena Plus', 'دناپلاس', 'dena-plus', 6, CURRENT_TIMESTAMP),
  (uuidv7(), 'هایما', 'Haima', 'هایما', 'haima', 7, CURRENT_TIMESTAMP),
  (uuidv7(), 'پژو', 'Peugeot', 'پژو', 'peugeot', 8, CURRENT_TIMESTAMP),
  (uuidv7(), 'پیکان وانت', 'Paykan Pickup', 'پیکانوانت', 'paykan-pickup', 9, CURRENT_TIMESTAMP),
  (uuidv7(), 'آردی', 'RD', 'اردی', 'rd', 10, CURRENT_TIMESTAMP),
  (uuidv7(), 'دانگ‌فنگ', 'Dongfeng', 'دانگفنگ', 'dongfeng', 11, CURRENT_TIMESTAMP),
  (uuidv7(), 'آریسان', 'Arisan', 'اریسان', 'arisan', 12, CURRENT_TIMESTAMP),
  (uuidv7(), 'تارا', 'Tara', 'تارا', 'tara', 13, CURRENT_TIMESTAMP),
  (uuidv7(), 'ری‌را', 'Rira', 'ریرا', 'rira', 14, CURRENT_TIMESTAMP),
  (uuidv7(), 'خودروهای برقی', 'Electric vehicles', 'خودروهایبرقی', 'electric-vehicles', 15, CURRENT_TIMESTAMP),
  (uuidv7(), 'سفیر', 'Safir', 'سفیر', 'safir', 16, CURRENT_TIMESTAMP);

-- Owners and managers manage the vehicle list (product editors may only add one quickly).
INSERT INTO "permission" ("key", "description") VALUES ('vehicles.manage', 'Manage vehicles, vehicle categories and models (fitment)') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permission" ("role_id", "permission_key")
SELECT "id", 'vehicles.manage' FROM "role" WHERE "key" IN ('owner', 'manager')
ON CONFLICT DO NOTHING;
