# Preview isolation profile

This profile prepares a **reviewable configuration only** for Source by HEDAX
Preview. It has not been deployed. It must be used only after the owner names a
separate Preview host or ingress and approves its DNS change.

## What is included

`infra/docker-compose.preview.yml` is an overlay for the base stack. Its
`hedax-preview` Compose project name makes Docker create a separate network and
separate named PostgreSQL, Redis, storage, ClamAV and Caddy volumes. It forces
the API, worker and one-off tools into `APP_ENV=staging`, local storage and
disabled payment, SMS, mail and messenger integrations.

`infra/caddy/Caddyfile.preview` protects the whole host with Preview-only basic
authentication, returns `X-Robots-Tag: noindex, nofollow, noarchive`, blocks
the integrations webhook namespace, and routes `/media/` to the isolated API.
The API exposes only its local public media directory at that path. It contains
no Production bucket endpoint or credential.

`infra/preview.env.example` is a names-only template. Its real copy belongs in
a protected location outside the repository and must contain freshly generated
Preview-only values.

## Preconditions and status

| Prerequisite | Status | Evidence / required action |
| --- | --- | --- |
| Separate Preview compute or ingress | Missing | The target host, proxy topology and capacity have not been supplied. Prefer a separate VM/container service. |
| Public DNS target | Missing | `preview.sourcebyhedax.ir` returned NXDOMAIN from the checked public resolvers. Owner/operator must select the target and create only this Preview record. |
| TLS contact and password-gated access | Missing | Operator supplies a Preview-only contact address and a password hash in the protected environment. |
| Database, Redis/queue and storage | Prepared, not created | `hedax-preview` namespaces fresh named volumes when the stack is first started. No Production dump, URL, volume or object copy is permitted. |
| External integrations | Prepared | Overlay forces payment, SMS, mail and messenger integrations off; Preview must not receive webhooks. |
| Data | Partially prepared | `seed-base` is safe base metadata only. `seed-dev` refuses `staging`, so a dedicated synthetic, labelled catalog procedure is still required. Never use customers, orders, payments, logins or supplier files from Production. |
| DNS / server / Production state | Untouched | This change neither deploys nor calls external infrastructure. |

## Operator sequence after approval

1. Provide a separate Preview host/ingress, its capacity and the DNS target. If
   it shares a host with Production, stop for an explicit proxy/port review;
   the supplied overlay intentionally binds the standard 80/443 ports.
2. Create a protected Preview environment from `infra/preview.env.example`.
   Generate every secret afresh, use a Preview-only access credential, and keep
   S3, SMTP, messenger and backup destination values absent.
3. After the owner approves the Preview DNS change, create the A/AAAA or CNAME
   record for `preview.sourcebyhedax.ir` only. Do not change apex or `www`.
4. On the chosen Preview target, review the rendered Compose configuration, then
   deploy the approved commit with both compose files. Run schema migration and
   `seed-base` only against the fresh Preview database; bootstrap a Preview-only
   owner through the protected prompt/environment.
5. Create or import only labelled synthetic catalog/media data. Do not run the
   Hyundai/Kia supplier archive, any Production backup, or a real-user export.
6. Verify DNS/TLS, basic authentication, noindex response, readiness, public
   local `/media/` objects, Redis queue isolation and disabled integrations.
   Confirm Production remains unchanged before inviting reviewers.

See `docs/AUTODOC_PREVIEW_RUNBOOK.md` for the visual-review acceptance list.
