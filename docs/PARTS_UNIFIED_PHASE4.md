# Phase 4 — one «قطعه»

Phase 3 had two kinds of part: the shop product and the technical catalog entry (`CatalogEntry`, with its own panel tab and `/catalog` pages). Phase 4 merges them into one: a **part** is a `Product`. Price and stock are optional.

- A part with a price and stock can be bought.
- A part without a price is shown as «قابل تأمین» (can be sourced). Its button «درخواست تأمین» opens the sourcing request with the name and technical number filled in.
- Only published parts are shown on the site.

Staff guide (Persian): [STAFF_GUIDE_PARTS.md](STAFF_GUIDE_PARTS.md).

## Data model

Both migrations are additive. Nothing is dropped. The old `catalog_entry*` tables stay as they are, read only, and are dropped in the **next** release after the check below passes on production.

### `20261018090000_unified_parts`

**`product`**

- `part_number`: the main technical number, as written.
- `part_number_key`: the normalized key from `partNumberKey()`. Spaces, dashes, dots and slashes are removed, letters are upper-cased, and Persian/Arabic digits become Latin.
- `source_brand_import_id`: the brand import that created the part, if any.
- **Uniqueness:** a number is unique per maker (`manufacturer_brand_id`). Two partial unique indexes enforce this: `product_part_number_brand_uq` for parts with a maker and `product_part_number_nobrand_uq` for parts without one. Trigram index on the key.
- **Backfill:** a part with exactly one technical code (`oem_codes`) gets it as its main number when that causes no collision.

**`product_number`**

- The other numbers of a part: `EQUIVALENT` (the same part from other makers) and `REPLACEMENT` (the number that replaced it).
- `number_key` is normalized the same way. Indexed, plus a trigram index.

**`product_vehicle`**

- New columns `year_from`, `year_to`, `note`.

**Brand import tables**

- `brand_import_profile`: the saved column mapping and options per maker + data source.
- `brand_import`: one import. File, status, mapping, options, preview, stats, progress, who and when.
- `brand_import_change`: one row per part the import created or updated. For an update it keeps a snapshot of the part before the change, which undo restores.
- `brand_import_error`: the error report. At most 50,000 rows per import.

**`catalog_entry_migration`**

- Maps each old catalog entry to its part, plus the old slug (used for the 301).

**Delete trigger**

- `hedax_forbid_product_delete` now allows a delete only inside a transaction that sets `SET LOCAL hedax.allow_product_delete = 'on'`, and only when the part was never ordered.
- Only brand-import undo sets this flag. Every other delete is still refused.

`down.sql` restores the old trigger and drops only what this migration added.

### `20261018090100_catalog_entries_to_parts`

Moves each catalog entry into a part:

- **Linked entries.** An entry linked to a product, or with the same number and maker as one, is merged into that part. The part's price, stock and photos are kept. The entry adds its numbers, fitment (with years), vehicle brands and photos.
- **Other entries.** Each one becomes a new part:
  - SKU built from the number;
  - no price; unit «عدد»;
  - `AFTERMARKET` / `NEW` / `UNKNOWN`;
  - same published state;
  - parts without a group go to the new group «سایر قطعات» (`OTHER`).
- Every entry gets a `catalog_entry_migration` row.

**After deploy, run the check:**

```
docker compose run --rm api node dist/cli/verify-catalog-migration.js
```

The script:

- compares every entry with its part: number, other numbers, fitment, vehicle brands, photos, published state and Persian name;
- rebuilds the search text of migrated parts;
- prints JSON counts, then `RESULT: OK` (exit code 0) or the list of differences (exit code 1).

## Site

- **One search**, in the header. It finds:
  - name, SKU, main number, equivalent and replacement numbers;
  - numbers written with spaces, dashes or Persian digits.
- **Result order:**
  1. exact number;
  2. buyable now;
  3. similarity.

  Parts without a price come last, labelled «قابل تأمین».
