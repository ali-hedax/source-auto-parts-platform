-- Technical catalog entries become parts (phase 4). Runs once; nothing is deleted.
--   * An entry linked to a part, or whose number + manufacturer brand already belongs to a part, is
--     merged into that part: only empty technical fields are filled (main number, specs, description);
--     numbers, fitment, vehicle brands and photos are added. Price, stock and existing photos never change.
--   * Every other entry becomes a new part without price or stock (shown with «درخواست تأمین»):
--     group «سایر قطعات» when it had none, unit «عدد», aftermarket / new / unknown origin, same status.
--   * catalog_entry_migration records entry → part and the old address for the 301 redirects.
-- The catalog_entry* tables stay (read-only) until the migration check passes; a later release drops them.
-- Search text is written in a simplified form here; `node dist/cli/verify-catalog-migration.js`
-- rebuilds it with the application's normalizer and compares the counts.

-- 0. A group for parts that have none.
INSERT INTO "category" ("id", "code", "slug", "name_fa", "name_en", "sort_order", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'OTHER', 'other-parts', 'سایر قطعات', 'Other parts', 9999, TRUE, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "category" WHERE "code" = 'OTHER')
  AND NOT EXISTS (SELECT 1 FROM "category" WHERE "slug" = 'other-parts');

-- 1. The part each entry goes to: its linked part, else a part with the same number and manufacturer.
CREATE TEMP TABLE "ce_target" AS
SELECT e."id" AS "entry_id",
       COALESCE(
         (SELECT p."id" FROM "product" p WHERE p."id" = e."product_id" AND p."archived_at" IS NULL),
         (SELECT p."id" FROM "product" p
           WHERE p."part_number_key" = e."part_number_key" AND p."archived_at" IS NULL
             AND p."manufacturer_brand_id" IS NOT DISTINCT FROM e."manufacturer_brand_id"
           ORDER BY p."created_at" LIMIT 1)
       ) AS "product_id",
       FALSE AS "created"
FROM "catalog_entry" e
WHERE NOT EXISTS (SELECT 1 FROM "catalog_entry_migration" m WHERE m."entry_id" = e."id");

-- 2. New parts for the rest. SKU from the number (Latin letters, digits and dashes; a short suffix
--    when that SKU is taken), the entry's own address when free.
CREATE TEMP TABLE "ce_new" AS
SELECT e.*, gen_random_uuid() AS "new_id",
       NULLIF(left(trim(BOTH '-' FROM upper(regexp_replace(translate(e."part_number", '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^A-Za-z0-9]+', '-', 'g'))), 58), '') AS "sku_base"
FROM "catalog_entry" e JOIN "ce_target" t ON t."entry_id" = e."id"
WHERE t."product_id" IS NULL;

ALTER TABLE "ce_new" ADD COLUMN "sku" VARCHAR(64), ADD COLUMN "new_slug" VARCHAR(120);
UPDATE "ce_new" n SET "sku" = CASE
    WHEN n."sku_base" IS NULL THEN 'CAT-' || upper(left(md5(n."id"::text), 8))
    WHEN EXISTS (SELECT 1 FROM "product" p WHERE upper(p."sku") = n."sku_base")
      OR (SELECT count(*) FROM "ce_new" x WHERE x."sku_base" = n."sku_base") > 1
      THEN n."sku_base" || '-' || upper(left(md5(n."id"::text), 4))
    ELSE n."sku_base" END,
  "new_slug" = CASE WHEN EXISTS (SELECT 1 FROM "product" p WHERE p."slug" = n."slug")
    THEN left(n."slug", 110) || '-' || left(md5(n."id"::text), 6) ELSE n."slug" END;

INSERT INTO "product" (
  "id", "sku", "slug", "category_id", "manufacturer_brand_id", "part_type", "condition", "origin",
  "unit", "unit_id", "pack_quantity", "oem_codes", "specs", "published", "published_at", "is_sellable",
  "part_number", "part_number_key", "search_text", "search_compact", "version",
  "created_by_id", "updated_by_id", "created_at", "updated_at")
SELECT n."new_id", n."sku", n."new_slug",
       COALESCE(n."category_id", (SELECT "id" FROM "category" WHERE "code" = 'OTHER' LIMIT 1), (SELECT "id" FROM "category" WHERE "slug" = 'other-parts' LIMIT 1)),
       n."manufacturer_brand_id", 'AFTERMARKET', 'NEW', 'UNKNOWN',
       u."name", u."id", 1, '{}',
       COALESCE((SELECT jsonb_agg(jsonb_build_object('key', 'spec-' || s.ord, 'labelFa', s.v->>'label', 'value', s.v->>'value') ORDER BY s.ord)
                 FROM jsonb_array_elements(n."specs") WITH ORDINALITY AS s(v, ord)), '[]'::jsonb),
       n."status" = 'PUBLISHED', n."published_at", TRUE,
       n."part_number", n."part_number_key",
       lower(concat_ws(' ', n."name_fa", n."name_en", n."part_number")),
       regexp_replace(lower(concat_ws(' ', n."name_fa", n."name_en", n."part_number")), '[^[:alnum:]]', '', 'g'),
       0, n."created_by_id", n."updated_by_id", n."created_at", now()
FROM "ce_new" n
CROSS JOIN LATERAL (SELECT "id", "name" FROM "unit" WHERE "name" = 'عدد' ORDER BY "created_at" LIMIT 1) u;

INSERT INTO "product_translation" ("product_id", "locale", "name", "description", "aliases")
SELECT n."new_id", 'fa', n."name_fa", n."description_fa", '{}' FROM "ce_new" n;
INSERT INTO "product_translation" ("product_id", "locale", "name", "description", "aliases")
SELECT n."new_id", 'en', COALESCE(n."name_en", n."name_fa"), n."description_en", '{}' FROM "ce_new" n
WHERE n."name_en" IS NOT NULL OR n."description_en" IS NOT NULL;

UPDATE "ce_target" t SET "product_id" = n."new_id", "created" = TRUE FROM "ce_new" n WHERE n."id" = t."entry_id";

-- 3. Merged parts: fill only what is empty.
UPDATE "product" p SET "part_number" = e."part_number", "part_number_key" = e."part_number_key", "updated_at" = now()
FROM "catalog_entry" e JOIN "ce_target" t ON t."entry_id" = e."id" AND NOT t."created"
WHERE p."id" = t."product_id" AND p."part_number_key" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "product" o WHERE o."id" <> p."id" AND o."part_number_key" = e."part_number_key"
                    AND o."manufacturer_brand_id" IS NOT DISTINCT FROM p."manufacturer_brand_id");
