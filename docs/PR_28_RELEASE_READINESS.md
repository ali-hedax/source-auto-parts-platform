# PR #28 release readiness — 2026-10-19

**Production release: not ready.** The PR remains Draft and unmerged. No preview
deployment, production operation, migration or supplier database import was made.
See [PROGRESS](../PROGRESS.md) for the exact inspected Git head and CI run.

## Remaining acceptance scope

TEST-02 and the previous baseline were already complete and were not manually
rerun. This pass addresses legacy XLS worker supervision and old multi-source UI
compatibility while retaining the existing application/schema architecture.

| Check | Evidence |
| --- | --- |
| XLS file size | A sparse synthetic file above 32 MiB is rejected before a worker is created. |
| Actual XLS worker bounds | Synthetic BIFF8 workbooks with 101 sheets or 201 columns are rejected; worker termination is awaited and the file can be deleted. |
| Consumer cancellation | Reading stops partway through a real 250-row XLS; the worker waiting for acknowledgement is terminated. |
| ZIP temporary files | Real XLS limit rejection and consumer cancellation both terminate the worker and remove the actual temporary workbook directory. |
| Supervisor failure paths | Fault injection checks the 60-second response deadline, an out-of-memory-shaped worker error, unexpected exit, timer cleanup, and pausing the deadline while the consumer processes a batch. The production 256/32 MiB V8 limits are asserted. |
| Old multi-source UI | Existing source choices are retained. Old shared mappings are adapted per source in editor memory; independent mapping/exclusion is persisted only when Save is selected. The exact PUT payload and no horizontal overflow at 390 pixels are tested. |
| Old multi-source API | A regression removes the new sample/header/source metadata to reproduce an old inspection, then saves different source mappings and excludes a third source through the real API. One new test passed, exit 0, 38.93 seconds including setup/cleanup; two unrelated cases intentionally filtered out. Two products and their English translations are verified. |

The XLS checks passed ten unit tests. The three affected fixture browser cases
passed across the initial run and targeted rerun. Two initial new-test failures
were assertion mistakes: Product stores English names in translations, and the
UI retains the existing description suggestion. Both expectations were corrected;
the failure history and final command outcomes remain in PROGRESS.

These are bounded regression tests, not exhaustive hostile-file testing or a
memory benchmark. A real V8 heap exhaustion is not deliberately induced; its
error/exit handling is fault-injected. Worker heap limits are not a whole-process
RSS limit or an OS security sandbox. The resource deadline is per response and
pauses during downstream consumption, not a total job wall-clock deadline.

## UI limits retained deliberately

- Header selection is limited to the first 20 sampled nonempty rows. For a later
  heading or a changed layout, prepare a copy and upload it again.
- Old inspections without raw header samples retain their original first-record
  interpretation. Their source mappings/exclusions can be edited; changing the
  header row requires re-upload and is explained in the UI.
- Each job still belongs to one reviewed manufacturer. Headerless sheets and
  ambiguous sources need human mapping. Historical prices/request quantities
  remain outside commercial price/stock data.
- Fixture browser acceptance and disposable-database API tests do not constitute
  acceptance of a publicly deployed Preview.

## Unresolved release gates

1. **Blocked External — Preview identity/isolation.** The local DNS check for
   `preview.sourcebyhedax.ir` returned `DNS_ERROR_RCODE_NAME_ERROR`. This is the
   observed resolver result, not proof of global availability or isolation. No
   confirmed preview deployment/separation configuration was found in the
   inspected repository infrastructure/scripts. The owner was asked for a current
   URL and nonsecret deployment/isolation guide. DB, Redis/queue, storage and
   simulator-provider separation must be established before any write test.
2. **Blocked External — deployed acceptance.** After isolation is established,
   verify the exact reviewed commit with matching API/worker, readiness/auth,
   synthetic import preview/run/report/Undo and catalog results. Record the
   environment and approval evidence without credentials or raw supplier rows.
3. **Requires Owner Decision — target release.** Establish target deployed
   version/migration state, a current database/private-file backup and restore/
   rollback plan, coordinated API/worker rollout with old jobs drained, and owner
   review/explicit approval. The synthetic TEST-02 drill does not certify a
   production backup. No release permission is implied by passing CI.

The finite UI limitations above are documented operational constraints; they are
not represented as unresolved UI defects. No new backend architecture, schema,
dependency or production configuration is introduced by this acceptance pass.

Follow the [release/rollback runbook](SOURCE_UPGRADE_RUNBOOK.md) and retain the
[TEST-02 evidence](TEST_02_BACKUP_REPORT.md). Do not repeat completed baselines or
supplier parsing unless a new change/failure justifies it.
