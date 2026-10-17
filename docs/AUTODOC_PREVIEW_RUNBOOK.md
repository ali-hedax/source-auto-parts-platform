# HEDAX design preview — isolated staging deployment

Target: `https://preview.sourcebyhedax.ir/fa`. This is a deployment runbook, **not proof that the preview hostname is live**.

## Preconditions (operator only)

- Confirm the current live `sourcebyhedax.ir` server, its Docker network, available RAM/disk, and existing reverse-proxy topology from the actual running host. The repository's documentation can be stale.
- Snapshot/backup production and verify health before touching any configuration.
- Ensure a DNS A/AAAA record for `preview.sourcebyhedax.ir` resolves to the intended preview ingress. Use ArvanCloud DNS control panel; do not modify production apex/www records.
- Preview must use an **isolated environment** (separate project, PostgreSQL, Redis, storage, sessions, secrets and app environment). Never share the production database or copy customer, order, payment, or authentication records to preview.
- Seed with non-sensitive labelled sample catalog data; disable outgoing email/SMS, live payments and messenger webhooks. Restrict preview access (basic auth / access policy) until owner approval.
- Prefer a separate VM or Arvan container service. If the same VM is used, give preview a separate Docker Compose project and port/network; avoid clobbering production Caddy and ports 80/443. Verify resource headroom.
- Do not expose preview admin or mutation APIs to the public; do not connect the preview to live production API even for convenience.
- For any staging production-like run, use distinct secrets and `APP_ENV=staging`; follow `docs/DEPLOYMENT.md` and confirm supported configuration on target host.

## Version to deploy

Branch `feat/autodoc-inspired-storefront-v1` (PR #21) only, not `main`. The branch contains the first visual refresh. Verify CI and build before publishing.

## Acceptance

1. Owner can open the preview on iPhone at the HTTPS address and confirm a valid TLS certificate.
2. `/fa` and `/en` display responsive hero, vehicle-first navigation and search without hydration or runtime errors.
3. All catalog content is demo/non-sensitive and labelled as such. Any forms, account/cart/checkout/requests are disabled or safely routed to demo-only services.
4. No cross-origin cookies, shared secrets, or access to production databases.
5. Existing `https://sourcebyhedax.ir/fa` continues to behave exactly as before.
6. Preview is protected from search indexing (authentication/access policy, plus noindex), and can be shut down independently.

## Release policy

No merge into `main` and no production deployment until visual approval. Keep infrastructure credentials in Arvan secret stores or on the host, never in GitHub source, PR comments, or chat.