UPDATE "product" p SET "specs" = (SELECT jsonb_agg(jsonb_build_object('key', 'spec-' || s.ord, 'labelFa', s.v->>'label', 'value', s.v->>'value') ORDER BY s.ord)
                                  FROM jsonb_array_elements(e."specs") WITH ORDINALITY AS s(v, ord))
FROM "catalog_entry" e JOIN "ce_target" t ON t."entry_id" = e."id" AND NOT t."created"
WHERE p."id" = t."product_id" AND p."specs" = '[]'::jsonb AND jsonb_array_length(e."specs") > 0;
UPDATE "product_translation" pt SET "description" = e."description_fa"
FROM "catalog_entry" e JOIN "ce_target" t ON t."entry_id" = e."id" AND NOT t."created"
WHERE pt."product_id" = t."product_id" AND pt."locale" = 'fa' AND COALESCE(pt."description", '') = '' AND e."description_fa" IS NOT NULL;

-- 4. Numbers, fitment, vehicle brands and photos (for new and merged parts alike).
INSERT INTO "product_number" ("id", "product_id", "number", "number_key", "kind", "sort_order")
SELECT gen_random_uuid(), t."product_id", n."number", n."number_key", n."kind"::text::"ProductNumberKind", n."sort_order"
FROM "catalog_entry_number" n JOIN "ce_target" t ON t."entry_id" = n."entry_id"
JOIN "product" p ON p."id" = t."product_id"
WHERE p."part_number_key" IS DISTINCT FROM n."number_key"
ON CONFLICT DO NOTHING;
-- A merged entry's own number, when the part's main number is a different one.
INSERT INTO "product_number" ("id", "product_id", "number", "number_key", "kind", "sort_order")
SELECT gen_random_uuid(), t."product_id", e."part_number", e."part_number_key", 'EQUIVALENT', 1000
FROM "catalog_entry" e JOIN "ce_target" t ON t."entry_id" = e."id" AND NOT t."created"
JOIN "product" p ON p."id" = t."product_id"
WHERE p."part_number_key" IS DISTINCT FROM e."part_number_key"
ON CONFLICT DO NOTHING;

INSERT INTO "product_vehicle" ("id", "product_id", "vehicle_id", "model_id", "year_from", "year_to", "note")
SELECT gen_random_uuid(), t."product_id", v."vehicle_id", v."model_id", v."year_from", v."year_to", v."note"
FROM "catalog_entry_vehicle" v JOIN "ce_target" t ON t."entry_id" = v."entry_id"
ON CONFLICT DO NOTHING;

INSERT INTO "product_vehicle_brand" ("product_id", "vehicle_brand_id")
SELECT t."product_id", b."vehicle_brand_id"
FROM "catalog_entry_vehicle_brand" b JOIN "ce_target" t ON t."entry_id" = b."entry_id"
ON CONFLICT DO NOTHING;

INSERT INTO "product_media" ("id", "product_id", "storage_key", "width", "height", "mime", "size_bytes", "alt_fa", "alt_en", "sort_order", "is_primary", "source_attachment_id", "created_at")
SELECT gen_random_uuid(), t."product_id", i."storage_key", i."width", i."height", i."mime", i."size_bytes", i."alt_fa", i."alt_en",
       COALESCE((SELECT max(m."sort_order") + 1 FROM "product_media" m WHERE m."product_id" = t."product_id" AND m."deleted_at" IS NULL), 0) + i."sort_order",
       FALSE, NULL, i."created_at"
FROM "catalog_entry_image" i JOIN "ce_target" t ON t."entry_id" = i."entry_id"
WHERE NOT EXISTS (SELECT 1 FROM "product_media" m WHERE m."storage_key" = i."storage_key");
-- A part without a main photo gets its first one.
UPDATE "product_media" m SET "is_primary" = TRUE
WHERE m."id" IN (
  SELECT DISTINCT ON (pm."product_id") pm."id" FROM "product_media" pm
  WHERE pm."deleted_at" IS NULL AND pm."product_id" IN (SELECT "product_id" FROM "ce_target")
    AND NOT EXISTS (SELECT 1 FROM "product_media" x WHERE x."product_id" = pm."product_id" AND x."is_primary" AND x."deleted_at" IS NULL)
  ORDER BY pm."product_id", pm."sort_order", pm."created_at");

-- 5. Entry → part, and the old address.
INSERT INTO "catalog_entry_migration" ("entry_id", "product_id", "legacy_slug", "merged", "migrated_at")
SELECT e."id", t."product_id", e."slug", NOT t."created", now()
FROM "catalog_entry" e JOIN "ce_target" t ON t."entry_id" = e."id";

DROP TABLE "ce_new";
DROP TABLE "ce_target";
