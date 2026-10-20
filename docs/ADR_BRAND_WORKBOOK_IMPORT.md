# ADR — extend the existing brand import for mixed workbooks

Date: 2026-10-19. Status: implemented locally, pending acceptance and release
review. Related: [audit](SOURCE_UPGRADE_AUDIT.md),
[sample and limits](IMPORT_WORKBOOKS.md).

## Context

The existing CSV/XLSX import and Product model already support the technical
catalog. The real supplier sample also contains legacy XLS, preamble rows,
headerless sheets and different layouts in the same archive. Treating the first
row as a shared header or converting all sheets to one schema loses meaning.

## Decision

Keep the existing import/preview/outbox/undo workflow and Product relationships.
Extend `options.sources` with an optional per-source enabled flag, selected header
row and mapping. Extend outline JSON with sampled rows and header-review metadata.
The shared mapping remains a fallback for older imports/clients. No Prisma schema
migration is introduced by this working-tree change. This does not mean an older
deployed database can skip migrations already present in the base branch.

Keep the current streaming CSV and ExcelJS-based XLSX readers. Use the pinned
official SheetJS CE 0.20.3 tarball for genuine legacy XLS, with its integrity in
`pnpm-lock.yaml`. The dependency is in the API package; parsing runs in a worker
thread with bounded batches, V8 heap limits and response timeout. Fixed worker
code does not interpolate spreadsheet contents. Workbook names are not disk
paths. Do not execute formulas, macros or supplier-provided programs.

SheetJS is installed from its official distribution rather than assuming the
registry package is current. The chosen parse options retain numeric formats and
cached cell values. References reviewed during implementation:
[official installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/),
[parse options](https://docs.sheetjs.com/docs/api/parse-options/),
[worksheet structure](https://docs.sheetjs.com/docs/csf/sheet/).
This is a pinned implementation decision, not a claim that the version is always
the newest or has no vulnerabilities. Future updates require dependency review
and the affected reader tests.

Keep commercial price/stock updates out of this technical importer. Require human
source/header review and one manufacturer per job. Do not infer authoritative
fitment from a filename or supplier prose.

Safe undo uses additive `rollbackVersion` metadata in existing change snapshots.
Old snapshots without a checkpoint are preserved conservatively. This undo
checkpoint is distinct from the import-resume cursor added for audit IMP-07.
The latter stores a versioned prefix hash and saved-error count in
`stats.runCheckpoint`, atomically with `processedRows`, cumulative counters,
errors and product/change records. Competing deliveries compare the cursor under
the import-row lock. Recovery reconstructs duplicate detection from the original
committed prefix without revisiting mutable products. Older RUNNING imports
without a valid cursor require review; their data/reports are retained.

## Alternatives and consequences

- Rebuilding the catalog or adding a parallel import model would duplicate
  working Product, preview and audit behavior; extend the current path instead.
- Silent conversion of legacy XLS or requiring a uniform first-row header would
  shift data-loss risk to staff and would not fit the supplied sample.
- Parsing every format on the job event loop would make legacy parsing stalls
  affect other work. The worker isolates that parsing, but it is not a security
  sandbox or an absolute process-memory limit.
- Per-source JSON is additive, but older workers do not understand new source
  choices or atomic recovery metadata. Mixed-version workers and rollback require
  draining jobs and checking persisted options/checkpoints; database shape alone
  does not guarantee compatibility. Do not run old workers against new active jobs.
- The pinned tarball adds an external installation source. Reproducible CI still
  depends on access to that source or an approved package cache.

No global architecture replacement, table deletion, production migration or
licensed provider integration is approved by this ADR.
