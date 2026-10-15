# Telegram and Bale — implementation and release gates

Status (2026-10-15): PR #14 merged and released as `v1.3.0`; **Bale is live, Telegram is off.**

- **Bale (`@sourcebyhedaxbot`):**
  - The webhook is registered on the secret capability URL.
  - Verified with the owner's real messages (/start and a SKU search): every reply was delivered on the first attempt and there were no errors.
- **Server `.env`:**
  - `BALE_BOT_TOKEN` was corrected (it had a stray `__` prefix).
  - An independent `BALE_WEBHOOK_SECRET` was generated on the server.
  - No value was printed.
- **Telegram stays disabled until the owner decides:**
  - `TELEGRAM_BOT_TOKEN` is commented out in `.env`; its value is kept in the pre-bot backup.
  - The server has no route to `api.telegram.org`, so replies cannot be delivered from it.
- **Rollback:**
  - images `:pre-bot`;
  - `/root/hedax-backups/pre-bot-20261015T065701Z/`;
  - encrypted backup `source-backup-20261015T065702Z.tar.age`.
- **Recommended:** rotate both bot tokens, since the production `.env` was exposed in an earlier screenshot (see below).

## Behavior and security

- Both bots are intended to be `@SourceByHedaxBot`; verify actual identity using server-side `getMe` before registration.
- Private-chat searches reuse `CatalogService` with anonymous viewer context. No customer-group pricing or account identity is inferred from messenger IDs. Prices use the existing exact-integer Persian formatter, payable IRR/rial amounts and catalog stock. Missing prices/FX produce an inquiry message.
- `/fa/parts/[slug]` is the verified product route. Ordering links to `/fa/parts`, tracking to `/fa/account/orders`, missing-product requests to `/fa/request-part`. Existing website login and ownership checks remain required. Account linking, in-chat ordering, personal order details and notifications are **not implemented** in this phase.
- Telegram authenticates its webhook header; Bale uses an independent random capability in the webhook path. Never use a bot token in that path. Secrets must be independent per provider, URL-safe, 32–256 characters; generate 32 random bytes as base64url. Token/secret pairs are optional but must be complete. Missing/wrong credentials fail closed.
- Only bounded private text updates with safe IDs and matching sender/chat IDs are accepted. Group, bot, malformed and unsupported updates are ignored. The existing per-chat limiter fails closed in production when Redis is unavailable.
- Success is returned only after durable insertion into PostgreSQL outbox. A unique provider/bot/update key prevents concurrent/replayed inputs creating extra jobs. Jobs contain no credentials. Retain completed rows as deduplication tombstones; agree on a replay-retention policy before purging them. Restrict access to stored search text/chat IDs.
- The existing worker handles delivery and bounded retries. HTTP failures, `ok:false`, invalid JSON, redirects and timeouts produce sanitized errors, never provider bodies or token URLs. Completed/failed BullMQ transport jobs are removed so the DB-owned retry can enqueue the same job ID again; diagnostics remain in PostgreSQL.
- Duplicate inputs are prevented, but `sendMessage` is **at least once**: a crash after provider acceptance but before DB completion, or an ambiguous timeout, can duplicate a reply. No order is created by this handler.
- Caddy skips webhook access logs and filters capability URIs and Telegram secret headers in default/error logs. Check equivalent protection at any CDN/WAF/APM or extra proxy before registration; do not enable debug request logging.

## Current official API checks

