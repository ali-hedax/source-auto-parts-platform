# Parts and reference administration

The panel now has one **Parts & sources** sidebar entry at `/admin/catalog`.
Existing URLs remain valid. The workspace keeps Parts, spreadsheet import and
Reference catalogs visible, with stock, photos, manufacturer imports and setup
under a disclosure. Task links respect the staff member's permissions; API
permissions remain authoritative. Product readers receive a disabled part form.

## Workflows

- A single part uses the existing product editor. An empty price remains valid.
  Pack quantity and incomplete specifications are validated before submission.
  Persian and Arabic-Indic year digits work; mixed calendars are rejected.
  If product creation succeeds but photos/publication fail, the editor links to
  the saved part and prevents another creation attempt.
- Spreadsheet imports retain mapping, preview, explicit commit and stock/price
  controls. Concurrent upload starts are suppressed. Larger product lists now
  paginate instead of stopping at 100 results.
- Categories, vehicle makes and part manufacturers have a common editable list.
  Staff can deactivate/re-enable entries and delete unused entries. Products,
  children, catalog links, finder links, sourcing references and import history
  block deletion. Category edits reject cycles. Existing slugs/order are retained.
- Products are archived and restored, not hard-deleted. Restoration retains
  inventory/history and keeps publication and sales off for staff review.
- Reference catalogs support title/version edits and guarded deletion. Optimistic
  timestamps reject stale edits/deletes. Pending processing and catalog-entry
  links block deletion. Deleted sources lose extracted rows and their attachment
  is marked deleted; storage bytes and products are not erased.
- Reference lists support title/filename search and 50-item pages. Extracted rows
  load 100 at a time, including later rows. Only Excel/CSV extraction is supported.
  PDF/photo files remain references; the UI explains this. Processing status is
  set only by the queued extraction operation, not by a manual status selection.

## Vehicles and trims

Vehicle editing now controls original make, aliases, finder visibility and finder
groups using the existing database fields. A visible finder vehicle needs a group.
Existing legacy make-level records are not reclassified automatically.

Trim editing supports bilingual names, supply type/supplier, production years,
calendar and an HTTPS source link. Changed years require a source; both endpoints
and a single matching calendar are checked by the API. A staff-provided source is
recorded as secondary, not automatically verified or represented as official.
Unknown years stay blank. Production years do not assert that a part fits those
years; part fitment remains a separate product-level record.

## Assistant scope

The admin status now lists real runtime configuration gates without displaying a
credential or making a paid request. Configured, mock and verified connectivity
are distinct. The existing assistant retrieves product facts through CatalogService.
The site does not automatically sync reference documents. The gateway may attach
its own external RAG independently, so runtime status reports this as unverified
rather than disconnected. Opening settings does not verify its indexed content.
No credential, provider setting or paid service was changed by this work.

## Verification and deployment

Local: API/web type checks, targeted ESLint, contracts22 tests, assistant/catalog
unit9 tests; real disposable PostgreSQL integration89/85/92/99 passed26 tests.
After final reference guards, integration85/99 passed15 tests. Browser acceptance
passed15 cases, including existing workbook mapping, FA/EN mobile, CRUD errors,
permissions and partial photo failure. Browser scenarios use labelled development
fixtures/request stubs; durable persistence is established by API integration tests,
not by those UI stubs. The integration harness cleaned up successfully.

Local Turbopack could not resolve reused dependencies outside this checkout;
browser acceptance used webpack. No production build or full-project CI result is
claimed by these local checks. No schema migration is introduced. Deploy API/web
together after the existing titanium rollout and server/Redis recovery. No live
data import, production update or Arvan AI/RAG activation was performed.
