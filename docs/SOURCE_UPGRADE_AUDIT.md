# Source upgrade audit — local checkpoint, 2026-10-19

This report describes the inspected feature branch, not the deployed website.
Code base: `d205e373478b628f377feb4915dd19477d0f4eae`. Implementation checkpoint:
`8c1869de1d41313f0d1fb0a3a7b6ba0f2e62eb00` on
`refactor/source-enterprise-upgrade`; documents are recorded separately.
No deployment or production data change has been performed in this work.
See [PROGRESS.md](../PROGRESS.md) for current commit/PR/CI status, the handoff and
changed-file inventory.

## Scope and existing architecture

The repository already has a Next.js web app, NestJS API, background worker,
shared domain/contracts, Prisma/PostgreSQL, Redis/BullMQ and private storage.
Technical parts already use `Product`; prices and inventory remain separate.
Catalog migration mappings, sourcing, knowledge files and CMS
draft/publish/rollback already exist. This change extends those paths.

The reviewed scope is brand import, archive/workbook readers, safe undo, part
number handling, vehicle filtering and the affected admin workflow. This is not
a completed audit of every subsystem, a penetration test, or verification of
the production environment. Historical deployment and benchmark documents are
not fresh evidence for this branch.

## Findings and disposition

| ID | Finding / outcome | Evidence and status |
| --- | --- | --- |
| IMP-01 | Undo could overwrite later work or repeatedly encounter preserved changes. Version checkpoints, conservative preservation and consumption of processed undo records now protect that path. | **Completed & Tested locally:** integration `93-brand-import-integrity`, six cases. Covers priced parts, later staff edits, relation-only updates and legacy snapshots. |
| IMP-02 | Concurrent imports for a maker and failed runs needed explicit state handling. Start/undo are serialized for the maker; caught partial failures remain FAILED and auditable. | **Completed & Tested locally:** suite 93. This does not establish crash-resume safety; see IMP-07. |
| IMP-03 | Supplier ZIP contained XLS/XLSX while the original ZIP reader accepted CSV only. | **Completed & Tested locally** for reader/API coverage and the two affected fixture browser tests, including mobile mapping. Full sample was read without a database import. Remaining coverage limits are listed below. |
| IMP-04 | Explicit Excel zero padding was lost; archive metadata/decompression and temporary upload cleanup needed bounds. | **Completed & Tested locally** for the targeted regression cases in `brand-archive`, `spreadsheet-reader`, `brand-upload-cleanup`; no claim of exhaustive hostile-file coverage. |
| IMP-05 | Untrusted CSV report values could be interpreted as spreadsheet formulas. | **Completed & Tested locally:** suite 93 checks neutralization. |
| CAT-01 | Invalid/inactive or unscoped vehicle models could return unrelated catalog results. | **Completed & Tested locally:** `85-vehicles` in the 24-test integration run. |
| TEST-01 | Windows test teardown failed after all assertions passed. | **Completed & Tested locally:** temporary directory ownership, async removal/retry and path checks were corrected; the same three suites then exited 0. The original OS lock cause was not proved. |
| IMP-07 | Interrupted import replay could lose counters/reports or revisit a product after its number changed. | **Completed & Tested locally:** atomic row checkpoint and guarded delivery implemented; seven recovery tests pass within the 25-test related integration run. Fault injection is described below. |
| VERIFY-01 | Final local checks and remote delivery evidence must be kept distinct. | Browser, typecheck, lint and full workspace build passed after execution resumed. Consult PROGRESS for the inspected remote CI commit/result. Preview remains unverified. |

Severity below is a local engineering assessment of the inspected paths, not an
assertion that the deployed site experienced these failures. Fixes and executed
acceptance evidence are in the disposition table above.

| ID | Severity / impact | Root cause | Regression risk and acceptance focus |
| --- | --- | --- | --- |
| IMP-01 | High: later catalog edits could be lost during Undo. | Snapshots lacked a safe product-version guard; preserved records could repeat. | Version increments and relation restoration: preserve later edits and commercial use, restore only matching versions, finish repeated Undo safely. |
| IMP-02 | High: overlapping maker jobs or partial success could mislead staff. | State transitions were not sufficiently serialized or failure-aware. | Maker-level scheduling and audit: reject overlapping jobs; partial failure must remain FAILED and recoverable by Undo. |
| IMP-03 | Medium: supplied XLS/workbook archive was unusable or misinterpreted. | CSV-only ZIP dispatch and first-row/shared-layout assumptions. | Reader/layout changes: mixed files, leading zeroes, explicit headers/no-header, excluded sources, no commercial price/stock writes. |
| IMP-04 | High for untrusted-file resource exposure; medium for number corruption. | Unbounded/insufficiently checked archive metadata and lost numeric formats. | Reject forged directory/decompression and path traversal; preserve explicit padding; resource-limit cleanup remains a coverage gap. |
| IMP-05 | Medium: exported untrusted cells could become spreadsheet formulas. | CSV quoting alone does not neutralize formula-leading characters. | Prefix dangerous values while preserving valid report CSV; tested formula payloads must remain text. |
| CAT-01 | Medium: model filters could show unrelated parts. | Invalid/inactive and unscoped model selections were not constrained correctly. | Keep valid combinations working while invalid combinations return no unrelated results. |
| TEST-01 | Medium: Windows teardown failure obscured assertion success. | Competing cleanup ownership, no retry, swallowed shutdown failure. | Disposable path ownership, explicit stop failure and exit status; a green assertion count cannot hide failed teardown. |
| IMP-07 | High: interrupted/competing runs could corrupt counts, reports or duplicate technical parts after edits. | Product commits and job progress/errors were separate; retries replayed from zero. | Atomic checkpoint, stale delivery rejection, preserved errors/edits and conservative legacy recovery; seven integration cases pass. |

