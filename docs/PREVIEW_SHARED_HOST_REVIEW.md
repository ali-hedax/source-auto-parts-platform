# Preview on the existing Arvan server — prepared, NOT deployed

Owner direction: reuse existing infrastructure; no new server purchase. These
files prepare a shared-host option for review. They do not authorize changes to
Production configuration or cleanup, and do not establish a live Preview URL.

Read-only inspection on 2026-10-24: 4 vCPU, 7,947 MiB RAM, 5,107 MiB available;
root disk 91% used with 6.6 GB available. Seven Production containers healthy or
running. Docker reports 7.577 GB reclaimable build cache. Old application images,
backups, named volumes and Production data must be retained.

## Exact proposed changes requiring approval before execution

1. Remove only unused Docker BUILD CACHE, after rechecking disk/candidates. Do not
   prune images, containers or volumes; do not touch release rollback artifacts.
   Build cache is reproducible but clearing it can slow a later rebuild.
2. Create a new `hedax-preview` stack with fresh secrets, PostgreSQL, Redis,
   storage and antivirus volumes. No Production `.env`, database or storage copy.
   Use only synthetic catalogue data and the cleared owner-provided Hero assets.
3. Use `infra/docker-compose.preview.shared.yml` as the third Compose overlay.
   The preview ingress publishes no host ports. Its external edge bridge is
   separate from `hedax_default`; only the preview ingress and existing Production
   Caddy join `hedax-preview-edge`. Persist the outer proxy attachment in its
   reviewed deployment configuration; a manual network attachment alone is not
   durable across container recreation. Preview application services stay on the
   separate `hedax-preview_default` network. No Production DB/storage network is
   shared with the Preview stack.
4. After saving the current proxy configuration, add ONLY the following sibling
   virtual host, validate the entire configuration and gracefully reload Caddy:

   ```caddyfile
   preview.sourcebyhedax.ir {
       reverse_proxy hedax-preview-ingress:80
       header X-Robots-Tag "noindex, nofollow, noarchive"
   }
   ```

   Existing apex/www blocks and their upstreams stay unchanged. This is still a
   Production proxy configuration change and needs the owner's explicit approval.
5. Add only the `preview` DNS record pointing at the existing Arvan server. Keep
   apex/www, email, bucket policies and other records unchanged. Check TLS and
   IPv4/IPv6 consistency before considering the URL live.

The public storefront is accessible without a shared password, as requested;
staff pages keep normal session/MFA/RBAC controls. Noindex discourages indexing
but is not an access-control mechanism. Mail/SMS/payments/messengers and live AI
are disabled. Local scanner mode is never allowed on this staging stack.

## Execution and acceptance after approval

- Check Docker Compose supports `!reset`; render all three overlays with a fresh
  protected Preview environment. Inspect resolved volumes/networks/endpoints and
  resource ceilings without logging secrets. Supply pinned, reviewed application
  images via a fourth overlay and avoid a concurrent full build on the host.
- Check memory/disk again. Do not start if capacity is inadequate; reduce scope
  or present a resource change for approval. Do not evict Production services.
- Run migrations and base metadata only against the fresh Preview database;
  bootstrap a Preview-only owner. Upload the seven files through the media API,
  then save/publish the bilingual film block in that Preview database only.
- Verify antivirus readiness, media MIME/Range requests, appearance persistence,
  playback/low-motion/mobile behavior, anonymous admin rejection, CSRF and public
  TLS. Run hosted performance checks; local measurements are not hosted results.
- Recheck Production health before/after. Rollback removes only the new proxy
  virtual host/network attachment and stops the Preview stack. Retain its volumes
  until the owner separately authorizes deletion.

Current limitations: the public hostname is NXDOMAIN; no shared-host changes
have been applied. Dependency audit has one high and one moderate transitive
advisory (see current PROGRESS checkpoint); release review must retain them.
