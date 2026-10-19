# TEST-02 — Linux backup/restore regression

Date: 2026-10-19. Status: **Completed & Tested** on Linux and Windows. Scope: the existing synthetic cold-copy restore drill in
`apps/api/test/integration/60-backup-restore.test.ts`. No production database,
backup, storage, application architecture or schema was changed.

## Root cause, reproduced

[Diagnostic Linux run 39216172835](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39216172835)
on `f24630e` recorded:

| Stage | PGDATA root permissions |
| --- | --- |
| Original initialized cluster | `0700` |
| Cold backup copied by the fixture | `0755` |
| Restored copy | `0755` |

PostgreSQL rejected the restored directory with `FATAL: ... has invalid
permissions`, specifying `0700` or `0750` as acceptable. The Node recursive-copy
operation had not preserved the restrictive root-directory mode in this Linux
run. This was a fixture permission failure, not evidence of corrupted order or
attachment data.

Two dependency behaviors obscured the cause: `embedded-postgres.start()` rejects
without an Error when its child closes before readiness; `stop()` registers for
another exit event even if that child has already exited. The old fixture hid
PostgreSQL output and cleanup errors, producing `Unknown Error: undefined` plus
a secondary 180-second teardown timeout.

## Scoped fix

- Create each copy root with its source mode before copying data; explicitly
  preserve and assert that mode on Unix after copying. Apply this to both backup
  and restore. The copied cluster retains `0700` in the verified Linux scenario.
- Retain bounded startup diagnostics and stage timestamps. Preserve the startup
  error; do not call the broken stop path after a rejected start. Shutdown errors
  are no longer silently swallowed.
- Use a unique owned temporary directory, and validate copy/delete targets
  against it before recursive operations.
- Use asynchronous copy/remove operations so file and child-process callbacks
  can run during fixture I/O. Keep the existing test/hook timeouts and all
  application/data assertions.
- Add the existing backup suite as an explicit step in the existing Linux CI.
  It cannot silently disappear from the targeted import check again.

No dependency fork, migration, new backup implementation or application-module
refactor was introduced. The source ZIP/import work was not repeated.

## Verification checkpoint

| Check | Actual result |
| --- | --- |
| Diagnostic Linux reproduction, `f24630e` | Failed as expected: `0755` restored root, PostgreSQL FATAL, teardown timeout. |
| Permissions fix, `00e9e98` | [Linux CI 39223797071](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39223797071) passed, including the new backup step, unit/integration checks, lint, types and web build. |
| Initial Windows compatibility check | Failed at the existing 90-second test timeout; reported body duration about 400 seconds during synchronous fixture I/O. This is retained as a failure, not counted as a pass. |
| Asynchronous fixture I/O on Windows | The single backup suite passed, exit 0, total run 115.03 s including temporary-cluster setup. The test timeout stayed 90 seconds. Exact cause of the earlier OS I/O delay is not established; no before/after performance claim is made. |
| Final asynchronous fixture on Linux, `767183f` | [CI 39225452667](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39225452667) passed on `767183ff7c7949855366f173f17e7b49390884f7`, including the explicit backup drill, lint, types, unit/import/CMS checks and web build. |

The restore assertions retain paid-order totals/receipts, row counts, conversation
history, attachment hashes/access, staff permissions, owner TOTP and append-only
audit protection. This is a disposable PostgreSQL cold-copy drill with synthetic
data. It does not certify the current production backup or the target server's
Docker/`pg_dump` restore procedure.

## PR #28 release assessment

TEST-02 is resolved and cross-platform fixture verification passed. The code is
ready for review with this blocker closed; that is not production release approval.
[PR #28](https://github.com/ali-hedax/source-auto-parts-platform/pull/28) remains
Draft and unmerged. Separate existing acceptance gaps remain: old multi-source
mapping UI, XLS resource-limit termination/cleanup, and an isolated preview with
its database/storage/queue separation confirmed. The owner's preview review and
explicit production approval are still required. A green backup test alone does
not authorize release or a merge.

See [PROGRESS.md](../PROGRESS.md) for the latest tested commit, CI result and next
unfinished action; [BACKUP_RESTORE.md](BACKUP_RESTORE.md) remains the operational
backup guide.