[Bale documentation](https://docs.bale.ai/) was retrieved from the VPS on 2026-10-15; external retrieval timed out. It documents `setWebhook` with `url`, HTTPS POST JSON updates and ports 443/88. `secret_token` was not documented: do not assume Telegram header semantics. Its standard API is `https://tapi.bale.ai/bot<TOKEN>/METHOD`; business API is separate. Bale automatically formats Markdown, so untrusted catalog label syntax is stripped.

References: [Telegram webhook API](https://core.telegram.org/bots/api#setwebhook), [Caddy log_skip](https://caddyserver.com/docs/caddyfile/directives/log_skip), [Caddy log filters](https://caddyserver.com/docs/caddyfile/directives/log#filter).

## Validation and limitations

- Frozen dependency install, Prisma generation, shared packages/API build and API typecheck passed.
- 177 unit tests passed: 95 domain, 8 contracts, 74 API, including 30 messenger tests.
- 12 integration tests passed on temporary local PostgreSQL: commerce plus 3 messenger tests. Includes webhook auth, concurrent deduplication, provider isolation, durable acknowledgment, sanitized rejection/retry, replay after completion, and existing order ownership/idempotency.
- Targeted ESLint and whitespace checks passed. Proposed Caddy config adapted/validated using the installed server binary without reload or replacing the live file.
- Read-only server check: API/web/PostgreSQL/Redis/ClamAV healthy; Caddy/worker running. Telegram HTTPS failed (000), Bale root returned 404 (host reachable, **not authenticated API validation**), docs returned 200.
- Integration delivery used the inline worker and mocked providers. Real Redis/BullMQ retry and actual bot payload/delivery still need staging validation; local Docker was unavailable.
- Owner confirmed tokens are not stored on the VPS. No production backup, restore drill, deploy, registration or secret rotation was performed.

## Rollout and rollback

1. Obtain fresh provider tokens and enter only through a secure server session/secret manager. Verify each bot's `getMe` identity. Never paste tokens into chat, shell history or command arguments; do not print raw environment/Compose configurations or `getWebhookInfo` responses.
2. Resolve Telegram egress using an owner-controlled, reviewed route, not a public Bot API proxy. Bale can be deployed independently after its gates pass.
3. Complete exposure response, staging Redis/provider tests and proxy log checks. Pin the reviewed commit and immutable API/worker image digests. No schema migration is introduced.
4. Before production changes, take encrypted DB/storage backups per `docs/BACKUP_RESTORE.md`; preserve environment/encryption keys separately in owner-controlled secure storage. Verify checksums and restore in isolation. Record current image digests/configuration and rollback commands. Obtain explicit owner approval for the concrete deployment and credential changes.
5. Deploy compatible worker/API and proxy protection together with credentials disabled until healthy. Register each webhook server-side only after configuring secret pairs. Telegram includes its header secret; Bale uses only its documented URL parameter. Do not silently drop pending updates.
6. Test both actual bots: start/help, SKU/name search, missing part, price/stock, ordering link, authenticated tracking, replay and provider failure/recovery. Monitor sanitized failures. Never print webhook URLs.
7. Rollback: unregister affected webhook, pause messenger delivery, restore pinned API/worker/Caddy versions and compatible secure config, retain outbox evidence. Do not restore revoked credentials from an older backup.

## Safe response to the exposed production environment

Treat credentials visible in the earlier screenshot as exposed. Inventory names/consumers only; review access logs privately and remove shared copies where possible. Deleting the screenshot does not revoke credentials.

- Rotate bot tokens/capabilities, S3, SMTP, SMS, payment and deploy/repository credentials one service at a time. Validate replacement permissions/function, revoke old access, and verify rejection. Use provider-supported overlap or an approved interruption. Re-register webhooks after capability changes; keep bot identity stable.
- Coordinate database role password changes with API/worker/tools settings and reconnect checks. Editing `.env` alone does not change the database password.
- Coordinate `SESSION_SECRET`, `OTP_PEPPER` and `REVALIDATE_SECRET` across all consumers. Explicitly invalidate affected sessions/challenges, plan reauthentication and verify cache purge; avoid owner lockout.
- **Do not directly replace `APP_ENCRYPTION_KEY`.** It decrypts staff TOTP and pending enrollment secrets. Identify every encrypted field and backup consumer; implement versioned keys with dual-read/new-write behavior, test on an isolated restored backup, re-encrypt transactionally with row counts/verification, validate owner MFA and rollback, then retire the old key under an approved backup recovery/retention plan. Alternatively use a controlled MFA re-enrollment plan. Never mass-replace the key or bypass authentication.

Direct in-chat order access requires authenticated-site-initiated linking with hashed, expiring, single-use challenges, explicit confirmation of both identities, unlink/revocation, customer-scoped authorization and existing checkout idempotency. Chat IDs, usernames, phones and order numbers alone are not authentication.
