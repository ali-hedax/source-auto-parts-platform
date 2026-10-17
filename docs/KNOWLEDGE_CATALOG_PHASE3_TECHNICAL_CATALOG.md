# Knowledge Catalog — Phase 3 (technical parts catalog)

Phase 3 turns the knowledge center into a **technical parts catalog**. Each part is a catalog entry. Staff edit entries in the panel, and customers can search and read them on the site at `/catalog`.

A catalog entry is **reference data, not a shop product**. It has no price and no stock. An entry may be linked to one existing shop product, and only by hand. Nothing is turned into a product or linked to one automatically.

## Data model

Migration `20261017090000_technical_catalog` is additive only: two enums and five new tables. Its `down.sql` drops only these tables.

| Table | Contents |
|---|---|
| `catalog_entry` | `part_number` and the unique `part_number_key`; names in Persian and English; `slug`, the readable address; part brand (`manufacturer_brand`); part group (`category`); `specs` as JSON pairs `[{label, value}]`; descriptions; links to the source document and the shop product (both optional); `status` (`DRAFT` / `PUBLISHED`) and `published_at`; `search_text` (normalized names); who created and updated it, and when. |
| `catalog_entry_number` | Other numbers of the entry: `EQUIVALENT` (the same part from other makers) or `REPLACEMENT` (the number that replaces it). Each has a normalized `number_key`. |
| `catalog_entry_vehicle` | Vehicle fitment. Each row is a whole vehicle or one model (the existing `vehicle` / `vehicle_model` tables), with optional years and a note. |
| `catalog_entry_vehicle_brand` | Vehicle makers (the existing `vehicle_brand` table), used by the brand filter. |
| `catalog_entry_image` | Photos in display order; the first is the main photo. They are stored in the public media store under `catalog/<entry>/`. |

**Part-number key.** `partNumberKey()` in `@hedax/domain` builds the key as follows:
- spaces, dashes, dots and slashes are removed;
- letters are upper-cased;
- Persian and Arabic digits become Latin digits.

So `۰۴۵۰-۱۰۲ ۸۰۵`, `0450.102.805` and `0450102805` are the same number. Main numbers are unique by this key. The address slug is the number in lower-case Latin letters, for example `/fa/catalog/0450-102-805`.

**Audit log.** Every change is recorded: `catalog_entry.created`, `updated`, `status_changed`, `deleted`, `image_added`, `images_reordered`, `image_removed`, `catalog_import.started` and `committed`.

## API (`/api/v1`)

### Panel: `admin/catalog-entries`

**Permissions.** Viewing needs `imports.run` **or** `products.write`. Every change needs `products.write`. Bulk import also needs `imports.run`, which the file upload itself requires.

| Route | Purpose |
|---|---|
| `GET /` | List. Query: `q` (name or any number), `vehicleBrand`, `vehicle`, `category`, `status`, `page`. |
| `GET /:id` | One entry. |
| `POST /` | Create (the whole entry). A duplicate number returns `409 CATALOG_PART_NUMBER_EXISTS` with the existing entry's id and number. |
| `PUT /:id` | Edit (the whole entry). Same duplicate check as create. |
| `POST /:id/status` | Publish or unpublish. |
| `DELETE /:id` | Delete the entry; its photo files are removed too. |
| `POST /:id/images` | Add a photo. It goes through the same checks as product photos: real JPG/PNG/WebP, malware scan, re-encode to WebP. |
| `PUT /:id/images/order` | Reorder photos. |
| `DELETE /:id/images/:imageId` | Remove a photo. |
| `GET product-lookup?q=` | Find a shop product to link, by SKU, technical number or name. |
| `GET draft/:documentId/:ordinal` | **«تبدیل به آیتم کاتالوگ»** (turn into a catalog item): a form filled from an extracted candidate row. Only known vehicles are matched; the rest are listed. Nothing is saved. |
| `POST code-lookup` | Bulk photos: which entries the file-name codes belong to (main or other numbers). |
| `GET import/template` | Bulk import: download the sample Excel file. |
| `POST import` `{attachmentId}` | Bulk import: start with an uploaded file. |
| `GET import/:jobId?filter=` | Bulk import: read the preview. |
| `POST import/:jobId/commit` `{duplicates: update\|skip}` | Bulk import: confirm and write. |

### Site: `catalog/entries`

Only **published** entries are returned. Anonymous answers may be cached for 60 seconds.

| Route | Purpose |
|---|---|
| `GET /` | Search. Query: `q` (name words, or the main, equivalent or replacement number written any way), `brand` (vehicle brand slug), `vehicle` + `model` (slugs), `category` (slug, including its subgroups), `page`. |
| `GET /:slug` | One entry: photos, numbers, specs, fitment, description, and the linked product's page if that product is published. |
| `GET /sitemap` | Addresses for the sitemap. |

Every change calls `PublicCacheService.invalidate()`, the existing revalidate mechanism. The bulk-import worker also calls it after a commit that touched published entries.

## Bulk import (Excel / CSV)

The headers of the sample file, in Persian or English:

