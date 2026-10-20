# PR #28 release readiness — 2026-10-20

**Production deployed; live Import/Undo acceptance pending browser upload permission.** The owner explicitly approved the merge and live rollout; PR #28 is merged and the candidate is running. See the Actual Production release section and [PROGRESS](../PROGRESS.md) for precise results and the remaining check. No supplier database was imported.

## Completed regression acceptance

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

## Historical preflight — 2026-10-20 (superseded by actual release below)

The owner prefers a direct Production release; provisioning Preview is no longer
the next requested action. No publicly deployed Preview acceptance is claimed.
The current authorization covers preparation and recovery verification. The
reviewed merge and live rollout still require explicit final approval after the
concrete changes, risks and rollback have been presented.

1. **Completed & Tested — deployed baseline/schema.** The inspected deployed Git
   tree equals the PR base. All 18 installed migrations are complete and their
   checksums match the reviewed files; this PR adds no schema migration. Current
   API/worker configuration comparisons and two compiled-module hashes match.
   Services are healthy and no brand imports or active event jobs were present
   in the fresh pre-backup observation. Recheck/drain immediately before rollout.
2. **Completed & Tested — actual complete backup.** The new target backup contains
   PostgreSQL, all 18 private and 49 public S3 objects, local files and recovery
   configuration. Database row counts and pg_dump used one exported read-only
   snapshot. Download-based S3 content checks passed; before/after inventories
   matched. No private data, credentials, dump or archive is committed.
3. **Completed & Tested — actual decryption/isolated recovery.** A separate new
   owner-held backup identity is protected outside the server; old keys were not
   replaced. The encrypted archive was transferred off the server and actually
   decrypted. All 76 payload hashes matched. That decrypted archive was restored
   to a temporary PostgreSQL container with network=none, no public port and no
   live mount. All 99 table counts and migration records matched, all 67 S3
   objects restored with equal hashes, the append-only audit trigger rejected an
   update, backed-up runtime keys matched, and four stored MFA ciphertexts could
   be decrypted with the recovered application key. No plaintext was printed.
   This does not claim an owner login or API private-download authorization test.
4. **Resolved recovery-harness failure retained.** The first attempt connected
   during PostgreSQL initialization before the target database existed; pg_isready
   alone was insufficient. Waiting for the final PostgreSQL PID 1 and a successful
   target SELECT fixed the race. The second attempt passed the recovery checks;
   the temporary container was removed and first-failure evidence was retained.
5. **Completed & Tested — off-server copy.** The encrypted archive was copied to
   the existing private backup destination and read back. Its SHA-256 and
   4,250,824-byte size equal the archive that was actually decrypted and restored.
6. **Deferred Later — scheduled backup improvement.** The existing daily process
   still omits S3 and the prior age identity has not been located. The new complete
   release backup does not change that schedule or certify older archives. Private
   and public bucket versioning were disabled at their dated panel observations;
   no storage policy was changed. No ongoing full-backup guarantee is claimed.
7. **Completed & Tested — immutable candidate.** Matching API, worker and web
   images were built from `883df80db8febd1eadf308967c3b079adbf9a3ab`. Source archive
   hashes and image revision labels matched; packaged import-module hashes match
   between API and worker. A real synthetic BIFF XLS passed through the packaged
   reader in a network-isolated container with leading zeros preserved. The first
   harness inherited `--input-type=module`, reproduced as a separate ReferenceError;
   production-style file execution passed without an application change/rebuild.
   CI run `39373413011` on the same head passed. Rollout/rollback Compose plans
   change only the three image references and pull policy; environment, networks
   and volumes remain equal. No new app service has been started against live data.
8. **Requires Owner Decision — merge, rollout and final acceptance.** Present the
   candidate, CI, recovery evidence and the lack of publicly deployed Preview
   acceptance, then obtain explicit final approval. Preserve old image IDs,
   quiesce imports/drain jobs, replace API/worker/web together and check readiness,
   public pages, authentication/authorization and media/private downloads. A code
   rollback does not undo import data; an old worker must not consume new jobs.
   Destructive restoration of live database/files needs a separate decision about
   post-backup writes. No merge or live rollout has occurred.

The finite UI limitations above are documented operational constraints; they are
not represented as unresolved UI defects. No new backend architecture, schema,
dependency or production configuration is introduced by this acceptance pass.

Follow the [release/rollback runbook](SOURCE_UPGRADE_RUNBOOK.md) and retain the
[TEST-02 evidence](TEST_02_BACKUP_REPORT.md). Do not repeat completed baselines or
supplier parsing unless a new change/failure justifies it.

## Actual Production release — 2026-10-20

**Completed & Tested.** After the concrete risks and recovery plan were presented,
the owner explicitly approved merge, live rollout and commit/push. PR #28 merged
as `0c6e94cc30a92065b563402f7b3415c876b8ab0b`; its tree equals the approved
candidate `883df80db8febd1eadf308967c3b079adbf9a3ab`. CI runs `39373413011`
(candidate) and `39376889261` (merged main) both passed.

The old API/web were stopped, active standard/brand imports and pending outbox
events drained, and the old worker stopped before all three candidate images
started together at 05:49 UTC. No migration or live restore ran. Readiness and
public HTTPS pages passed; API/web are healthy, worker runs, and all three have
zero restarts. Anonymous import-list and sample-download requests return 401.
The owner personally signed in and the real admin dashboard loaded.

The server checkout now points to the merge commit on `deploy/pr28-20261020`;
resolved Compose configuration is equal before/after checkout. Previous image IDs
remain tagged; normal app image tags now point at the candidate. The persistent
`/opt/hedax-compose-current` wrapper uses the reviewed image override. Database,
Redis, scanner, ingress, environment and volumes were preserved.

**Blocked External — live import acceptance.** The deployed database initially
contained zero manufacturers. An explicitly named release-test manufacturer was
created through the authenticated UI, retaining its audit record. The browser
then refused the synthetic two-row CSV upload with “user declined permission”.
No upload/job/import occurred; no workaround was attempted. The owner has the
synthetic file and can upload it personally. Preview, publish=false commit, Undo
of only that job, and deactivation of the synthetic manufacturer remain pending.
Authorized real private-file download has not been certified by the public/401
checks. The scheduled S3 backup gap and unavailable payment/SMS providers remain
deferred; this release is not a claim that every operational feature is ready.

At 05:55 UTC all seven services remained running/healthy as applicable with zero restarts, no unfinished imports/outbox, and no application error-level log lines. An actual public S3 object served through the site returned 200 with nonempty content. Download of an actual READY private attachment without authentication returned 401; authenticated download remains unverified.
