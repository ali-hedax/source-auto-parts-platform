# Telegram & Bale integration — implementation baseline

Status: development only. No production deployment or live bot registration.

## Verified architecture
- NestJS API at `apps/api`, global API prefix `/api/v1`.
- `CatalogService` already resolves public product data through `PricingService` and `InventoryService`.
- Existing modules include orders, cart, sourcing, conversations, notifications, and authentication.
- Integration must reuse those services; messenger chat IDs are **not** customer authentication.

## Implementation phases
1. Implement provider-specific, secure inbound webhook adapters (Telegram header secret; Bale capability verified against current official documentation). Validate payloads, deduplicate updates, enqueue processing and return promptly.
2. Build one-time account linking initiated from an authenticated site session, with hashed, expiring, single-use tokens. Never infer identity from chat IDs alone.
3. Use `CatalogService.list` for anonymous search and verified viewer context for customer-specific pricing. Never reveal group pricing to an unlinked chat.
4. Reuse cart and order services; require verified account identity and existing checkout/payment workflow. Use idempotency keys for order submission.
5. Add opt-in notifications, delivery retries, admin support inbox and provider-specific settings.
6. Add grounded AI search with explicit human escalation and no autonomous pricing or ordering.

## Security and release gates
- Never commit bot credentials or send them to browser code.
- Use HTTPS and independently validate webhook authentication for each provider.
- Respect existing guards; only explicitly authenticated webhook endpoints may be public.
- No production migrations, deployment, token registration or merge without owner approval.
- Validate outbound connectivity from the ArvanCloud host to each provider.
- Add tests for spoofed webhooks, replayed events, unauthorized access, and duplicate orders.

## External prerequisites
- Telegram bot token and webhook secret, entered in server secret storage.
- Bale bot token and verified current webhook specification.
- Explicit consent/opt-in from customers for messaging.
- Production server connectivity test and owner approval.

## Progress
- Repository located and isolated development branch created.
- Existing NestJS module and catalog architecture inspected.
- Next: provider adapters and tests. This document is not evidence that bots are live.