| Column | Notes |
|---|---|
| `شماره فنی` (Part number) | **Required.** |
| `نام فارسی` (Persian name) | **Required.** |
| `نام انگلیسی` (English name) | |
| `شماره‌های معادل` (Equivalent numbers) | Separated by `،` or `,`. |
| `شماره‌های جایگزین` (Replacement numbers) | Separated by `،` or `,`. |
| `برند قطعه` (Part brand) | Name as in the panel. |
| `گروه قطعه` (Part group) | Category code or name. |
| `برند خودرو` (Vehicle brand) | List. |
| `کاربرد در خودرو` (Fitment) | For example `پژو 405 (1390-1400)، سمند، دنا (1398)`. |
| `مشخصات فنی` (Specs) | `عنوان: مقدار؛ …` (label: value pairs). |
| `توضیحات` (Description) | |
| `وضعیت` (Status) | `پیش‌نویس` (draft, the default) or `منتشرشده` (published). |

How the import runs:
1. The file is uploaded with purpose `IMPORT`, through the existing upload, malware scan and spreadsheet reader. Formulas are never evaluated. At most 2000 rows are read.
2. The worker reads the file (outbox event `catalog-entries.import.parse`) and stores **preview rows only**:
   - valid new rows;
   - rows whose number already exists;
   - rows with errors and their reasons, including a number repeated within the file.
   Names that match nothing in the panel (part brand, part group, vehicle brand, vehicle) are **not created**. The row is imported without them, and the preview shows a warning.
3. The person chooses whether existing numbers are **updated** or **skipped**, then confirms. The worker writes the rows (outbox event `catalog-entries.import.commit`), each row in its own transaction. The number is checked again at this point.
4. When an existing entry is updated, only the columns present in the file are replaced. Photos, the product link and the source document are never changed by an import.

## Panel and site

### Panel → مرکز دانش و کاتالوگ (Knowledge center and catalog)

- **«قطعات کاتالوگ» tab (catalog parts):**
  - a list with search, filters (vehicle brand, vehicle, part group, status) and pages;
  - a create/edit form with every field: vehicles with their models and years, specs rows, multiple photos with ordering, and a product search for the shop link;
  - a clear message when the number already exists, with a button that opens the existing entry;
  - bulk import with the sample file and the preview.
- **Documents tab:** each extracted candidate row that has a part number gets a **«تبدیل به آیتم کاتالوگ»** (turn into a catalog item) button, which opens the filled form.
- **Bulk photos tab:** a destination selector chooses where the photos go: shop products, catalog parts, or both. The same file-name rules as `photo-filename` apply. The preview shows where each photo goes, and an ambiguous code is chosen by hand.

### Site

- **`/catalog`:** a search box, filters (vehicle brand, vehicle and model, part group) and result cards with photos.
- **`/catalog/[slug]`:** gallery, part number, equivalent and replacement numbers, specs table, fitment table and description.
  - If the entry is linked to a shop product: a **«مشاهده و خرید در فروشگاه»** (view and buy in the shop) button.
  - Otherwise: a **«درخواست تأمین»** (sourcing request) button. It opens `/request-part?part=<name>&code=<number>`, so the request form is filled with the part name and its technical number.
- **Home page:** the hero's «کاتالوگ قطعات» (parts catalog) card now opens `/catalog`. A **«کاتالوگ فنی قطعات»** (technical parts catalog) block with a search box and the newest parts sits right after the hero.
- **Site-wide:**
  - a header link «کاتالوگ فنی» (technical catalog);
  - sitemap entries;
  - canonical and alternate-language links;
  - titles of the form «name + number»;
  - texts in `messages/fa.json` and `messages/en.json` (`technicalCatalog.*`). Panel texts use the panel's inline `l()` convention, like the rest of the knowledge center.

**Preview without a database.** With `HEDAX_DATA_SOURCE=fixtures`, the file `apps/web/src/lib/fixtures/catalog-entries.ts` provides sample data:
- three published parts, one of them linked to a shop product;
- one draft that is never public.

## Tests

- **Unit:** `packages/domain/test/catalog-entry.test.ts`, covering part-number keys, slugs, number lists, specs, fitment with years, header mapping and row parsing.
- **Integration:** `apps/api/test/integration/89-catalog-entries.test.ts`, covering:
  - single create, and the duplicate number written differently;
  - drafts are never public;
  - search by every way of writing a number and by equivalents;
  - every filter;
  - manual product link, photos and code lookup;
  - permissions and delete;
  - the template and bulk import through the worker (preview counts, errors, warnings, skip and update, CSV, missing columns);
  - pre-filling the form from a candidate row.
- **Browser:** `apps/web/e2e/technical-catalog.spec.ts`, covering the site search, filters, details page (request and buy buttons, metadata), English/LTR, phone layout and accessibility, the home block, and the panel tab.

## Not included

- No automatic product creation or linking, no OCR or PDF text extraction, and no embeddings.
- Unknown vehicles, brands and groups are never created by an import. They are added in the panel first.