- **Filters:**
  - only in stock;
  - vehicle brand;
  - vehicle and model;
  - group;
  - **maker** (new, `?maker=`).

  The filter panel no longer has its own search box. The current words are shown above the results with a button to clear them.
- **Home page:**
  - The hero search box and the catalog block are removed.
  - New section «مرور بر اساس برند سازنده» (`GET /catalog/manufacturers`).
- **Menu:** «کاتالوگ فنی» is removed.
- **Old addresses** answer with **301**:
  - `/{lang}/catalog?q=…` goes to `/{lang}/parts?q=…` (filters kept).
  - `/{lang}/catalog/{slug}` goes to the part, or to `/parts?q=` when the slug is unknown.
- **Part page:**
  - technical number, equivalents and replacements;
  - specs table;
  - fitment table (vehicle, model, years, note);
  - buy, or «درخواست تأمین».
  - JSON-LD `Product` with `mpn` and `brand`. `offers` appears only with a real price.
  - The title includes the number and the maker.
- **Sitemaps:**
  - `/sitemap.xml` holds the fixed pages, vehicles and owner pages.
  - Parts are in paged files `/parts-sitemap/sitemap/{n}.xml`, 40,000 per file.
  - `robots.txt` lists all of them.

## Panel

**Menu:** «قطعات», «ورود Excel», «ورود دیتابیس برند», «مرکز دانش (فایل‌های مرجع)».

**«قطعات»:**

- The list shows the technical number, maker, price (or «بدون قیمت») and photo count.
- One full form with:
  - main number, equivalents, replacements;
  - specs editor;
  - fitment with years and a note per vehicle;
  - optional price and SKU (the SKU is built from the number when empty);
  - photos chosen before the first save (uploaded right after it);
  - «ذخیره و انتشار».
- A duplicate number returns `409 PART_NUMBER_EXISTS` with the existing part. The form links to it.
- «بارگذاری گروهی عکس» (`/admin/product-photos`) is the one bulk-photo path. A file name may be the SKU, the technical number or an equivalent.

**«ورود Excel»:**

- New columns: `equivalent_numbers`, `replacement_numbers`, `specs` (`label: value; …`), fitment with years.
- Price is optional.
- The preview offers «به‌روز شوند / رد شوند» for parts that already exist (`skipExisting`).

**«ورود دیتابیس برند»:** described below.

**«مرکز دانش (فایل‌های مرجع)»:**

- An archive of reference files: PDF, Excel, CSV and photos of catalog pages (JPG/PNG/WebP).
- «تبدیل به قطعه» opens the part form filled from an Excel/CSV row (`GET /admin/knowledge-catalog/:id/candidates/:ordinal/draft`).
- The «قطعات کاتالوگ» tab is removed.

## Brand database import

`/api/v1/admin/brand-imports` (`imports.run`; changes also need `products.write`):

| Route | Purpose |
|---|---|
| `POST /upload` | multipart `file`, `manufacturerBrandId`, `source`. Up to 150 MB. The file is streamed to a temporary file, never held in memory. It is checked by ClamAV (streamed) and stored privately. Returns `{ id }`. |
| `GET /`, `GET /:id` | History; one import with outline, mapping, preview, stats and progress. |
| `PUT /:id/mapping` | `{ mapping, options }`. The mapping is saved for the maker + source, then the preview is queued. |
| `POST /:id/start` | Queues the import (only from `PREVIEW_READY`). |
| `POST /:id/rollback` | «برگرداندن این ورود». Only the latest finished import of a maker. |
| `GET /:id/errors.csv` | Error report (UTF-8 with BOM). |

**Files and columns**

- **File types:** xlsx (read as a stream with the ExcelJS `WorkbookReader`), csv, or a zip of csv files. The zip reader has its own guard against zip bombs.
- **Encoding:** csv may be UTF-8 or Windows-1256 (detected, or chosen by the user). With Windows-1256, Arabic ي/ك become Persian ی/ک.
- **Column mapping:** suggested from the header names (`suggestBrandMapping`). Equivalents, replacements, fitment and specs may each use several columns; fitment columns are combined.