## IMP-07: interrupted import / duplicate delivery

The earlier control flow in
[brand-imports.service.ts](../apps/api/src/modules/brand-imports/brand-imports.service.ts)
reset counters and deleted errors on every delivery, while committing products
before progress. Static review identified lost counts/reports and a risk of
recreating an old number after a staff edit. The fix now:

- Commits products, undo records, bounded error rows, cumulative counters and
  `processedRows` together. Batches include at most 500 eligible input records,
  counting invalid/duplicate records as well as valid parts.
- Stores a versioned prefix hash and saved-error count in
  `stats.runCheckpoint`. This is additive JSON, with no schema migration. Undo
  version checkpoints remain separate metadata with a separate purpose.
- On recovery, re-reads the committed input prefix to reconstruct duplicate
  detection and verify the prefix hash; it never looks up or writes those parts
  again. This is a sequential re-read, not a seek/performance optimization.
- Locks and compares the stored cursor/hash before each batch and completion.
  A stale delivery writes nothing and throws for outbox retry; it cannot fail
  the winning import or acknowledge its still-active work as completed.
- Persists caught failure status/audit only against the same durable checkpoint.
  An uncertain commit is left recoverable and retried instead of replacing its
  committed counters with stale in-memory values.
- Holds old RUNNING or inconsistent checkpoint records as FAILED with
  `IMPORT_RECOVERY_REVIEW_REQUIRED`, retaining data, counters, report and Undo
  eligibility. Only an old QUEUED job with zero progress, no checkpoint, changes
  or errors can be initialized automatically.

`95-brand-import-recovery.test.ts` verifies seven cases: resume vs uninterrupted
counts/reports with invalid/duplicate rows across a boundary; later part-number
edit plus safe Undo; a deterministic competing delivery; full transaction
rollback when checkpoint persistence fails; old RUNNING and untouched QUEUED
handling; and altered/shortened committed source prefixes. The first scenario
also checks change records, audit uniqueness and terminal redelivery.

The interruption test commits the real PostgreSQL transaction, then injects a
lost worker/DB connection before the caller acknowledges it. The tests do not
kill an OS process or establish host power-loss durability. The transaction
failure test injects an error at checkpoint save and verifies that preceding
product/error/change writes roll back. The seven tests and related suites
91/93/94 passed together: 25 tests, exit 0, 125.29 seconds.

## Verification evidence and limits

| Stage | Actual result |
| --- | --- |
| Baseline | 217 unit tests; full API integration 134 passed, one optional benchmark skipped; exit 0. |
| Initial integrity fixes | 222 unit tests; lint, typecheck and shared/API build passed; nine fixture browser tests passed. These precede the workbook changes. |
| Windows harness correction | Suites 85/91/93: 24 tests passed, exit 0, 61.58 s. Earlier run had 24 passing assertions but exit 1 at teardown. |
| Workbook changes | Eight targeted domain tests and nine API reader tests passed. Suites 91/93/94: 18 tests passed, exit 0, 79.75 s. API/shared build and full workspace typecheck passed. |
| Initial execution blocker | Approval review failed first on usage limit (2026-10-18), then capacity (2026-10-19); neither command ran then. The owner subsequently resumed work and the same approval path accepted local execution. No bypass attempted. |
| Recovery regression | Suites 91/93/94/95: 25 tests, exit 0, 125.29 s. Includes all seven new recovery cases. API build and full workspace typecheck passed. |
| Latest browser | Two affected import tests passed, exit 0, 1.3 minutes; a new fixture server was required (`CI=true`). The 390-pixel mobile screenshot was visually inspected; no horizontal overflow. |
| Latest lint | First run failed on three console statements in two Git-ignored `.local-run` diagnostic scripts. ESLint now excludes that existing private runtime directory; rerun passed, exit 0. No production source rule was relaxed. |
| Full workspace build | `pnpm build` passed, exit 0: contracts/domain, API, Next production build (167 static pages generated), worker. This only builds locally; it does not deploy. |
| Supplier archive | Read-only parser check: 44 files, 54 sheets, 16,204 nonempty rows, 39 sheets requiring header review. No database import. |
| Remote checks | [Draft PR #28](https://github.com/ali-hedax/source-auto-parts-platform/pull/28) is open and unmerged. [PR checks](https://github.com/ali-hedax/source-auto-parts-platform/pull/28/checks) run against the feature head; PROGRESS records the inspected run/commit and actual outcome. No isolated preview deployment. |

API tests use disposable PostgreSQL and synthetic data. Fixture browser tests do
not exercise the real backend. The local backup test does not establish that the
owner's current production backups can be restored. The sample totals count raw
nonempty rows, including headings/preambles, not accepted parts or unique numbers.

Additional acceptance gaps: backward compatibility of old multi-source mapping
screens and resource-limit termination/cleanup under hostile XLS input. They
remain unverified; they are not reported as observed defects. No before/after
performance benchmark exists for these changes.

## Delivery conditions

Complete the remaining acceptance checks before calling this change release-ready.
IMP-07 is resolved for the tested local scenarios. Confirm isolated preview database/storage/queues and simulator
providers before writing preview data. Keep licensed VIN/Microcat integration
and any real paid/messaging provider blocked until authorized access is known.
Production deployment, migrations, data imports and release-triggering merges
require the owner's explicit approval.

Next documents: [workbook/sample review](IMPORT_WORKBOOKS.md),
[architecture decision](ADR_BRAND_WORKBOOK_IMPORT.md),
[verification and rollback runbook](SOURCE_UPGRADE_RUNBOOK.md).
