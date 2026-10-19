# Source upgrade — verification, preview and rollback

Checkpoint: 2026-10-19. This is a preparation runbook, not evidence of deployment
or permission to change production. Current blockers and results are in
[the audit](SOURCE_UPGRADE_AUDIT.md) and [PROGRESS.md](../PROGRESS.md).

## Resume locally

1. Read root `AGENTS.md`, `PROGRESS.md`, current Git branch/HEAD/status and relevant
   diffs. Preserve completed work and private ignored sample diagnostics.
2. IMP-07 now has atomic recovery and seven passing integration cases. Preserve
   this work and resume from the current open check in PROGRESS; do not implement
   the fix again. Do not confuse product Undo versions with input-resume cursors.
3. Execution resumed at the owner's subsequent request. The former approval
   capacity failure no longer blocks local checks; the same review path accepted
   them. Browser/typecheck/lint and full workspace build passed; consult PROGRESS
   for exact scope and any later changes.
   These are the affected commands for future changes, not a request to rerun
   already successful checks without a reason:

```powershell
pnpm lint
$env:CI='true'
pnpm --filter @hedax/web e2e -- unified-parts.spec.ts --grep 'brand database import|workbook mapping'
```

Playwright starts the fixture web server (default port 3100); `CI=true` prevents
reusing an unrelated existing server. The two affected tests passed and the
390-pixel screenshot at `apps/web/test-results/workbook-mapping-fa-mobile.png`
was visually inspected with no horizontal overflow. The artifact is ignored and
may be replaced by later test runs.

The full workspace build passed, including web/worker. Re-run typecheck/unit/integration
only where new changes or identified concerns warrant it. The recovery and
related suites passed together (25 tests, exit 0). Relevant commands:

```powershell
pnpm --filter @hedax/api exec vitest run --config vitest.integration.config.ts test/integration/91-unified-parts.test.ts test/integration/93-brand-import-integrity.test.ts test/integration/94-brand-workbooks.test.ts test/integration/95-brand-import-recovery.test.ts
pnpm build
```

The integration harness creates its own PostgreSQL directory and synthetic
database (default test port 55433), then cleans up the directory it owns. Never
replace it with an existing development or production database. If a port is
occupied, inspect its owner and choose an unused test port; do not kill unrelated
processes. Keep the previous leftover `test-9400` directory separate from any
new test cleanup until ownership is established.

Before a future commit, inspect and restore only confirmed generated changes in
`apps/web/next-env.d.ts` and the three `docs/import` template/error XLSX files
listed in PROGRESS. The current run's generated changes were already reconciled:
the XLSX differences were timestamps/synthetic run identifiers, and Next's build
restored its declaration file. Do not repeat that cleanup without new changes.
Do not reset the working tree. Check whitespace, record
actual check exit codes, and commit a reviewable feature change. Code and documents
were committed/pushed for Draft PR #28. Upstream is now the feature branch on
origin; keep the feature destination explicit for future pushes.

The CI workflow now includes integrity suites 85/91/93/94/95. Its push filter does
not match `refactor/**`; opening a feature PR or explicitly dispatching CI is
needed to obtain remote evidence. Local results are not remote CI results.
Use `pnpm exec vitest ...` for portable file selection: on Linux the prior
`test:integration -- ...` invocation forwarded a literal `--`, causing Vitest 5
to ignore the intended file filters and run the whole integration suite. That
unexpected run exposed TEST-02. Its root cause and cross-platform verification
are recorded in [TEST_02_BACKUP_REPORT.md](TEST_02_BACKUP_REPORT.md) and PROGRESS.
Backup/restore now has its own explicit CI step; a green targeted import job alone
does not establish recovery readiness.

## Isolated preview prerequisites

The 2026-10-19 acceptance pass closes the old multi-source editor and targeted
XLS cleanup checks locally. See [PR #28 readiness](PR_28_RELEASE_READINESS.md).
The local preview DNS lookup returned `DNS_ERROR_RCODE_NAME_ERROR`; no confirmed
isolated deployment was available. Do not treat that result as proof of global
site availability or database isolation. Obtain the current URL and nonsecret
deployment/isolation evidence before writing to any preview destination.

Record nonsecret evidence of separate preview database, Redis/queues, file or
bucket namespace, host routing and credentials managed outside the repository.
Use simulator payment/messaging providers and synthetic accounts. Existing
`.env`, Docker volumes and the other local worktree are not disposable merely
because they are accessible. Domain reachability alone does not prove isolation.

After isolation is established, deploy a specific reviewed commit with matching
API/worker versions, apply only reviewed migrations to that isolated database,
and verify readiness, authentication, import preview/run/error report/undo and
catalog results. Start with a small synthetic archive and draft parts. A real
supplier import still requires reviewed manufacturer/header/mapping choices.
Record the commit, environment identity, checks and known limitations without
credentials or raw supplier/customer rows.

## Production release gate

The owner must explicitly approve the concrete release and any production
migrations/imports or release-triggering merge. Before requesting that decision:

- Retain verified IMP-07 behavior and complete remaining acceptance checks; show reviewed diff, exact commit, CI and
  isolated preview evidence.
- Establish the current deployed version/migration state. The branch base already
  contains unified-parts migrations; this working-tree change adds no migration.
  Never infer the production schema from local history.
- Prepare and verify a backup/restore plan for both database and private files
  using [BACKUP_RESTORE.md](BACKUP_RESTORE.md). Local synthetic restore tests do
  not prove recoverability of the target's current backup.
- Quiesce new imports and drain active inspect/preview/run/undo jobs before
  changing API/worker versions. Do not manually mark unfinished jobs completed.

`verify-catalog-migration` is **not read-only**: it rebuilds search data and repairs
keys. Do not run it on production as an observational check without authorization.
Old catalog tables remain retained; a verification pass is not permission to
drop them or execute a down migration.

## Rollback and reconciliation

Stop new import writes and inspect active jobs before reverting code. A previous
worker can ignore `options.sources`, exclusions and header choices, or lack XLS
support; do not let it consume jobs created by the new version. Reconcile or hold
those jobs before starting a consistent prior API/worker version. Inspect both
per-source mapping and `stats.runCheckpoint`; older workers do not preserve the
new atomic recovery protocol. Do not mix old/new active import workers.

Code rollback does not reverse imported data. For eligible completed or failed
partial imports, use the application's latest-started-per-maker Undo and inspect
preserved counts/reasons. Later edits, commercial use and legacy snapshots may
be retained intentionally. Do not delete these records to make counts match.

If database/file restoration is necessary, the owner must approve the target,
backup and treatment of writes made since that backup. Restore into an isolated
target first and validate counts, file hashes, access controls and audit behavior.
Do not run destructive restore/down commands against the live environment as an
automatic rollback. Record the outcome and next action in PROGRESS after each
stage; keep all secrets outside these documents.
