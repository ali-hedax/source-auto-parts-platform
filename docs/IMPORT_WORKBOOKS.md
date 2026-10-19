# Brand workbook import and sample review

Local implementation checkpoint: 2026-10-19. Parser/API and affected fixture UI
verification are recorded in [SOURCE_UPGRADE_AUDIT.md](SOURCE_UPGRADE_AUDIT.md).
The mobile mapping view was inspected after the two affected browser tests passed.
Release readiness remains pending. This document does not authorize an import.

## Actual supplier sample

The owner-supplied `Hyundai-Kia-Parts-List-sff8fl.zip` was read from the supplied
Desktop path. Its contents are private task data and are not committed.

| Measurement | Observed value |
| --- | --- |
| Compressed archive | 4,539,262 bytes |
| Sum of archived file sizes | 27,294,365 bytes |
| Workbooks | 44: 25 XLS and 19 XLSX |
| Nonempty sheets / raw nonempty rows | 54 / 16,204 |
| Header classification | 39 need manual review; 15 met automatic selection criteria |
| Database writes | None |

The run took 21.947 seconds and reported approximately 204 MiB peak RSS locally.
This is one parser observation, not an import throughput measurement, total
deployment memory budget, or before/after benchmark. The earlier XLSX-only check
read 21 sheets and 9,694 rows; the full archive result supersedes that partial
coverage. Private diagnostics are retained only under ignored
`.local-run/supplier-analysis`; do not copy their row contents into repository docs.

The archive has title/preamble rows, inconsistent Persian column names,
repeated headings, duplicate column titles and headerless tables. Historical
prices/request quantities and different manufacturers are present. The archive
name alone does not establish the manufacturer or authoritative vehicle fitment
of every row. All included sources need human review, including automatically
recognized headers.

## Implemented workflow

1. Choose one part manufacturer and data-source label for the import.
2. Upload XLSX, genuine OLE/BIFF XLS, CSV, or a ZIP containing those formats.
3. Review every file/sheet. Exclude sources belonging to another manufacturer;
   process them under the correct manufacturer separately. Mixed manufacturers
   inside one sheet require preparing a reviewed copy before upload.
4. Choose a header from the first 20 **nonempty** sampled rows, or select no
   header (`headerRow: 0`). Displayed line numbers are original file row numbers.
   Rows up to the selected header are skipped. For no-header sheets, columns get
   stable positional labels and the first data row is retained. A header beyond
   the sampled rows requires a prepared copy; the UI cannot select arbitrary rows.
5. Map the required part number separately for each included source. Blank and
   duplicate column names are distinguished. Inspect representative values,
   equivalents, replacement numbers and vehicle information before preview.
6. Save and review preview totals/errors. New parts default to draft. Saved
   maker/source profiles suggest mappings on later uploads; review them again
   when filenames, columns, column order or sheet structure change.

The API rejects unknown sources, unavailable header rows, missing mapped columns,
missing part-number mappings and a selection with no enabled source. Exact
repeated table headings are skipped; arbitrary prose, merged-cell layouts or
later changes in column layout are not automatically repaired. Old imports without
sample metadata retain their original first-row interpretation; their multi-source
UI compatibility remains an acceptance check.

## Data boundaries

- This technical import has no price or stock mapping. Supplier prices/order
  quantities must not become current commercial data. Existing manual photos
  are preserved.
- Text part numbers retain leading zeroes. Numeric cells with an explicit simple
  zero-padding format are padded accordingly. Missing zeroes or digits already
  rounded away in the source cannot be recovered by guessing; correct a copy
  against the authoritative source.
- Formula results are read from cached values when present; formulas and macros
  are not executed. An absent cache is not calculated by this importer.
- Vehicle text is matched against existing active vehicles/models. Unknown
  matches are reported, not created. A text match is not licensed VIN/OEM fitment
  verification.
- Unpriced parts originally created by imports may have technical fields
  refreshed by a subsequent import. Manually created or priced parts only have
  empty technical fields filled. Safe Undo preserves later versioned edits;
  it is not a guarantee that every change will be reversed.
- Interrupted new imports resume from an atomic committed-input checkpoint,
  preserving counters and error reports. Older running imports without that
  metadata stop for review; do not delete their data or reports to force a retry.

## Reader limits and source identity

| Boundary | Current implementation |
| --- | --- |
| Upload | 150 MiB maximum; each legacy XLS limited to 32 MiB |
| Source count / row width | At most 500 nonempty sources per import / 200 columns |
| ZIP directory | At most 500 entries, 16 MiB central directory; bounds checked before allocation |
| Outer ZIP | Selected entries total at most 3 GiB; declared expansion ratio at most 200 per selected entry |
| XLSX internals | At most 3 GiB declared expanded entries; shared strings/styles/workbook metadata entries at most 64 MiB each |
| Archived workbook | XLSX up to 150 MiB; XLS up to 32 MiB; spooled one at a time |
| Legacy XLS | At most 100 sheets, 2,000,000 populated cells, 32 Mi characters of cell text, 32,768 characters per cell |
| XLS worker | V8 old/young heap limits 256/32 MiB; 60-second reader-response timeout, paused while the caller consumes a batch; one 100-row batch in flight |

Heap limits are not a whole-process memory cap, and the response timeout is not
a total job deadline. Outer ZIP and XLSX limits apply at their respective layers;
they do not establish a single cumulative CPU/memory limit for every workbook in
an archive. Resource-exhaustion acceptance coverage remains incomplete.

ZIP paths are never used as extraction destinations. Traversal names, symlinks,
encrypted entries and duplicate names are rejected; actual decompressed length
must match metadata. Hidden/macOS entries are skipped. Nested ZIP and `.xlsm` /
`.xlsb` entries are unsupported. Other non-spreadsheet files are ignored.
An `.xls` extension with text/HTML content is rejected as a workbook.

Source identity includes the archive path and sheet. Invalid UTF-8 archive names
receive a stable hash alias from the original name bytes rather than a guessed
Persian decoding. Long source labels are truncated with a hash suffix to fit row
references. Review ambiguous aliases using the original local archive; do not
infer a manufacturer from an alias. CSV supports UTF-8 and Windows-1256; that
selection does not repair ZIP filenames or Excel data automatically.
