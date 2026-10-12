# Contributing to Source by HEDAX

فارسی: تغییرات را روی شاخهٔ جدا انجام دهید؛ اطلاعات واقعی مشتری، رمزها و بکاپ‌ها را وارد GitHub نکنید. پیش از تغییر سرور، بکاپ و روش برگشت را آماده کنید.

## Workflow

1. Describe the problem in an issue. Send security reports privately as described in [SECURITY.md](SECURITY.md).
2. Branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>` or `chore/<topic>`.
3. Keep each change focused. Follow any `AGENTS.md` instructions in the directory you edit.
4. Run the relevant checks and explain any checks you could not run.
5. Open a pull request with the trigger, resulting behavior and validation. Request owner review for deployment, migrations or business-policy changes.

## Development checks

Use the pnpm version declared in `package.json`; install with the committed lockfile.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @hedax/domain --filter @hedax/contracts --filter @hedax/api run build
pnpm lint
pnpm typecheck
pnpm test:unit
```

The CI workflow uses Node.js 24 and checks lint, types and domain/contracts/API unit tests. It does not connect to production, run migrations or deploy.

For a broader change, run `pnpm build` and the relevant integration/browser checks. API integration tests use an isolated temporary PostgreSQL database. The worker PDF tests need a supported browser (`PDF_BROWSER_CHANNEL` or `PDF_BROWSER_EXECUTABLE`). See [README.fa.md](README.fa.md) and [the test report](docs/TEST_REPORT.md).

## Data and credentials

- Keep secrets in local `.env` files or the deployment secret store.
- Commit `.env.example` names and placeholders only; never commit database dumps, storage archives, keys or actual customer records.
- `seed-dev`, fixture data, payment simulators and development OTP logging are local-only.
- Before migrations, take and verify a backup. Do not edit previously applied migration SQL.
- Production rollout requires a tested rollback and the [launch checklist](docs/LAUNCH_CHECKLIST.md).

## Changes requiring special care

Money is settled in IRR; do not silently introduce toman conversion. Preserve Persian/English behavior, RTL/LTR layout, authorization, upload quarantine and staff MFA. Add or update meaningful tests when behavior changes.

Brand changes follow the [HEDAX brand guide](https://github.com/ali-hedax/brand-guide-hedax) and `design-system/MASTER.md`.

## Rights

This repository does not currently include an open-source license. Ask the owner before distributing code or brand assets. Submission of a PR does not change the licensing of the project.