**Worker steps** (outbox → BullMQ)

1. `brand-import.inspect`: reads headers, samples and the row count; reuses the saved mapping.
2. `brand-import.preview`: counts new / update / duplicate / error, with sample rows.
3. `brand-import.run`: works in batches of 500 and updates progress.
4. `brand-import.rollback`: undo.

**Update rules**

- **Key:** normalized number + maker, so a second import updates instead of duplicating.
- **New parts:** no price. Published or draft, as the user chose.
- **Existing parts:**
  - A part with a price, or one that a person created, only gets **empty** technical fields filled.
  - A part that the import created and that has no price yet may be updated in full.
  - Price, stock and manual photos are never changed.
- **Vehicles** missing from the panel are not created. They are counted and listed in the error report.

**Undo**

- Deletes the parts the import created.
- A part that was ordered, priced or photographed in the meantime is archived instead of deleted.
- Restores every updated part from its snapshot.

**Infrastructure**

- Caddy allows a 160 MB body on `/api/v1/admin/brand-imports/upload` only. Every other API route keeps 60 MB.
- The ClamAV service rewrites `StreamMaxLength 160M`, `MaxFileSize 160M` and `MaxScanSize 400M` at start, so a 150 MB stream is scanned instead of cut off.

## Search speed (300,000 parts)

`apps/api/test/integration/99-search-benchmark.test.ts`, run on demand with `HEDAX_BENCH=1`:

- It adds 300,000 published parts in SQL, each with a main number and an equivalent.
- It times the public API: 15 requests per case (5 for the sitemap).
- Setup: developer laptop (Windows 10), embedded PostgreSQL 18, no tuning.

| Case | p50 | p95 |
|---|---|---|
| list, no search (page 1) | 212 ms | 457 ms |
| two words | 32 ms | 69 ms |
| exact number | 18 ms | 27 ms |
| number with spaces | 15 ms | 26 ms |
| number in Persian digits | 16 ms | 19 ms |
| equivalent number | 16 ms | 17 ms |
| partial number | 44 ms | 62 ms |
| typo, no exact match (capped) | 1,523 ms | 1,546 ms |
| group + only in stock | 35 ms | 204 ms |
| part page | 11 ms | 39 ms |
| sitemap page (40,000 parts) | 250 ms | 355 ms |

**What made it fast:**

1. **Number lookup first.** Exact number matches are looked up first, through the key indexes. The result goes into the main query as `p.id = ANY(…)`, so the search condition is a plain OR of indexed terms and Postgres combines the trigram indexes. The earlier sub-select made it read every row (3–9 s).
2. **Typo search only as a fallback.** The trigram "near miss" (`%`) runs only when the exact words find nothing, on page 1. It returns one page, does no count, and is capped at 1.5 s (`SET LOCAL statement_timeout`). On a timeout the empty-result page offers a sourcing request.

## Tests

**Domain unit tests**

- `part-numbers.test.ts`: number normalization, number lists, specs, fitment with years.
- `brand-import.test.ts`: mapping suggestion and reuse, Windows-1256, delimiter detection, streaming CSV parser.

**API integration** (`91-unified-parts.test.ts`)

- A part without a price, and number uniqueness per maker.
- One search over name, SKU and every number in any writing, plus the maker filter.
- In-stock parts first.
- Excel import with the new columns and `skipExisting`.
- Catalog entry migration, with the 301 lookup and the verify script.
- Brand import from Windows-1256 csv and from zip; re-import updates; undo.
- File-format refusal.

**E2E** (`e2e/unified-parts.spec.ts`)

- The customer path from search to cart, and from search (an equivalent number with a space) to a sourcing request with the number filled in.
- Result order and the maker filter.
- The 301 redirects.
- The panel menu, the part form, the brand import screens and the knowledge center.

**Sample files**

- `docs/import/brand-database-sample.csv`: a brand database sample, including one error row and one duplicate row.
- `apps/web/src/lib/fixtures/brand-imports.ts`: preview data for the panel.
