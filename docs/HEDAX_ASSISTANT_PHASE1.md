# HEDAX text assistant

The release is a bilingual text assistant backed by the existing catalog and an
Arvan AIaaS Chat Completions gateway. Voice remains deferred and customer pages
contain no microphone, mute or speech controls.

## Runtime behavior

`POST /api/v1/assistant/messages` accepts a bounded message plus at most eight
recent messages. The server applies a fixed safety prompt and the bounded prompt
saved by an owner, searches `CatalogService`, and supplies only returned product
facts to the model. Product cards render the catalog's part number, price,
currency, unit, availability and recorded fitments. Missing catalog facts are
never inferred. Account and order data are not exposed to this endpoint.

The Arvan adapter calls `[ARVAN_AI_ENDPOINT]/chat/completions` with the server-only
`Authorization: apikey ...` header. The key never reaches Next.js, browser JSON,
admin settings, logs or Git. Requests have a timeout and bounded output. An
unavailable provider produces an honest error and a contact link.

Redis atomically reserves all three controls before a paid call:

- 300,000 IRR per UTC day for Production;
- 100 requests per UTC day (or a lower saved admin limit);
- three concurrent calls by default.

The isolated real-test environment has a separate 50,000 IRR daily cap. Token
usage refunds only the unused part of a conservative reservation. Missing usage
or a failed provider call keeps the full cost reservation. Redis failure in
Production fails closed. These are backend gates, not monitoring alerts.

## Admin settings

Open `/fa/admin/assistant` or `/en/admin/assistant`. `settings.manage` is required
to read or change the assistant. The enabled switch, bilingual system prompt,
output-token cap and daily request limit persist in `SiteSetting` with optimistic
versioning and an audit record. Provider, model and credential status are
read-only runtime facts. `GET /api/v1/site/assistant` explicitly removes the
private AI configuration and version metadata.

## Secure Arvan setup

Create one Arvan AIaaS gateway named `source-hedax-assistant`, attach the exact
configured model, and create a least-privilege machine credential for that
gateway. Do not paste the credential into chat, a shell command, a ticket or a
Git-managed file.

On the server, open the repository-root `.env` directly in a trusted SSH editor.
The file must be owned by the service account and mode `600`. Set:

```dotenv
ASSISTANT_AI_PROVIDER=arvan
ASSISTANT_LIVE_CALLS_ENABLED=true
ARVAN_AI_ENDPOINT=https://<gateway-host>/<gateway-path>/v1
ARVAN_AI_API_KEY=<secret entered only on the server>
ASSISTANT_TEXT_MODEL=gpt-5.6-luna
ASSISTANT_DAILY_REQUEST_LIMIT=100
ASSISTANT_DAILY_BUDGET_IRR=300000
ASSISTANT_TEST_BUDGET_IRR=50000
ASSISTANT_MAX_CONCURRENT=3
```

Use `chmod 600 .env` after editing. Validate only variable names/presence; never
print `.env`, `docker compose config`, container environments or the key. The
checked-in `.env.example` contains placeholders only.

## Local isolated review

From the repository root, after required builds are current:

```powershell
node apps/web/scripts/assistant-local.mjs
```

The launcher creates a temporary PostgreSQL database on loopback, temporary
storage, fresh test secrets, inline queue and the synthetic provider. It never
reads Production data or credentials. It asks for a new disposable password for
`owner@hedax.test`. Open `/fa/staff/login`, enroll MFA, save the assistant settings
and review `/fa`. Mock success proves wiring and UI only; it is not evidence of a
real Arvan connection. `--smoke` starts, checks and cleans up automatically.

## Verification

```powershell
pnpm --filter @hedax/contracts exec vitest run test/assistant.test.ts
pnpm --filter @hedax/api exec vitest run test/unit/assistant-budget.service.test.ts test/unit/assistant.service.test.ts
pnpm --filter @hedax/api exec vitest run --config vitest.integration.config.ts test/integration/96-assistant-settings.test.ts
pnpm --filter @hedax/web exec playwright test e2e/assistant.spec.ts
pnpm lint
pnpm --filter @hedax/api typecheck
pnpm --filter @hedax/web typecheck
pnpm --filter @hedax/web build
```

One real test may run only after the gateway endpoint and secret are present in
an isolated server environment with the 50,000 IRR cap. Production enablement
then requires a verified rollback/backup, deployment through the existing Compose
runbook, an owner save of the enabled switch, and a real bilingual response check
on `https://sourcebyhedax.ir`.
