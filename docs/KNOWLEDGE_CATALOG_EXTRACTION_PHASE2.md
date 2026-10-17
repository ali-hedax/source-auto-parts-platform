# Knowledge Catalog — Phase 2A (candidate extraction)

This branch adds an **opt-in, review-only** extraction pipeline for Source by HEDAX's existing Knowledge Catalog.

## Implemented

- Admins with the existing `imports.run` permission can queue extraction of registered, malware-scanned CSV/XLSX catalogs.
- The existing PostgreSQL outbox and background worker run extraction asynchronously.
- Uses the existing spreadsheet parser (no formula evaluation or external URL fetching).
- Up to 2,000 non-empty rows from up to 10 sheets are stored as **unverified** candidate chunks with source sheet and row metadata.
- Candidate fields include part number, name and vehicle when recognizable headers exist; no fitment claim is treated as verified.
- Admin UI can show the first 100 candidate rows per catalog for human review.
- Processing failures and truncation are shown in the existing catalog status/error fields.
- Existing product, stock, pricing, vehicle fitment and order tables are **not** modified.

## Deliberately not implemented

- PDF text extraction or OCR (PDF uploads remain supported as source files).
- Automated catalog approval, product creation, merging duplicates or RAG embeddings.
- Customer-facing search of these candidate records, chatbot access or automatic learning from them. (Phase 3 adds a reviewed technical catalog: a candidate row can be turned into a catalog entry by hand — see [`KNOWLEDGE_CATALOG_PHASE3_TECHNICAL_CATALOG.md`](KNOWLEDGE_CATALOG_PHASE3_TECHNICAL_CATALOG.md).)
- Production deployment.

## Verification before merge

Run from the repository root using the project's documented pnpm setup:

1. `pnpm typecheck`
2. `pnpm --filter @hedax/api test`
3. `pnpm --filter @hedax/api build`
4. Test a small CSV with leading-zero OEM numbers, a workbook with multiple sheets, malformed input and a scanned PDF.
5. Confirm the worker is running and can access private attachment storage.
6. Verify only authorized staff can queue extraction and view candidate chunks.
7. Verify no extracted data is visible to customers.

**No new database migration is required** because phase 1 already created `catalog_document_chunk`. The phase 1 migration must be present in the target environment.

## Next phase

Phase 3 (technical parts catalog, panel and /catalog) is described in [`KNOWLEDGE_CATALOG_PHASE3_TECHNICAL_CATALOG.md`](KNOWLEDGE_CATALOG_PHASE3_TECHNICAL_CATALOG.md). Still open:

Add sandboxed PDF text extraction, selective OCR, candidate reconciliation against existing SKU/OEM/vehicle entities, explicit reviewer approval, and then hybrid RAG indexing. Keep every customer-facing fact tied to an approved source.
