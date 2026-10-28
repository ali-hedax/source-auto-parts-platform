# Source by HEDAX — وضعیت و نقطهٔ ادامه

آخرین به‌روزرسانی: 2026-10-28 12:55، Asia/Tehran؛ کرنل 7.0.0-42 با full-upgrade نصب و سرور یک بار ریبوت شد؛ Production روی 5d18d21 سالم است، Preview خاموش است. مرحلهٔ پنل هکسی منتظر مالک است.

> مرجع فعلی انتشار: 5d18d21، پوشهٔ candidate `/opt/hedax-release-candidates/hexi-5d18d21-20261028`.
> گزارش‌های عملیات امروز: `/srv/hedax-data/ops/20261028/`، `/srv/hedax-data/ops/tidy-20261028/` و `/srv/hedax-data/ops/kernel-20261028/` (خصوصی، روی سرور). یادداشت‌های
> worktreeهای قدیمی تاریخی‌اند؛ تغییرات محلی کاربر در آن‌ها حفظ شده‌اند و نباید بازنویسی شوند.

این فایل مرجع ادامهٔ کار است. ابتدای هر جلسه، ابتدا این فایل و وضعیت واقعی Git
بررسی شوند. پس از هر مرحلهٔ مهم، نتیجه، خطاها، فایل‌ها و قدم بعدی به‌روز شوند.
هیچ رمز، توکن، دادهٔ مشتری یا محتوای محرمانهٔ فایل تأمین‌کننده در این فایل ثبت نشود.

## نقطهٔ فعلی

### Completed & Tested — kernel 7.0.0-42 via full-upgrade and one reboot — 2026-10-28 12:55 Asia/Tehran

- **Owner authorization (2026-10-28, this chat):** install the pending kernel with `apt-get full-upgrade` and ONE reboot; nothing else (no deploy, assistant, data/CMS/.env/DNS, Docker cleanup; Preview stays stopped). The owner wrote "7.0.0-43"; the only pending kernel in the Ubuntu archive was **7.0.0-42.42**, which was installed (no 7.0.0-43 exists in `apt`).
- Scripts `/srv/hedax-data/ops/kernel-20261028/kernel.sh` (sha256 3509fa7f…, log `kernel.log`, checkpoints `state.txt`) and `kpost.sh` (log `post.log`).
- **1 Completed & Tested — pre-checks 09:07 UTC:** Production healthy on the 5d18d21 digests, readiness 200; Docker root /srv/hedax-data/docker; both drop-ins with `RequiresMountsFor=/srv/hedax-data`; `findmnt --verify` "Success, no errors or warnings"; Preview 0 running. Backup `/srv/hedax-data/backups/20261028/database-20261028T090756Z.dump` (542,011 B, TABLE DATA 104, sha256 5cf2e3d7…); off-host `prekernel-20261028T090756Z.tar.age`, local = remote sha256 (dd42b020…).
- **2 Completed & Tested — full-upgrade:** simulation and run changed only `linux-image-virtual` 7.0.0-38 → 7.0.0-42 plus new `linux-image/modules/main-modules-{zfs,v4l2loopback}-7.0.0-42-generic`; no removals; docker.io 29.1.3 and containerd 2.2.2-0ubuntu1.2 unchanged (no hold needed). rc 0. Kept kernels 7.0.0-38 and 7.0.0-30 (GRUB entries present; `/boot/vmlinuz.old` → 38). No autoremove.
- **3 Completed & Tested — reboot:** issued 09:10:22 UTC; kernel started 09:10:53; mount 09:11:09, containerd 09:11:36, docker 09:11:57; all Production containers healthy by 09:13:22. Downtime ≈ 2–3 minutes (not sampled from outside during the window). SSH back on the first 2-minute retry.
- **4 Completed & Tested — after boot:** `uname -r` 7.0.0-42-generic; /srv/hedax-data mounted (UUID 9e4594c9…); Docker root /srv/hedax-data/docker; api/worker/web on the 5d18d21 digests; all 7 Production containers running/healthy, restarts 0; readiness database/redis/storage/scanner up; /fa, /en, /fa/staff/login 200 locally and from this PC; Preview 0 running.
- **5 Completed & Tested — 10-minute watch 09:13–09:22 UTC:** 5 samples /fa 200 in 0.24–0.27 s; load 2.4 (boot) → 0.2; CPU steal 0.05–0.15 % (final 0.08 %); `journalctl -k -b | grep -i lockup` 0, RCU stall/starved 0; 0 error-like lines in Production logs. RAM used 2.2 GiB (5.5 GiB available); `/` 7 %, /srv/hedax-data 18 %.
- **Open:** Hexi panel prompt + «پیام‌ها» check (owner); Preview remains off (`/root/preview-on.sh`); keep watching for host soft-lockups over longer periods (none since the moves/reboots today).

### Completed & Tested — server tidy, updates and one reboot — 2026-10-28 12:10 Asia/Tehran

- **Owner authorization (2026-10-28, this chat):** stop Preview, delete docker.old/containerd.old, remove named leftovers and superseded unused images, install Ubuntu updates, ONE reboot. Not touched: assistant/Hexi code, PR #54, DNS, .env/secrets, DB content, CMS.
- Script `/srv/hedax-data/ops/tidy-20261028/tidy.sh` (sha256 e7f2bebb…, log `tidy.log`, checkpoints `state.txt` steps 1–8), post-boot script `post.sh` (log `post.log`).
- **1 Completed & Tested:** snapshot 08:09 UTC (all Production healthy, readiness up, steal 0.15 %); backup `/srv/hedax-data/backups/20261028/database-20261028T080923Z.dump` (541,867 B, TABLE DATA 104, sha256 73e79bc0…); off-host age copy `pretidy-20261028T080923Z.tar.age` in `arvan:sourcebyhedax-backups/source/`, local = remote sha256 (696ec0c5…).
- **2 Completed & Tested:** Preview stopped with its wrapper `stop` (no down/-v; images, volumes, config kept); `/root/preview-on.sh` and `/root/preview-off.sh` (mode 700) start/stop only Preview. Preview stayed stopped after the reboot.
- **3 Completed & Tested:** with Docker/containerd roots confirmed on /srv/hedax-data, Production healthy, no mounts/open files inside, verified backup: deleted `/var/lib/containerd.old` and `/var/lib/docker.old` → `/` 35 G → 5.1 G used.
- **4 Completed & Tested:** deleted `/opt/hedax-release-candidates/titanium-5b3d2ff9292e/images.tar.gz` (680,194,048 B; not open/referenced); no other 2026-10-26/27 partial files > 20 MB found. `docker rmi` (no -f, container check) removed `df1650c9f3af` (unpublished navy web), `hedax-pr29-api`, `hedax-pr29-worker`, `hedax-smoke-polish-web`. Kept: 05b1060 rollback (`hedax-final-rollback-*`/pr31), 5d18d21 rollback (`hedax-hexi-rollback-*`), current images incl. tools, Preview overlay images, hedax-backup, base images (22 images now). Build cache prune 82 MB; apt clean.
- **5 Completed & Tested:** `/etc/systemd/journald.conf.d/hedax-size.conf` `SystemMaxUse=500M` (journald restarted, 496 MB); daemon.json validated (data-root + log-opts 20m×5); compose containers use json-file 10m×5.
- **6 Completed & Tested:** `apt-get update && apt-get upgrade` rc 0 (confold): 24 packages incl. containerd 2.2.2-0ubuntu1.2, systemd 259.9, snapd, cloud-init, qemu-guest-agent. docker.io unchanged (29.1.3, no candidate); no major change → no hold. **Kept back:** `linux-image-virtual` 7.0.0-42 (needs `full-upgrade` + another reboot; not done — owner allowed one reboot). `/etc/containerd/config.toml` kept (our root). Production healthy after the upgrade.
- **7 Completed & Tested:** one reboot 08:20 UTC (kernel still 7.0.0-38). After boot: /srv/hedax-data mounted from UUID 9e4594c9…, containerd 08:21:28 and docker 08:21:40 started automatically after the mount; Docker root /srv/hedax-data/docker, containerd root /srv/hedax-data/containerd; api/worker/web on the 5d18d21 digests, restarts 0, all healthy; readiness database/redis/storage/scanner up; /fa, /en, /fa/staff/login 200 (local and from this PC). No manual start was needed.
- **8 Completed & Tested:** 15-minute watch 08:22–08:35 UTC: 5 samples /fa 200 in 0.23–0.35 s; load 0.2–3.3 (boot); CPU steal 0.05–0.15 % (final 0.07 %); 0 kernel soft-lockup/RCU lines since boot; 0 error-like log lines in Production containers.
- **Before → after:** `/` 50 % (35 G used) → 7 % (4.5 G used, 67 G free); /srv/hedax-data 20 % → 18 % (28 G used, 129 G free); RAM used 4.0 GiB → 2.2 GiB (available 3.8 → 5.5 GiB; Preview off frees ≈1.5 GiB).
- **Requires Owner Decision:** new kernel 7.0.0-42 (`apt full-upgrade` + reboot); Preview stays off until `/root/preview-on.sh`; Hexi panel prompt + «پیام‌ها» check; Arvan host CPU steal/soft-lockups (none since this boot, but recurring earlier).

### Completed & Tested — Docker/containerd storage moved to the 160 GB data disk; server tidy — 2026-10-28 11:30 Asia/Tehran

- **Owner authorization (2026-10-28, this chat):** planned outage ≤ 45 min for Production + Preview; move Docker and containerd storage incl. volumes to /srv/hedax-data via rsync procedure; remove superseded unreferenced images + build cache, apt cache, journald vacuum, leftover 2026-10-27 partial export; security updates and a reboot only if required. NOT authorized: DNS, .env/secrets, code/image changes, DB content, Redis restore, CMS, deleting volumes, deleting 05b1060/5d18d21 rollback images, formatting, deleting old Docker dirs before verification.
- Server: Ubuntu 26.04.1, kernel 7.0.0-38, Docker 29.1.3, containerd 2.2.2, 4 vCPU / 7.8 GiB RAM / no swap. Docker uses the **containerd image store** (storage driver overlayfs, io.containerd.snapshotter.v1), so both roots were moved together. Before: no /etc/docker/daemon.json and no /etc/containerd/config.toml (defaults).
- **Phase 1 inventory** (`/srv/hedax-data/ops/20261028/inventory.txt`): / 95 % (3.8 GB free); /var/lib/containerd 62 GB (content 14 GB, snapshots 48 GB, 1.86 M files), /var/lib/docker ≈ 0.7 GB real (volumes 497 MB); 13 volumes (Production pgdata 73 MB, redis 83 MB, clamav 108 MB, storage 604 KB; Preview similar). /srv/hedax-data ext4, UUID 9e4594c9-…, `nodev,nosuid,nofail`, 154 GB free. `docker system df` fails (`snapshots/2560/fs` missing) — reported only. Steal ≈ 7 % avg (up to 14 %), 140 soft-lockup lines in 48 h; one 217 s lockup at 06:46 UTC while the inventory `find` walked 1.86 M files. Preview postgres was "unhealthy" before the move (healthy after). Row baseline: product 29, user 7, order 0, assistant_conversation 4, assistant_message 9; redis keys 89,060.
- **Phase 3 backups** (`/srv/hedax-data/backups/20261028/`, mode 700): `database-20261028T065805Z.dump` (sha256 e8210e14…, TABLE DATA ≥ 100 check passed); config copies (fstab, both wrappers, preview edge overlay, both env files copied without printing, systemd units). Off-host: age-encrypted `predocker-move-20261028T065805Z.tar.age` in `arvan:sourcebyhedax-backups/source/`, local and remote sha256 equal (e3a2b2ef…).
- **Phase 4 move** (`move.sh` sha256 78d9ff1c…, log `move.log`): tidy removed 49 approved superseded images (`hedax-{api,worker,tools,web}:pre-*`, `pr8-mail`, `before-s3-20261014`) with `docker rmi` (no -f, container check), build cache 0 B; root free 4.0 → 38.5 GB. Navy web `df1650c9f3af` was skipped (digest-only reference, not matching the tag rule) and remains. Pre-copy live with ionice/nice 07:03–07:33 UTC. **Outage 07:33:15–07:40:06 UTC = 411 s (6 min 51 s)**: stacks stopped via wrappers, docker/containerd stopped, final `rsync -aHAXSx --numeric-ids --delete` → containerd 990,762 files / 28,464,475,365 B and docker 4,050 files / 741,087,347 B identical on both sides, dry-run 0 pending changes. New `/etc/docker/daemon.json` (`data-root` /srv/hedax-data/docker, json-file log-opts 20m×5) and `/etc/containerd/config.toml` (version 3, root /srv/hedax-data/containerd, state /run/containerd). Old dirs renamed `/var/lib/docker.old`, `/var/lib/containerd.old` (kept). Drop-ins `/etc/systemd/system/{docker,containerd}.service.d/hedax-data.conf` (`RequiresMountsFor=/srv/hedax-data`, `After=srv-hedax\x2ddata.mount`). After start: images 26 / tags 37 / volumes 13 / containers 14 — same as before; stacks started with `start` (no pull/build).
- **Phase 5 verify** (`verify.log`): all 14 containers running, restarts 0, Production healthy; readiness database/redis/storage/scanner up. Public /fa, /en, /fa/parts, /fa/staff/login, /fa/admin/assistant 200; Preview /fa 200. product/user/order unchanged; Hexi public API answered one generic question (HTTP 201, provider arvan) and its row exists in assistant_message for the test conversation id. Admin «پیام‌ها» tab NOT checked (no owner session for the agent). Hexi still introduces itself generically because the recommended Hexi prompt has not been applied in the panel yet. 10-min log watch: 0 error-like lines, 0 kernel lockups, load 1.3.
- **Phase 6:** apt cache 130 MB → 20 KB; journald 1 GB → 496 MB (no permanent SystemMaxUse cap yet); Docker log rotation present in compose (10m×5) and daemon defaults; partial export `/srv/hedax-data/archives/docker-before-final-20261027/` (images.tar 1.96 GB + manifest) removed after reference checks. `apt-get update`: 24 upgradable, **0 from -security** → nothing installed, no reboot required, so **boot-time start from the new disk is configured (enabled units + mount dependency) but not proven by a reboot**. Not removed: `/opt/hedax-release-candidates/titanium-5b3d2ff9292e/images.tar.gz` (680 MB, 2026-10-26, not part of the failed export).
- **Final disk:** / 35 G used / 37 G free (50 %; ≈ 29 GB of that is the kept .old dirs); /srv/hedax-data 30 G used / 126 G free (20 %).
- **Rollback for the move:** stop docker/containerd, remove the two new config files and drop-ins, rename `.old` back, daemon-reload, start, `start` both stacks.
- **Requires Owner Decision:** delete `/var/lib/docker.old` + `/var/lib/containerd.old` (≈ 29 GB) after ≥ 24 h of stable running (root is above 15 % free, so they were kept per instructions); optional journald cap; non-security updates (incl. containerd/systemd) later in a maintenance window; Arvan host CPU steal/soft-lockups; panel Hexi prompt step.

### Completed & Tested — Production release 5d18d21 (Hexi conversation log + navy storefront) — 2026-10-28 09:42 Asia/Tehran

- Owner then said: «همین الان انجامش بده و تمومش کن» — continue now, wait through outages. Script `finish.sh` (sha256 4b334dba…, log `finish.log` in the candidate dir) ran detached on the host 05:35–06:12 UTC with the deploy lock: preconditions (backup sha256 OK, `compose.before` == live wrapper, 4 rollback tags) → pulls by digest worker 05:37, tools 06:10, web 06:11 UTC, each revision label = 5d18d21cde045e7b2e93129975c48b3643aee8b4 → overlay `images.yml` (digest-pinned api/worker/tools/web) + `compose-hexi` (= previous wrapper + `-f …/hexi-5d18d21-20261028/images.yml` before `"$@"`) → migration via `compose-hexi --profile tools run --rm tools`: «All migrations have been successfully applied», `_prisma_migrations` row `20261027150000_assistant_conversations|finished|not rolled back` → `up -d --no-deps --no-build api worker web` → check 1 (06:12:00) api not ready / web 500 while starting, check 2 (06:12:12) api ready 200, FA 200, EN 200 → container images equal the new digests, all running → `/opt/hedax-compose-current` replaced atomically (cmp OK) → `rollout-verified.json`. No rollback was triggered.
- During the pulls the host stalled again: SSH/HTTPS unreachable ~09:10–09:39 Tehran (≈30 min; live site still on 05b1060 then). The script continued on the host and finished after recovery.
- **Completed & Tested — live after release (06:12 UTC):** api/worker/web Up, restarts 0; readiness `ready` (database/redis/storage/scanner up, signatures fresh); worker log last 5 min: 0 error/fatal lines. Public from this PC: /fa 200 (0.85 s), /en 200, /fa/parts 200, /fa/cars 200, /fa/admin/assistant 200 (shell), `GET /api/v1/admin/assistant/conversations` without login 401 (route exists, protected). Emitted CSS contains navy `#071221` and `object-fit:contain`. No DNS, .env, Redis, data import, CMS or Preview change.
- **Rollback:** `/opt/hedax-release-candidates/hexi-5d18d21-20261028/compose.before` (05b1060 wrapper) + images tagged `hedax-hexi-rollback-{api,worker,web,tools}:pre-5d18d21-20261028`; DB dump `database-before-5d18d21.dump` (also on /srv/hedax-data/release-backups/hexi-5d18d21-20261028). The new tables are additive; 05b1060 code ignores them.
- **Not done — panel step:** this agent has no owner session in a browser, so «قراردادن پرامپت پیشنهادی هکسی», output cap 600 and save were skipped as instructed; owner to do it in Admin → «دستیار هوشمند / راهنمای سایت» → «تنظیمات عمومی». Hosted owner-side check of the «پیام‌ها» tab and a real Hexi question are still unverified.
- **Open:** `/` is 95 % (3.8 GB free) after the new images; ≈50 approved old pre-* images + navy web df1650c9f3af still present (can be removed later under the same rule). Host CPU starvation (soft lockups, load up to ~108) remains a provider issue. containerd snapshot error in `docker system df` reported only.

### History — Production rollout of 5d18d21 in progress; host unresponsive during phase A — 2026-10-28 08:52 Asia/Tehran

- **Owner authorization (2026-10-28, this chat):** deploy `5d18d21cde045e7b2e93129975c48b3643aee8b4` (api/worker/web), run additive migration `20261027150000_assistant_conversations`, remove only unreferenced superseded images if `/` < 6 GB (only `docker rmi` without `-f`; no prune; check `docker ps -a`; confirm the old export is not running), then panel step «قراردادن پرامپت پیشنهادی هکسی» + output cap ≥ 600 if logged in as owner. NOT authorized: DNS, .env/secrets, Redis restore, data import, CMS/home publication, Preview changes.
- Local record branch `docs/hexi-release-20261028` (worktree `Desktop/source-hexi-release`) from main `5d18d21`; not pushed.
- **Completed & Tested — pre-flight (read-only, 05:02 UTC):** SSH to new IP 188.121.125.173 with the dedicated key (HostKeyAlias of the trusted host). VM uptime 20 min (rebooted ~04:42 UTC, not by this session). Production = 05b1060 digests (api dcd50934…, worker b69f1323…, web 84185bc2…), restarts 0, API readiness 200 (database/redis/storage/scanner up). Last applied migration `20261025120000_vehicle_finder`. Wrapper `/opt/hedax-compose-current` (sha256 04c4d7f4…) = compose + `.env` + compact-cards overlay + `/opt/hedax-preview-edge.yml` + final-05b1060 overlay, one `"$@"`. Deploy lock free; no docker save/export/pull process; no image events in the last 2 h. Navy 22739a6 pull of 2026-10-27 never completed (empty pull.log). `docker system df` fails: `lstat /var/lib/containerd/.../snapshots/2560/fs: no such file or directory` — reported only, not repaired (owner instruction). Kernel log last 2 h: 0 soft-lockup/RCU, 0 I/O error/OOM.
- Reference script `infra/deploy/rollout-hexi.sh` (branch deploy/hexi-rollout 4af66f5) NOT used: it expects exactly one image overlay (server has two) and pulls by tag, not digest. Own procedure used instead (candidate dir, digest overlay inserted before `"$@"`, previous wrapper kept for rollback).
- Incident (own): a read-only `du -sh /var/lib/containerd /var/lib/docker` from this session's inventory kept running after its SSH call timed out and caused ~42 % I/O pressure; verified by exact cmdline and stopped (PID 20611). I/O pressure then ~6 %.
- **Completed & Tested — disk cleanup 05:12–05:14 UTC:** `/` free 3,400,523,776 B (3.2 GB) → 9,608,802,304 B (9.0 GB, 88 %). Script `/opt/hedax-release-candidates/hexi-5d18d21-20261028/cleanup-images.sh`, log `image-cleanup.log` there; oldest first, `docker rmi` per tag without `-f`, each ID checked against all containers (`docker ps -a`) and allowed only if every tag matched `hedax-(api|worker|tools|web):(pre-*|pr8-mail|before-s3-20261014)`; stopped at ≥ 8 GiB. Removed exactly 5 images: `717a965e57b9` hedax-tools:pre-pr5, `a4bd9603a095` hedax-api:pre-pr5, `dc4f6d40002e` hedax-worker:pre-pr5, `63a6164461b5` hedax-web:pre-pr5, `b27b3e5e5068` hedax-tools:pre-pr7. All other approved candidates (≈50 pre-* images + unused navy web df1650c9f3af) were kept. All Production/Preview containers stayed up/healthy.
- **Completed & Tested — images (registry, local):** GHCR digests for `5d18d21cde04-production`: api `sha256:b8ff60bb…e84f`, worker `sha256:0666ab52…55e7`, tools `sha256:6cdeb7f8…cff3`, web `sha256:4750331e…6fbb`; each config label `org.opencontainers.image.revision` = 5d18d21cde045e7b2e93129975c48b3643aee8b4 (Actions run 40528363944 success). Migration SQL reviewed: two new tables + indexes/FKs/CHECKs only.
- **Implemented Pending Verification — phase A** (`phase-a.sh`, sha256 262debbf…, log `phase-a.log`, started ~05:16 UTC detached with the deploy lock): pg_dump -Fc + pg_restore list + sha256 + copy to `/srv/hedax-data/release-backups/hexi-5d18d21-20261028/`; rollback tags `hedax-hexi-rollback-{api,worker,web,tools}:pre-5d18d21-20261028` on the 05b1060 images; pulls by digest (ionice/nice, 1800 s cap, revision check); overlay `images.yml` + `compose-hexi`. Live services are not touched in phase A. Outcome unknown: right after the start, SSH timed out in banner exchange and public `/fa` timed out (08:48–08:50 Tehran) — same host stall pattern as 2026-10-26/27, plausibly triggered by pull I/O. Monitoring public availability; no further server commands sent.
- **Update 09:00 Tehran (05:28 UTC):** site recovered 08:58. phase-a.log: backup Completed & Tested (526,583 B, 702 entries, 102 TABLE DATA, sha256 ec709b77…, copy on /srv/hedax-data verified OK); `compose.before` = live wrapper (sha256 04c4d7f4…); rollback tags created; API image pulled by digest (revision check pending in log). Host load 81–93, 69 kernel soft-lockup/RCU lines at 05:27 UTC (containerd-shim, kworker, sshd) exactly when the API image unpack finished; CPU pressure ~20 %, I/O low → guest CPU starvation again, correlated with image unpack. To protect the live site, phase A was stopped (SIGTERM to the script and the worker pull, started 50 s earlier) before worker/tools/web pulls. No overlay/wrapper created yet, no migration, no switch; Production still 05b1060. Immediately afterwards SSH and public /fa timed out again (~05:31 UTC); monitoring.
- **Update 09:03 Tehran (05:32 UTC):** public /fa back 09:03:04 (down ~09:01–09:03). Verified: no phase-a/pull process, deploy lock free, phase-a.ok absent; API image b8ff60bb present with revision 5d18d21cde045e7b2e93129975c48b3643aee8b4; 4 hexi-rollback tags present on 05b1060 images; `/` 7.4 GB free (90 %; partial worker layers retained). Production containers unchanged (05b1060), restarts 0, readiness 200. BUT load 108 and CPU pressure some avg10 ≈87 % with nothing from this session running, and 44 further soft-lockup/RCU lines at 05:32 UTC (after the pulls were stopped). So the host CPU starvation is not caused only by the pulls; pulls coincided with/worsened it. Provider-side CPU/steal issue remains open.
- **Requires Owner Decision:** pulling worker (2.6 GB), tools (2.3 GB) and web on this host repeatedly stalls the VM and takes the live site down for ~10 min each time. Options: continue pulls one by one accepting short outages (preferably off-hours), or move pull/unpack load elsewhere (provider-side fix/plan, separate host). Do not restart pulls without the owner's choice.
- **Next:** when reachable, read `phase-a.log` and `phase-a.ok` (do not rerun blindly; script exits if `phase-a.ok` exists), check host health/kernel log, then phase B (migration via `compose-hexi --profile tools run --rm tools`, `up -d --no-deps --no-build api worker web`, readiness/public FA/EN checks, automatic return to `compose.before` on failure, atomic wrapper replacement). Panel prompt step afterwards.

### Implemented Pending Verification — Hexi guide: conversation log + persona prompt — 2026-10-27 18:25 Asia/Tehran

- Branch `feat/hexi-assistant-messages` from `main` @ `0ea4336`; reviewable PR only. **Not merged, not deployed; no Production migration, data or settings change.** Owner approval is required before merge/deploy (AGENTS.md).
- Owner requests (2026-10-27): the guide is named «هکسی» / Hexi (with ک); save every visitor question and the guide's answer and show them in Admin → AI Chatbot beside Personality / Appearance / General; a polished persona prompt in General settings (never claims to be ChatGPT; friendly, fun, energetic, addresses visitors as «شما»; mechanical help, part usage, site stock/price; off-topic → a joke then back to parts; HEDAX intro from the brand guide; contact details from the footer); keep logs 90 days.
- Implemented: additive migration `20261027150000_assistant_conversations` (`assistant_conversation`, `assistant_message`, FK to user ON DELETE SET NULL, status CHECK); `AssistantLogService` records ANSWERED and FAILED (with reason, SKUs shown, tokens, latency, hashed IP never returned) without ever blocking a reply; admin API `GET /admin/assistant/conversations[?q&status&page]`, `GET …/:id`, `DELETE …/:id` (settings.manage, audited without content); hourly worker cleanup deletes conversations 90 days after their last message; widget sends a per-tab random `conversationId` (sessionStorage) and the notice says messages are kept 90 days.
- Prompt: fixed server base prompt (identity: never ChatGPT/other model, data rules, plain text) is always sent before the owner's panel prompt, so the panel cannot remove it; SITE_FACTS (footer contact, social links, footer about, visible FAQ; 60 s cache) added automatically. Hexi persona prompt FA/EN in zod-free `@hedax/contracts/assistant-prompt` (admin chunk only — verified not in public chunks); panel prompt limit 2000 → 8000 chars, button «قراردادن پرامپت پیشنهادی هکسی», default output cap 600. History item limit 1000 → 4000 chars so longer answers do not break follow-up questions. Public default name/greeting now Hexi (stored Production settings unchanged).
- Evidence (local, this sandbox): contracts/API/web typecheck passed; eslint 0 errors; web `next build` passed; API unit 77 passed (7 failures identical on unchanged `main`: missing `dist` + local xlsx substitute); contracts unit 22 passed; integration on real PostgreSQL 18: `96-assistant-settings` + new `98-assistant-log` 9/9, plus `00-platform`, `30-chat`, `81-site`, `83-staff-trash`, `97-release` 30/30. Local-only workarounds (NOT committed): Prisma schema engine/sheetjs CDN blocked → client generated with `PRISMA_SCHEMA_ENGINE_BINARY`, migrations applied with psql, xlsx 0.18.5 substitute in node_modules only. Playwright browser unavailable here → new e2e scenario in `e2e/assistant.spec.ts` written but not run.
- Next action: owner reviews PR → CI → approved deploy (migration is additive) → in panel: General settings → «قراردادن پرامپت پیشنهادی هکسی» → Save → ask Hexi a few questions → check the Messages tab. Real web search is not available to the model (it answers from its own knowledge + Arvan gateway knowledge base, still unverified); live web search would need a separate search API.

### Completed & Tested — Production rollout, approved Redis recovery, mounted new disk — 2026-10-27

- Owner explicitly approved restoring the validated newer Redis snapshot. Original AOF files preserved intact on host, independent volume and verified private offhost backup. Redis recovered; real API readiness database/Redis/storage/scanner all up. Do not repeat recovery.
- All four immutable release images at05b1060841c810c29dba7b43148d2b7030ea0536 pulled and revision verified. Additive vehicle-finder migration applied successfully. API/worker/web switched coherently, all running/restarts0; real API readiness and public FA/EN titanium-home HTTP200 passed. Original Compose/env/edge configuration preserved; current wrapper atomically updated, previous wrapper/images retained for rollback. Dirty host Caddy checkout untouched.
- Dataset dry run:187new,9matched,0duplicate,0conflict,30uncertain. Approved additive import applied; no products/prices/stock/customer seeds. Production vehicle finder displays real imported options.
- Reviewed pre-existing draft atversion238 differed only in theme/chrome colours and opening background. Those values preserved. Owner11111 desktop/mobile/poster registered through scan/storage/library and release clearance. Only opening clip replaced; closing compact film preserved. Finder block + minimal header + existing FAQ added. Standard BuilderService save/publish completed version240 at2026-10-27T13:41:17Z; previous publication retained as revision, web cache purged. Public browser verified actual new video playing readyState4/muted/loop, six shopping paths, automotive hub, three FAQs and compact sourcing/footer.
- New160GB disk successfully initialized from confirmed blank media and mounted persistently at/srv/hedax-data using UUID9e4594c9-c95e-42b2-9fad-6d82db1cab90; fsync/readback passed. Private PostgreSQL custom backup(691catalog entries) and four original Redis files copied and checksum matched on new volume. Do not format again.
- Hosted checks: publicFA200(641ms),EN200(303ms), real product200(221ms),cars200(301ms), admin vehicles/appearance shell200; unauthenticated shell HTTP200 does not prove owner CRUD acceptance. Both new videos return206/video-mp4 with exact byte ranges and desktop/mobile sizes. Initial finder probe accidentally omitted/catalog and404'd; correct browser finder already loaded real options. Subsequent direct client probe timed out connecting; do not mislabel this as a proven application route failure. At13:46UTC real API readiness200 and all3apps running/restarts0. Later SSH banner timeout recurred; provider/source-path stability is NOT fully resolved merely because publication succeeded.
- Actual public assistant UI returned a generated Persian answer to one generic fitment-information question. Live text connection proven; external catalog-document RAG retrieval remains separately unverified. Screenshot stored privately in task outputs. No user/customer data sent in the test.
- Blocked External at13:53UTC: later browser navigation also timed out, alongside SSH banner/client-connect timeouts; site availability is intermittent, NOT currently certified stable. Archive session20922 reached its600s observation limit without success or verification receipt; remote job state remains unknown. No image removal occurs before archive fsync/checksum/tag-manifest verification. Do not duplicate the export. Attempted only a targeted SIGTERM for the exact nonessential docker-save export, preserving all apps/images/volumes;45s SSH banner handshake also timed out. Root was96%,3.4GB free at last successful sample. Need regain management access or use owner's already-open root console to stop only that export, inspect actual job/verification state and root capacity, then verify public health. Never repeat Redis restoration/publication or infer full VM outage merely from this client's failure. Hosted mobile/owner CRUD acceptance remain unverified. External document RAG also remains unverified separately from the successful generated text response.

### Historical checkpoint — superseded by Production milestone above

### Implemented Pending Verification — final API image verified, remaining pulls active — 2026-10-27 Asia/Tehran

- First pull session38907 ended exit1 at its600s API timeout after several layers completed. No application rollout. Resumed the incomplete pull with cached layers, not a rebuild. CURRENT ACTIVE SESSION90208, work/pull-final-images.sh via ssh-reviewed.py7200 --stream. Each target bounded1800s with kill-after10s; streams tail progress every20s over the same connection and holds /run/lock/hedax-deploy.lock. API final digest/revision05b1060 VERIFIED; now pulling worker, then tools and web. Do not duplicate the active pull or recheck/rebuild completed GitHub artifacts.
- Read-only operational inventory finally succeeded: current wrapper SHA256ac9d9d8c9e21acee54908c711e799d59ee6739ff242a9c55138fcbe8f6ea1cb7, exactly one quoted argument forwarder. Paths include /opt/sourcebyhedax/infra/docker-compose.yml, /opt/sourcebyhedax/.env, /opt/hedax-release-candidates/compact-cards-20261025/images.yml and /opt/hedax-preview-edge.yml. Preserve ALL these settings/edge overrides when adding final image overlay. Host checkoutac269da has MODIFIED infra/caddy/Caddyfile: do not reset/checkout over it. Prefer a new candidate wrapper injecting final -f overlay before existing "$@" and preserving rollback wrapper rather than overwriting checkout. Immutable final images carry the actual code revision.
- Applied migrations currently stop at20261024100000_vehicle_brand_logo. Only new vehicle-finder additive migration20261025120000 pending relative to final code (reviewed SQL, no deletion of existing records). Tools image is FROM build with default CMD node node_modules/prisma/build/index.js migrate deploy; target it through preserved Compose env/project, no server build/seed. Dataset CLI supports dry run/report and explicit Production flag; review conflicts before applying reviewed vehicle dataset, never import synthetic products/customer data.
- SSH journal restriction-indicator aggregate returned0 for the sampled last15min; not conclusive evidence of absence of network/source-specific issues. Owner's separate-console journal question remains pending but no need to block current persistent pull. Do not again call all diagnostic timeouts "server disconnected": C-tool/entrypoint/input/CPU timeouts were distinct and were resolved by direct isolated runtime tests. Redis is restored/ready200; no reason to repeat its recovery.
- Final CMS work still needed after code rollout: TitaniumHome route already supplies approved composition/default covers and hub/sourcing. Existing live builder doc was4blocks (opening hero, new-products, compact closing movie, brands). Add/preserve an actual vehicle-finder block and set chrome.homeHeader minimal to activate centred header; FAQ may need a legacy FAQ block sourced from existing content. Preserve closing film. Register owner11111 media via existing scan/clearance services and switch only opening clip. Guard current draft vs published/version and keep revision rollback. Existing helperwork/register-owner-film.mjs records media but does NOT itself publish the page.

### Implemented Pending Verification — final image pull in progress; preserve active operation — 2026-10-27 Asia/Tehran

- Owner requested publication through completion without repeating work, then correctly noted their root console on another computer works. Acknowledge: failure of SSH from this client is not proof the whole VM is down. Read-only journal request is pending with owner: journalctl -u ssh --since '10 minutes ago' --no-pager -n25, to distinguish client-specific SSH limiting/routing. Do not ask for login/password. Current CUA inventory has no visible logged-in guest console; attempting Console on temporary tab19 (AX and coordinate) produced no terminal/new tab. Management panel access is distinct.
- Redis recovery is COMPLETE, owner-approved and ready200 as below. Do not repeat it or RDB tests. Newer snapshot and valid-prefix isolated runtime tests both passed, with no waiting/active/failed event work; PostgreSQL outbox79 DONE. Latest successful tests restored Preview memory128MiB/CPU0.25 after temporary512MiB/CPU1 tests. Original Redis files remain retained and off-host backup verified.
- ACTIVE FINAL IMAGE PULL: unified exec session38907, started via work/pull-final-images.sh through the new-IP verified SSH helper. Outer Python timeout1800s; each remote image pull timeout600s. Holds /run/lock/hedax-deploy.lock while pulling API→worker→tools→web sequentially by exact public GHCR digest and checking revision labels05b1060. Output is buffered by the helper, so no phase output does NOT establish a failed/absent pull. Do not start a duplicate pull, rollout or another conflicting mutation. Poll this existing session first. Logs live privately under /opt/hedax-release-candidates/final-05b1060-20261027/pull-{target}.log. No live application images replaced yet. Tools image is full build stage; retain free-space guards, no server build/prune of user images.
- Additional read-only SSH connection attempts after the initial new-IP success timed out before authentication. Avoid hammering new sessions while the source-specific SSH question is unresolved. Existing image pull may still be running independently. Current server wrapper/source/migration inventory inspection (session84366) failed connecting; its information is NOT verified yet. Do not invent an env-file location or replace source checkout.
- DNS authoritative apex/www/preview all point to provider-confirmed new IP; mail/MX/TXT/NS/cloud flags unchanged. Owner explicitly requested sending latest support reply; posted16:06 confirming DNS and identity while accurately reporting subsequent client SSH timeouts and asking stability/storage review. Verified new message/empty composer; no rating/closure. DNS and support screenshot receipts in chat outputs; DNS proof already shown inline.
- Next after pull: verify all4 local server image revision labels/digests, inspect actual existing compose wrapper paths and preserve rollback wrapper/images. Add final digest overlay without losing server env/Caddy/storage settings; reviewed additive migration only, no seed. Then coordinated API/worker/web rollout and ready-health/hosted checks. Approved new film11111 still needs standard scan/clearance/library registration and CMS publication (existing helper/manifest/assets in chat work), guarded against overwriting drafts. TitaniumHome code supplies six paths/hub/sourcing automatically; published home also needs finder block/minimal-header chrome and FAQ where missing, based on current saved CMS state, with service audit/version/revision rollback. No publication success until actual hosted acceptance.
- New160GB disk remains unmounted/partially initialized. Current preparation guard aborted before write on nonzero first64KiB; earlier known blank volume serial preserved. Do not silently override guards or migrate Docker volumes online. Complete guarded storage integration separately once stable; enough root free space was checked before pull (9.1GB observed, pull refuses<6GB initially/<2GB afterward).

### Completed & Tested — owner-approved Redis recovery, DNS cutover and ready health — 2026-10-27 Asia/Tehran

- Provider announced replacement IP in12:45 reply. Connected to the new address using StrictHostKeyChecking=yes and HostKeyAlias for the previously trusted server; identity matched. Updated only apex/www/preview A records in Arvan UI; authoritative DNS returns the new IP for all3. Mail/MX/TXT/NS/proxy state unchanged. No purchase; DNS download/upgrade modal dismissed. Screenshot proof saved in chat outputs. User explicitly requested sending the latest reply; posted one factual16:06 follow-up confirming DNS/IP and observed intermittent connection, verified posted text/empty composer; no ticket closure/rating.
- Corrected diagnostic attribution: official RDB tools successfully verified BOTH snapshots (checksums valid). Earlier Docker-created checks had not reached Redis because the image entrypoint attempted permissions on read-only mounts; corrected with direct tools/exec. Some later timeouts occurred during checker processing, not SSH disconnection. Do not conflate these causes. Temporary Preview test resources/limits restored after isolated tests.
- Tested valid AOF prefix (110453 commands, balanced11839 MULTI/EXEC; copy only discarded13630925 bytes) in isolated memory: PONG,81339 keys, event wait/active/delayed/failed0; only7 scheduled jobs. Then tested the newer validated dump snapshot (2026-10-26T07:34:06Z /11:04 Tehran) as fresh AOF base: PONG,85443 keys, event queues0 and7 scheduled jobs. No new local builds or repeated completed UI tests.
- Fresh PostgreSQL custom backup479069 bytes validated with pg_restore catalog691 entries, SHA256b9fe8cb351d00a8458304f18282e7bb02fd4b7ade8dbcb2884cfd9df87d153b3; fsynced. Durable outbox baseline79 DONE, no pending/processing/failed events. Backup private in final-05b1060 release candidate; no secrets/data committed.
- Owner specifically approved restoring Redis to the newer healthy snapshot after impact explanation. Acquired /run/lock/hedax-deploy.lock; stopped worker, prepared/fsynced snapshot as fresh AOF base, atomically retained the entire original AOF directory under T0745/owner-approved-live-originals and installed new AOF directory with original ownership. Original dump and off-host4-file backup unchanged. Started existing Redis; real API readiness200/ready with database/redis/storage/scanner up and fresh signatures28166. Restarted worker; both running/restarts0. No primary database data changed by this recovery. Approval/cutover receipt is private on server.
- Next unfinished action: pull/verify final05b1060 digest-pinned images once, apply reviewed additive schema with fresh backup/rollback, roll API/worker/web coherently, publish approved builder/media without overwriting drafts, verify hosted FA/EN/admin/finder/media. Complete new160GB disk initialization/mount only under guarded identity/content checks; previous partial initialization still not a valid mounted filesystem. Do not redo GitHub integration/CI/images or Redis recovery.

### Blocked External — brief recovery followed by SSH failure; console clarified — 2026-10-27 Asia/Tehran

- Owner reported fixed/entered console, later clarified this means the Arvan management panel, not a logged-in guest terminal. No separate guest console is available in current browser inventory. Do not ask for the account login again or treat panel login as server recovery.
- Initial07:45UTC SSH/readiness probe succeeded quickly: public home200≈0.23s; database/storage/scanner up, Redis still down/readiness503. Guest uptime20min (not rebooted by this task), I/O full avg300≈0.37–0.65%. Later calls again timed out at banner exchange, so no sustained recovery established. No new IP confirmed; support refresh pending.
- Important observation: earlier T0710 candidate directory still exists but its original files/working copy were absent after this reboot; no cause inferred. Off-host4-file backup remains verified and safe. Created new T0745 candidate from live original Redis bytes with all4 expected SHA256 matches; explicitly fsynced every preserved original file and backup directories before copy-ready output. Its official Docker-check command again exceeded the bounded window, with no RDB/fix result established. Do not rerun the same creation script or overwrite candidates.
- New volume preparation preflight aborted BEFORE formatting because its first64KiB are no longer zero, consistent with prior interrupted initialization but not an independently established filesystem. Read-only inspection found neither of the earlier UUIDs nor label in firstMiB; no recognized filesystem signature. Backup-superblock inspection exceeded its window. No formatter/mount or original disk mutation performed this turn; do not bypass identity/content guards blindly.
- Attempted recovery validation only on copies in an isolated tmpfs scratch inside existing Preview Redis container (no connection to its6379 data): original-read hashes, separate test port16389, no host-exposed port, memory margin preflight and owned-path cleanup. Bounded call timed out with no output; no successful checks, startup or repair claimed. Once SSH recovers inspect any /dev/shm/hedax-recovery-* scratch and isolated16389 process carefully before cleanup; never stop Preview6379 or delete its persistent volume. This diagnostic made no intended change to live Redis data, but completion/cleanup remains unverified.
- Next depends on actual stable guest access/provider IP response. Preserve both off-host backup and all original live data, inspect current diagnostics/logs, obtain tested recovery impact before requesting any live data-loss approval, then readiness/backups/final05b1060 rollout. Code/images already complete; no new build, live repair/start, deployment, DNS/IP change, reboot or support message performed.

### Completed & Tested — verified Redis originals preserved; Blocked External — recovery test/storage/network — 2026-10-27 Asia/Tehran

- Owner again asked to accelerate publication if disruption has cleared. Fresh health probe at07:04UTC: public FA/EN200 in0.23–0.34s, but root journal jbd2/vda3 in D-state, iowait21% in one vmstat sample and I/O full avg10≈6%. Redis remains stopped/restarts84. Later SSH attempts failed at connection/banner exchange. No evidence of sustained recovery; no rollout/repair applied.
- Completed full off-host SFTP preservation of4 original Redis files (incremental AOF, base RDB, manifest, dump), total94,418,554 bytes in private chat work/redis-recovery-20261027/original. Read SHA256 from stopped Production Redis volume; every local file matches its server SHA256. Receipt saved privately outside Git. These contain sensitive operational data: never commit, attach to support or upload elsewhere without specific authorization.
- Also created/hash-verified a separate on-server original backup under /opt/hedax-release-candidates/redis-recovery-20261027T0710/original and a disposable working copy. Original live volume remains untouched. Bounded server test copied/verified all originals but timed out after announcing the copy; official RDB check/fix outcomes are UNKNOWN. Do not repeat that script (it refuses an existing candidate), do not assume working repair succeeded. Inspect private logs and any auto-removing redis-check containers once SSH recovers. Checker mounts original backup read-only; any attempted --fix is scoped only to the disposable working copy, not live data.
- Local non-mutating RESP analysis corroborates the exact first error offset10882123 after110453 parsed commands in24,513,048 bytes.13,630,925 bytes remain unparsed, mostly non-zero; do not call all of that disposable garbage or assume trimming it has no consequences. Official checker/runtime validation and a concrete impact decision are still required.
- To avoid loading the host, attempted isolated local Docker verification. Docker Desktop was initially stopped; started via its installed CLI. Redis image refresh failed twice with unexpected EOF; an old cached8-alpine tag exists. Local test failed BEFORE any Redis check because Docker Desktop's WSL bootstrap failed (0xc00000fd); this is an environment failure, not a failed RDB checksum. Stopped Docker Desktop afterward. No test container/working repair success claimed. Test copies/logs remain private outside Git; no Production data uploaded to a registry or GitHub.
- Provider ticket still has no newer response/new IP, and actual VM details still show the existing IP. Temporary read-only server-details browser tab18 was opened; close it after use. No support message, IP/DNS change, reboot, new formatter/mount, live Redis repair/start, backend rollout or CMS/media update performed this turn. Final source/images05b1060 remain verified; no builds/tests repeated.
- Next: regain stable host access, inspect candidate test logs/processes and read-only validate both RDB snapshots; complete and test recovery on a COPY. If any method drops Redis queue/limits/budget records, explain the actual tested impact and obtain specific owner approval before live application. Preserve original/off-host backup regardless. Then stable ready health/verified fresh PostgreSQL backup, final pinned image rollout and hosted acceptance. Do not substitute quick home200 for release readiness.

### Completed & Tested — bounded health recheck; Blocked External — readiness remains failed — 2026-10-27 10:18 Asia/Tehran

- Owner asked to recheck once and publish if stable enough, plus read the support response. Two bounded read-only SSH checks completed. Production FA/EN home HTTP200 in0.27–0.37s; SSH responsive during this observation. Internal API readiness remains503/not-ready with Redis down; database/storage/scanner up and signatures fresh. Redis still deliberately exited/restarts84 after corrupt-AOF loop; no restart/repair performed. Better connectivity is not recovered readiness.
- Root disk88%/9.1GB free; new160GB vdb still has no filesystem/mount. No D-state processes in the second snapshot; two vmstat samples had0%iowait and2–4%steal, but I/O pressure full avg10 was16–27% and avg30036–40%. Storage stability and safe new-volume completion remain unverified. No formatter/checker, filesystem write, data copy/move, container change or deployment in this turn.
- Refreshed existing support ticket: still open/waiting, last provider reply09:48 offering IP replacement and last owner-authorized reply09:56 requesting it. No newer provider response/new IP or completed cutover announced. No additional message sent; no DNS/network changes.
- Continue only from this checkpoint: final05b1060 source/images are already verified; no repeated builds/tests needed. Still require stable I/O, a valid verified new-volume mount, preserved/hash-verified Redis originals and safe tested recovery (separate approval for any unavoidable data loss), then real ready health before final rollout/hosted acceptance. Do not deploy merely because home pages return200.

### Completed & Tested — owner-authorized IP replacement request sent; Blocked External — provider action — 2026-10-27 09:56 Asia/Tehran

- Owner asked to recheck health, read the new provider reply and respond with the appropriate action. Provider's09:48 reply reports no infrastructure/firewall issue found but confirms disruption/packet loss on the current public IP and offers replacement. Linked check-host report was inaccessible via web tool; do not claim independently reproduced report results.
- Under the owner's explicit instruction, sent one reply at09:56 approving replacement of only this VM's public IPv4 while preserving the same VM, both disks and all data; requested new IP/timing, temporary retention of old IP if possible or advance cutover notice, no reinstall/deletion, and notice before extra charges or other actions. New posted message and empty composer verified. Feedback modal dismissed without rating/closing ticket. Screenshot receipt saved in chat outputs. IP change has only been REQUESTED; no new IP received or DNS/SSH endpoint changed yet. Do not keep probing the old IP after provider confirms cutover.
- Latest bounded read-only observation at06:25UTC: no formatter process listed, but vdb still has no valid primary superblock/filesystem/mount; fstab contains no new mount. Read-only filesystem check canceled at its time limit after attempting backup superblocks; no repair performed. Original Redis files listed (incremental AOF24,513,048 bytes, base RDB33,384,692 bytes, dump36,520,686 bytes), Redis exited/restarts84. I/O full avg10=23.32; storage stability and valid new filesystem remain unestablished. No further format/mount/copy/repair/deploy in this turn.
- Next: obtain provider's actual new IP and verified identity, coordinate domain A records/any applicable allowlists and SSH target without disabling host-key verification, then retest network plus storage separately. Packet-loss remedy does not prove Redis or filesystem recovery. Only after stable I/O, verified new-disk initialization/mount and preserved/hash-verified Redis backup/recovery may final05b1060 images be deployed. No repeat code/build work needed.

### Blocked External — final storage observation and handoff — 2026-10-27 Asia/Tehran

- Last bounded volume observation: the second mkfs.ext4 process remained in D (uninterruptible I/O), PID54401, elapsed1m49s; lsblk still showed no filesystem/mount and fstab had no /srv/hedax-data entry. Read-only e2fsck warned the device was in use; its bounded observation did not establish a valid filesystem. Do not run another formatter, checker, mount, data move or deployment while this process/storage stall persists. The new blank disk only was touched; original root/database/Redis volumes were not reformatted or replaced.
- Redis remains manually stopped after its repeated corrupt-AOF boot failure; restart policy was not changed. Preserve original volume and any earlier partial copy; a complete verified Redis backup has not been established. This is a recovery pause, not restored readiness or completed publication. No further server reboot performed by this task.
- Public TLS probe in Python reported an expired chain; certificate-only OpenSSL inspection showed the leaf certificate dates2026-10-12 through2027-01-10 for the correct hostname. Therefore leaf expiry is NOT established and no renewal/security/configuration change was made. Public curl timed out. Do not bypass TLS verification or claim TLS acceptance passed.
- GitHub main05b1060, CI40459616898 and all4 image builds40459628776 are successful. Anonymous registry verification confirmed all4 manifest/config digests and revision labels, digest-pinned overlay at chat work/final-release-images.yml and receipt work/final-release-receipt.json. Exact source tree matches reviewed PR48; no open PRs remain. Both agents' completed application work is consolidated, local user spreadsheets preserved. Publication and hosted acceptance still pending stable storage, verified backup and a concrete safe Redis recovery.
- Next action: wait for provider's technical response in the owner-approved incident or new evidence of actual host/storage recovery; then inspect pending formatter/process state before any new initialization, validate the blank volume safely, persist its verified UUID mount, copy/hash original Redis files and test recovery on a separate copy. Explain any unavoidable queue/session/budget loss for explicit owner approval before applying it. Build/tests/registry verification need not be repeated without code or artifact changes.

### Completed & Tested — reconciled main and verified final images; Blocked External — host/Redis/storage recovery — 2026-10-27 Asia/Tehran

- PR48 exact head95485f6e56fd800806c8564c551c9d8d2d6ffb05 passed CI40459249874 completely and merged with expected-head guard as05b1060841c810c29dba7b43148d2b7030ea0536. PR42 automatically marked merged through that ancestry. Main CI40459616898 SUCCESS. Remaining outdated PR16/20 were closed as superseded by the later fitment/assistant implementations already in main; branches were preserved. No open PRs remain; original VS Code modified workbooks untouched.
- Release images40459628776 SUCCESS for all4 targets on05b1060. Anonymous GHCR manifest/config SHA256 and revision labels independently verified for every image; local private receipt and digest-pinned overlay saved outside repository. No production pull/deploy/import/media publication yet. GitHub package-version API lacked read:packages; no access expanded, anonymous registry verification used instead.
- Real API readiness503: database/storage/scanner up, Redis down. Redis restarted84 times with the same AOF corruption offset10882123. Reversibly stopped only the failed Production Redis container to preserve originals and end its restart loop; existing unless-stopped policy unchanged, no repair/truncate/delete. I/O pressure subsequently dropped in one sample but host stability is not established. Further live recovery must retain originals and get separate owner approval for any unavoidable queue/session/budget-data loss.
- New160GB volume attached and identified in guest by unique serial/size; no signatures or mount and first/last64KiB all zero. First initialization exceeded its bounded limit; no pre-existing data affected. After stopping the Redis loop, a second guarded initialization without discard reached superblock accounting but also exceeded its limit. Do not repeat initialization or claim a mounted filesystem. Read-only process/filesystem/mount verification is pending; retain its observed UUID/state and wait for stable storage before further writes. No existing disk formatted, moved, deleted or data directory switched.
- Owner explicitly authorized support follow-up; posted once at09:46 Asia/Tehran in the existing incident and verified new text/empty composer. Included observed I/O pressure,503/Redis-down and attachment progress; requested preservation/no reinstall. No additional reboot or support message authorized by this entry. Browser console button opened only a duplicate details tab, which was closed; no guest console obtained.
- Current blocker: stable storage plus safe Redis recovery, verified fresh backup and mount verification precede any rollout. Final ready code/images remain available. Next: inspect in-flight read-only filesystem check; if host recovers validate new blank volume before persistent mount, preserve/hash Redis originals, investigate/test recovery on a copy, then explain any unavoidable loss for a concrete owner decision. Do not redo merged implementation/CI/images. The user's full publication objective is not complete.

### Implemented Pending Verification — reconcile completed branches and prepare combined release — 2026-10-27 Asia/Tehran

- Owner explicitly requested health inspection first, attaching the already purchased disk, consolidating both agents' GitHub work and publishing all completed changes while preserving the new design. No new purchase or destructive data recovery authorized by this instruction.
- Inspected main58a8590 (PR45 titanium, PR46 admin and PR47 honest external RAG status merged). Compared feature/iran-vehicle-finder ff6c464 with main: all finder/application/schema/dataset changes already incorporated; only seven later history/workflow commits remain. Merged that branch into deploy/reconcile-all without conflicts: only images.yml and dated incident notes added, preserving current titanium/admin code. The original VS Code checkout's three modified Excel templates remain untouched.
- Initial read-only health probe reached the host: root disk88% used, 9.1GB free,8GB RAM with4.1GB available; existing Production/Preview containers running. Redis had recently restarted, so container green alone is not a stable-readiness claim. Follow-up bounded checks pending. No heavy build on this host.
- Purchased160GB volume found available/unattached in provider panel; initiated attachment to the existing server. Must verify final provider attachment and guest device identity/signatures before initializing or mounting anything. No existing filesystem formatted, moved or deleted.
- Release plan: establish stable health/storage and verified fresh backup; finish exact-head CI and off-host matching API/worker/web/tools images; controlled Preview acceptance, then owner-authorized Production rollout with rollback and hosted FA/EN/admin/media/finder checks. If host I/O stalls recur, stop writes and report the concrete blocker rather than claiming release.

### Completed & Tested — authenticated Arvan inspection; Implemented Pending Verification — honest remote RAG status — 2026-10-27 Asia/Tehran

- Owner completed Arvan login. Read-only provider inspection confirms the existing AI gateway has a connected knowledge base; the managed knowledge base and its database show active. No new service, credential, provider setting, purchase, upload or paid model/embedding request was made. Original-upload list alone cannot establish indexed vector contents. Production runtime endpoint/key/model and end-to-end retrieval remain unverified while the site refuses connections and SSH is unavailable.
- Corrected the prior overstatement that external RAG is disconnected: local code retrieves catalog products and does not automatically sync reference documents, but the gateway can independently attach RAG. Status now distinguishes unsynced local files from UNVERIFIED external knowledge; the settings explanation and regression expectations match. Branch fix/arvan-rag-status based on43fd561; no Production change.
- New status unit tests:3 passed. Targeted assistant diagnostics browser acceptance passed (last-run status passed, no failed tests). Web typecheck/message completeness and targeted ESLint completed with exit0. Earlier panel acceptance and full PR46 CI are retained, not repeated.
- PR46 release bundle download completed; all three SHA256SUMS entries verified by streaming hashes, exact e7c1135 revision and matching four image tags checked. Local receipt confirms completion. This existing bundle does not include the small RAG-status follow-up. Production rollout remains blocked on stable host access and safe Redis recovery.
- Next: finish focused validation, commit/push the RAG-status correction and track its CI; keep actual live RAG verification and rollout explicitly pending until server recovery. Do not rebuild the already completed admin sections or create replacement Arvan services.

### Completed & Tested — PR46 merged, remote CI/builds green; Blocked External — live rollout — 2026-10-27 Asia/Tehran

- PR46 merged with an expected-head guard after CI40452635173 SUCCESS for e7c1135a038da47b1dfe61542ce43eb7a8a2fac8. Merge/main is43fd5619a53543fefa15005287ae189df0d15fb0; `git rev-parse HEAD^{tree}` and origin/main tree both daa975154dbc0afec0feb812b73eda2d4109efda. Main CI40453017845 also SUCCESS. Full remote lint/types/units, catalog/import integration including89/99, CMS/builder integration, backup/restore drill and Production web build passed. Prior local functional tests were not repeated.
- Image build40452630956 SUCCESS on e7c1135. Artifact12711800305, `catalog-release-images-40452630956`, 1,186,230,683-byte ZIP, expiry2026-10-30UTC; metadata archive digest2af74ab69248f12ee535486bf93b6a5a1364fa6ca396e48e80f2ca88265f421f. Workflow checks all four revision labels, exports matching API/worker/web/tools plus images.yml/revision.txt/SHA256SUMS. No automatic deployment. Use this bundle for the combined reviewed titanium/admin code; do not mix new web with old API.
- Local download is IN PROGRESS, not checksum verified: `gh run download40452630956 --name catalog-release-images-40452630956 --dir ../catalog-release-e7c1135`, unified session49361, gh PID15920 at08:33. Last observation≈142.5MB written and C:≈7.8GB free; final extracted target not yet populated. Do not start a duplicate download or delete its temp data. On continuation poll the existing session/process, then stream-check every SHA256SUMS entry and exact revision. Hosted artifact success is not a claim of verified local bytes.
- Local branch now `deploy/catalog-46` tracking origin/main at43fd561; feature branch preserved at e7c1135. Only PROGRESS and Next-generated next-env/tsconfig remain modified; local review caches/film assets are untracked and excluded. PR description updated with exact successful checks, tree equality and the remaining production/AI limits. VS Code prompt in chat outputs updated to preserve merged PR46 instead of calling it unfinished work.
- Two bounded read-only SSH attempts in this resumed turn timed out connecting to port22. No restart, Redis truncate/repair, migration/import, CMS/media update, application replacement or live AI call was performed. Root cause/recovery requires stable server access; prior Redis corruption and backup-verification limits still apply. Production remains unchanged by this task.
- Arvan AI browser access redirects to account login (expired session). A separate retained login tab14 was prepared; user was asked to sign in directly, without sending a password in chat. No answer/authenticated session yet. Do not claim the purchased RAG resource inspected or connected. Panel diagnostics are implemented, real external RAG remains blocked on login/runtime access.
- Precise next: verify the existing download when complete; after actual host recovery inspect current live versions, Redis/readiness, disk and fresh backup without repeating completed CI. Resolve Redis safely with preserved originals and separate owner approval if data loss is unavoidable. Then roll out matching reviewed images with rollback and hosted FA/EN/admin/media acceptance; register/publish owner movie through the existing scan/clearance/CMS services while preserving drafts. After Arvan login inspect the existing resource and runtime configuration before any scoped paid connectivity test. No further implementation redo is needed for this panel milestone.

### Implemented Pending Verification remotely — PR46 and immutable image build — 2026-10-27 Asia/Tehran

- Resumed exactly from staged, locally verified work; prior functional tests were not rerun. Actual local branch/base reconciled: fix/admin-catalog-workflows on6d96c7a, origin/main still6d96c7a. Committed26 reviewed files as e0a48a903203c64902de1cda26d19b939efd8614 and pushed. Opened/attached PR46 (ready for review, not merged).
- Added the new catalog-reference integration suites89/99 to CI's existing vehicle/import integrity step so the new regressions run remotely. Added an off-host release image workflow packaging matching API/worker/web/tools, revision labels, Compose image overlay and checksums, with3-day artifact retention and no deployment or secrets. Committed/pushed as e7c1135a038da47b1dfe61542ce43eb7a8a2fac8. GitHub accepted both workflows; initial local YAML-parser probes lacked an installed parser and are not a claimed verification.
- Current PR CI40452635173 is in progress: locked install, Prisma generation, API/shared build, full lint and full type checks succeeded; unit/integration/backup-restore/production web build still running or pending. Image build40452630956 is in progress on the same head. Earlier e0a CI runs were already completed when cancellation was attempted; no rerun was requested. Do not substitute older-head results for e7c completion.
- Production SSH probe times out connecting to port22. No restart, Redis repair, source checkout, data/CMS change or deployment performed in this resumed turn. Prior source/backup/image assets remain preserved; current host/Redis recovery is still required before any rollout. Local review3297 returns200; dev-only Next-generated config and local cache/film-review assets remain uncommitted and excluded.
- In parallel, read-only inspection of the owner's existing Arvan AI service began in a separate hidden browser tab; no purchase, credential exposure or paid model request. Actual external RAG integration remains unverified.
- Next: finish CI/image build, resolve any concrete failures, verify the final artifact checksum/revision and merge only the exact successful head. Then use a stable server health/backup/queue gate for combined release; do not claim Production deployment or live AI/RAG connection while inaccessible. Record final PR/CI/artifact status here without secrets.

### Completed & Tested locally — consolidated parts/reference panel — 2026-10-26 Asia/Tehran

- Owner explicitly resumed panel work while server recovery/reviewed titanium publication remain external blockers. Local branch `fix/admin-catalog-workflows`, inspected base/main6d96c7a. Existing WIP completed without touching the separate VS Code checkout or Production.
- One sidebar entry and permission-aware `/admin/catalog` hub now consolidate parts, spreadsheet imports, reference sources, vehicles, brands, units, stock and photos. Three primary links stay visible; other tools are disclosed. Existing routes retained. Read-only product staff cannot edit/submit or see import/create actions.
- Real CRUD fixes: editable/deactivatable categories/makes/manufacturers, unused-only deletion with reference guards and category cycle prevention; product archive confirmation and restore retaining stock/history without republishing/enabling sales; product/reference pagination/search; reference title/version edit, optimistic timestamp checks, processing/in-use deletion guards, row locking, retained storage bytes and audit. Extracted rows beyond100 accessible; unsupported PDF/photo extraction and manually faked pending status explicitly rejected/explained.
- Vehicle form now actually controls finder visibility, group links, make and aliases. Trim editor supports bilingual names, supplier/supply, calendar/years and a required HTTPS source for changed years. Staff sources are secondary references, not an automatic verification claim. Existing schema fields reused; no migration. Failed model edits retain entered values. Part form validates packs/specs/year calendars, accepts Arabic/Persian digits and avoids duplicate creation after partial photo/publication failure. Spreadsheet upload starts are guarded against concurrent submissions.
- Assistant panel now reads separate runtime configuration gates and explicitly labels mock/configuration versus verified connectivity. Actual code still retrieves only product facts; external Arvan RAG/reference-file retrieval remains unconnected. No paid call/key/provider change or actual connectivity claim.
- Verification: API/web typecheck exit0, message completeness1190 keys/111 audit actions, targeted lint exit0; contracts22/22 and assistant/catalog units9/9 pass. Disposable PostgreSQL integration89/85/92/99:26/26 pass; after final reference guards integration85/99:15/15 pass, teardown exit0. Browser acceptance15/15 pass including FA/EN390px/no-overflow, workbook mappings, stale catalog edit/delete, manufacturer guard, finder group fields, failed photo continuation and read-only role. UI tests use explicit fixtures/stubs; durable persistence comes from the actual API/DB integration tests.
- Test tooling: local API dependency junctions reuse installed packages read-only with local workspace links; Prisma generated only into this checkout. Initial API typecheck lacked dependencies; resolved. Turbopack could not resolve reused external packages; local webpack dev used instead. Initial two UI failures were outdated expected action labels/alert role; updated to the actual task routes and success message, final run passes. No claim of full production build/remote CI yet. Next-generated next-env/tsconfig changes and `.next-panel-*` cache remain local only, excluded from release.
- User-facing screenshots in chat outputs show the workspace and actual trim fields; local review3297 is labelled sample data. Source/runbook details in docs/ADMIN_CATALOG_WORKSPACE.md. Next: commit/push isolated review branch; leave Production unchanged until current host/Redis recovery and titanium release are complete, then API/web rollout together and hosted acceptance. External Arvan RAG integration still needs actual resource/runtime verification.

### Blocked External — renewed release authorization, Redis corruption and repeated loss of SSH — 2026-10-26 17:10 Asia/Tehran

- Owner reordered work: publish the already reviewed titanium design/new opening film first, provide a VS Code prompt to integrate its work into the new template through publication, then resume administration consolidation and assistant/RAG review. Production publication explicitly re-authorized; no new approval needed for that reviewed rollout. Do not include the unfinished admin branch in the design release.
- SSH briefly returned around13:27UTC. VM uptime47min, disk88%/9.2GB free, API/web/Postgres running; Redis restarting exit1. Direct API readiness: database/storage/scanner up, Redis down; scanner signatures fresh. Redis log confirms corrupt incremental AOF at offset10882123 (file24513048bytes); PostgreSQL health does not prove queue recovery. No redis-check-aof --fix, truncation, deletion, restore or additional reboot performed.
- Initiated a private copy of Redis files under a separate recovery candidate and a read-only AOF checker, but SSH stalled before any output; backup completeness/hash verification is NOT established. Preserve both original volume and any partial recovery copy. Interrupted local copy/check and prefix-verification SSH clients after further banner timeouts; inspect for orphaned remote readers before retrying. Bulk image transfer did not resume to a verified completion. No Docker image load, source checkout, migration/import, media registration or application rollout performed. Public home subsequently timed out too.
- Provider human reply at16:40 claimed resolution. Owner explicitly approved a new follow-up; submitted once to the existing incident at17:05, describing actual Redis AOF corruption/readiness failure and recurrent SSH banner timeout, requesting host/storage/boot inspection while preserving data/no reinstall. Verified new posted message and empty response box. Do not send another message or close/rate the ticket without authorization. Screenshot receipt stays in private chat outputs.
- Completed: VS Code release prompt saved as a user deliverable in this chat outputs. It preserves main/PR45 design and latest CMS, prevents concurrent deployments and forbids unreviewed Redis data truncation. Local git archive of reviewed6d96c7a is prepared outside checkout; sha256ccb076ac6b6f1e700c988ee1184e62877767f5f213dca346590ed33e83d33f9b. New WIP branch `fix/admin-catalog-workflows` still based on6d96c7a. Release must use reviewed artifact/commit, not current dirty source.
- Implemented Pending Verification (NOT RELEASE READY): preliminary catalog workspace navigation component and sidebar consolidation; catalog metadata edit/delete contracts/controller/service with expectedUpdatedAt conflict guard, pending-processing/in-use deletion guards, audit and retained storage bytes. Frontend edit/delete forms, permission-specific workspace landing, tests and lint are unfinished. Changed files: shell.tsx, catalog-workspace.tsx, contracts/admin.ts, knowledge-catalog controller/service. No commit/push of this WIP. Preserve earlier unrelated local-review untracked assets/cache.
- Assistant read-only finding: Arvan Chat Completions adapter and budget gates exist in source. Current retrieval only calls CatalogService for product facts; catalog document chunks/external Arvan RAG are not consulted. Actual runtime credentials/provider connectivity and the owner's purchased RAG resource remain unverified. Do not claim live AI/RAG connected from code or mock tests.
- Next: obtain stable SSH and inspect provider response; confirm private Redis copy is complete, hash-match originals and run checks against a separate copy. Prepare/test recovery without touching originals; explain any unavoidable queue-data loss and obtain owner approval before destructive repair. Establish ready services/fresh verified backup; then complete reviewed titanium transfer/checksum/load, additive schema/verified dataset/media publication and controlled rollout/rollback acceptance. Afterwards resume admin workflow CRUD/consolidation and actual Arvan AI/RAG configuration review.

### Blocked External — guest remains unreachable after hardware reboot — 2026-10-26 Asia/Tehran

- Owner-authorized hardware reboot completed in provider panel; VM status returned to on. Subsequent SSH probes still timeout/refuse before authentication and HTTPS remains unavailable. Attached default firewall reviewed read-only and does not block the tested ports. No security, network, password, disk or billing settings changed. Cause inside guest/host not proven without boot console.
- Owner explicitly authorized sending the reviewed support message to Arvan to inspect boot/storage/physical host while preserving all disks/data and forbidding reinstall. Completed & Tested: existing matching open incident ticket found; the exact owner-approved follow-up was submitted once at16:20 Asia/Tehran and verified as a new message with an empty composer. Ticket remains open/waiting; only the earlier automated assistant reply was present. Private receipt/link is retained in this chat outputs, not public documentation. Production rollout still not performed.

### Implemented Pending Verification — owner-approved hard reboot — 2026-10-26 16:06 Asia/Tehran

- Software reboot did not restore SSH or HTTPS. Dashboard initially selected Bamdad (no server there); actual hedax VM remains in Forough. Provider reports on while guest SSH times out. No firewall, password, plan or disk change made.
- Owner explicitly approved hardware reboot in response to the separate confirmation explaining a power cycle. Executed Access tab → Hardware restart → confirmation once around12:36UTC. Provider now reports restarting. Await new boot and service recovery before deployment; do not repeat reset while pending. Final web artifact is downloaded locally and PR45/main remain ready; no image load, migration/import or application rollout yet.

### Completed & Tested / Production rollout pending — PR45 merged and owner-approved VM restart — 2026-10-26, Asia/Tehran

- All final candidate checks passed: CI40286179798 and web-image build40286175542 for `e48520037db8b8cd2e2a6adcfcceff1a6576fd64`. PR45 merged to main `6d96c7a75a970a51f2c3c438387097c4882edb81`. Tree `f27d611397370d6cd23462ac6c59ac7b493de0c1` matches the reviewed local source; local frame-colour commit `4c1999e` was recreated through the connected GitHub API with exactly the same tree because the SSH proxy failed. No force push or unrelated checkout reset.
- Current local branch `deploy/titanium-45` tracks origin/main. API/worker/contracts/domain/database unchanged from full image candidate5b3d2ff (diff verified); final web artifact12633908945 is110,985,336 bytes. Full bundle locally verified/downloaded, transfer to server partially resumed after matching prefix SHA; no Docker load/migration/import/application rollout yet. No user data or existing CMS document changed.
- Owner explicitly approved one controlled whole-server restart after repeated SSH/banner failures and host I/O stalls. SSH reboot command did NOT execute (banner timeout). Used the already-authenticated Arvan panel, verified the single hedax VM against the configured host, selected Restart → software reboot and confirmed once. Panel now reports «راه‌اندازی مجدد»; SSH remains unavailable while the request is pending. Do not issue another reset/power operation without checking this one. Owner asked to open Arvan here and the authenticated dashboard was shown.
- New11111 video actually played in local development review on desktop and mobile: ready4, pausedfalse, looptrue, cover fit, full viewport width, 320px at1280 and170px at390, no horizontal overflow; mobile file correctly chosen. Review screenshot in chat outputs. Local helpers/assets are untracked and excluded from release. Production movie still awaits standard scanned library registration and publication.
- Next: wait for the already-approved provider reboot to finish, verify new uptime/health/readiness and unchanged live images; resume/verify full image transfer, download/copy final web artifact, then perform guarded migration/import/media publication/rollout with saved rollback and hosted acceptance. First return the current service to health if the reboot does not complete. Production publication is NOT yet complete; never claim it is.

### Implemented Pending Verification — unified administration and replacement film — 2026-10-26, Asia/Tehran

- Production publication explicitly authorized by owner in this chat, with subsequent single-entry Website management. PR45 created/attached: https://github.com/ali-hedax/source-auto-parts-platform/pull/45. Branch candidate `5b3d2ff`: CI40281990054 SUCCESS; immutable full images build40281966240 SUCCESS. No application rollout yet.
- Fresh Production dump verified readable (99 TABLE DATA entries); encrypted offsite copy round-trip hash verified. Old running image IDs/tags and compose wrapper saved in protected candidate rollback files. No credentials or private data in Git/chat outputs.
- Shared host had severe I/O stalls (io some≈100%, full≈85%, rclone D-state), recovered spontaneously; no reboot/build/cleanup was initiated. Transfer of the large immutable bundle reset after~199 MB; resume with verified prefix rather than overwrite. Recheck resource/health gates before any rollout; readiness and public site were healthy before this transfer.
- Unified admin implemented locally using one content.manage navigation entry «مدیریت سایت», organised hub, simplified home editor tabs and effective-only controls. Existing versioned builder custom block `titanium-home-settings` stores bilingual slogans, English typing text, banner heights, gradient/frame colours, six path titles/covers/descriptions/visibility/links, three hub covers/copy/visibility and compact sourcing card. No new schema/API bypass, no direct publish on navigation. Full private preview reuses TitaniumHome; header/mobile/light-footer logos now actually applied. Generic obsolete home palette/layout/film-logo controls hidden. Existing RBAC/draft/version-conflict/publish/rollback retained.
- Owner then supplied Desktop/11111.mp4 and explicitly replaced ONLY opening film. Original24,643,978 bytes,1920x1080,10.04s; FFmpeg re-encoded H264 faststart silent desktop1280x720≈3.98MB/mobile640x360≈1.25MB plus14.8KB poster; source AIGC metadata retained. Local dev-only film review successfully plays actual file (ready4, pausedfalse, looptrue). Latest owner clarified FULL WIDTH moving picture, superseding earlier contain: cover with centre60%, desktop responsive max360px/mobile170px; no fixed side bars. Media must still be registered/scanned/cleared through normal app services before actual Production document publication.
- Admin browser review used isolated DEVELOPMENT FIXTURES only (dummy owner), not Production login. Form opens in design settings, all six paths editable; local save status shown. Fixture handler is stateless, so do not claim durable backend persistence from that UI test. Web types and targeted lint pass locally; final CI pending latest admin/wide-film commit. Private local-review route/assets and dev build cache remain UNTRACKED, excluded from commits/images; they are not a release-media shortcut.
- Next: complete final CI/web image, resume/check/load immutable images within disk budget, guarded additive migration and importer dry run/apply with original inventory/CMS preserved, scan/register/clear new owner film, publish exact updated opening clip with original draft preserved, controlled rollout with rollback and hosted FA/EN/admin/media acceptance. Do not claim deployed until verified.

### Implemented Pending Verification — owner-authorized publication — 2026-10-26, Asia/Tehran

- Owner explicitly approved commit/push and Production publication of the reviewed design, followed by consolidating Content/Appearance administration. First design commit `5bcfe04`; reconciled latest committed finder `fc819d2` in merge `3d06255`, preserving flexible ranked search/contracts and the new home route group while retaining the actually approved titanium header/layout. Separate checkouts untouched.
- Shared production host recovered enough for read-only checks: all current containers running/healthy, public pages200 and readiness200. Latest historical CPU-starvation incident and 87% disk usage mean no heavy build is launched on the live host. Added short-lived GitHub artifact workflow to build immutable images off-host, with checksums/revision labels; no secrets, registry grants, network exposure or automatic deployment.
- Web typecheck passed after rebuilding local contracts. Existing Production remains unchanged while candidate CI/build/backup/migration/rollout checks are prepared. New additive finder schema and verified metadata require explicit review as part of rollout; preserve original CMS documents/media and inventory.
- Next: push branch/create review PR; validate candidate and resource budget, backup/rollback before any rollout. Then complete unified administration and verify only effective controls for the titanium composition.

### Completed & Tested — headline motion and contact refinement — 2026-10-26, Asia/Tehran

- Owner retained the overall design and requested complete film framing, more expressive Persian slogan motion, an orderly contact area, then slow typewriter English beneath it. Opening strip now uses contain for video AND still (no picture cropping), modest desktop height288px at1440 and mobile170px; black pillar space preserves the entire frame. Existing movie sources and playback policy unchanged.
- Persian lines enter in staggered fluid waves with a restrained sapphire/silver light sweep and long readable hold. English tagline types character-by-character over ~6.7 seconds with caret, holds, and repeats. Shared pause displays complete static text; reduced-motion shows static text without effects. Persian letters remain joined.
- Footer now has aligned icon/label/value rows for WhatsApp, phone numbers/extensions, email, support hours and address, followed by ordered WhatsApp/Instagram/LinkedIn/Telegram/Bale icons. Values come from existing content; absent address explicitly says not provided, missing account links are noninteractive labelled placeholders. Other existing networks are retained. Desktop/tablet grid and mobile two-column contacts verified; social targets44px. No invented address/account or remote content writes.
- Verification: final web TypeScript noEmit exit0; targeted ESLint all3 changed TSX exit0 (existing pages-directory rule diagnostic only). Browser1440/390: no overflow, complete-picture contain sizing, new wave/typewriter animation names and changing text reveal width verified, pause restores full text, social targets44x44. Footer screenshot saved in chat outputs. git diff check passes.
- External limitation: current public Preview media endpoint times out; existing opening poster failed to load and playback fell back to still in the local browser. Production fallback for this Preview-owned movie returned403; no replacement movie was invented. Complete framing is implemented but final visible playback with this source needs recheck when the public media endpoint responds. Previous milestone playback evidence predates this source outage.
- Still local branch `codex/titanium-layout` at base `c4453b6`; no commit/push/deploy/remote changes. Review patch refreshed. Next: review latest visual changes, recheck opening playback when source recovers, reconcile newer finder work before any separately authorized release.

### Completed & Tested — local titanium storefront and automotive hub — 2026-10-26, Asia/Tehran

- Branch `codex/titanium-layout`, dependency/base `c4453b6` after fetched main `fe52169`. Separate VS Code finder checkout and its ongoing uncommitted changes remain untouched; reconcile those newer changes before eventual release. Current implementation reuses the committed four-step finder.
- Implemented TitaniumHome, continuous titanium/sapphire surface, approved logo, quiet responsive header, accessible repeating slogan, six illustrated shopping groups, published product/brand collections, four-column footer and matching private builder preview. Existing movies now form full-width looping strips: opening ~259px and closing ~170px at1440; smaller Source-box sourcing invitation immediately above closing film, which directly precedes footer. Preserve CMS visibility/schedules and actual catalogue fields/actions; no remote data writes.
- Latest owner request completed: THREE covered columns after brands and before FAQ: daily car prices (sample names and dash values, no invented prices), magazine/basic technical guide (working native disclosure), popular-video shell (illustrative cover and explicit pending Aparat connection). No live feeds, daily scheduler, video rankings or API integrations enabled. These connections are Deferred Later.
- Web TypeScript noEmit, targeted ESLint for changed TSX and message consistency check passed exit0. Final browser matrix FA/EN at1440/768/390/360 passed: no horizontal overflow, one H1, six groups, three hub cards, four products/finder steps, two films, transparent card interiors, correct hub/FAQ/sourcing/movie/footer order, no hero shopping CTA. All three FAQ disclosures open with nonempty authoritative answers and close; basic guide, mobile language/currency, typing pause/resume and both movie playback/loop behaviors verified. Evidence: chat outputs `titanium-final-acceptance.json`, `titanium-faq-checks.json`, final screenshots.
- Local preview `127.0.0.1:3290` reads public sample Preview data through read-only helper3292, with visible notice; all non-GET/HEAD methods rejected (POST405 verified), no credentials forwarded, no local database or .env copied. Compressed content-length forwarding failure was fixed locally. Owned public media fallback supplies the existing smoke/car film. Neither Production nor hosted Preview was changed.
- Dependencies: offline metadata missing / registry resets caused install cancellation; existing installed packages reused through local junctions and local contracts/domain built. No package or lockfile changes. Next-generated next-env.d.ts is restored before packaging; build/cache/runtime helpers excluded from deliverable. Production build and authenticated/checkout acceptance were not run.
- Reviewable code and generated marketing-only WebP assets retained locally; binary Git patch saved to chat outputs. No push, PR, merge, deployment, migration/import, order/payment, Kling generation or credit purchase. Next: owner reviews local design, then separately authorize any live-feed integration/release after reconciling newer finder work.


### Blocked External — final refinements implemented and tested locally; Preview build blocked by a full server disk — 2026-10-26 09:55, Asia/Tehran

- **Owner scope (2026-10-26, "FINAL REFINEMENT & PRODUCTION RELEASE"):** flexible partial vehicle search with ranked verified/relevant/related results and free-text search; shopping paths + categories at the end before the footer; premium minimal home header with a large centred logo and no header search on the home page; logos/media manageable in Appearance; full tests; Preview; prepare Production but stop at the explicit approval gate. No Production merge/deploy/migration/import without approval.
- **Git:** branch `feature/iran-vehicle-finder`, commit f3b03bc pushed (draft PR #42, not merged), base main fe52169 merged earlier. Changes: API `vehicle-finder.service.ts` (optional steps, `matchCode` ranking: 1 verified MODEL/VEHICLE/GROUP, 2 relevant YEAR_UNCONFIRMED/SOME_MODEL, 3 related OTHER_MODEL/OTHER_YEARS/GROUP_TAG/NAME_MATCH, 4 text only with a typed search; vehicles/models without a group), `catalog.service.ts` (rank filter/order, per-tier counts, `finderMatch` on cards); contracts (`FinderMatch*`, `SearchResult.tiers`, nullable selection vehicle, `FinderVehicleView.groups`, chrome `homeHeader` + `logo` {headerUrl, mobileUrl, onLightUrl, size md/lg/xl, align center/start} with defaults, `DEFAULT_BUILDER_LOGO` in zod-free constants); web: finder form with free-text search + optional steps (vehicle first fills its group, year span from the vehicle's models in one calendar, clear option, typed text kept while a list loads), results grouped by tier with headings/counts and per-card labels, "no verified fitment" note + sourcing link, home route group `(home)` with `HomeHeader` (minimal centred logo; classic bar kept when the page has no visible finder or Appearance chooses classic), `StoreShell`, menu drawer on all sizes with language/currency/account, Appearance «هدر و فوتر» logo fields and presets (draft preview before publish). No database migration in this stage (builder chrome is JSON with defaults).
- **Completed & Tested — local:** unit contracts 22, domain 132, API 112 PASS; full API integration 34 files passed/1 skipped, 168 tests passed/1 skipped (862 s) incl. ranking, partial selections, invalid combinations, typed search, equivalence, logo/header settings (defaults for older pages, presets validated, publish); finder Playwright spec 16/16 (layout order with paths last before the footer, minimal header: centred logo ≥48 px, no search box, scroll state, search jump, menu drawer, classic header on other pages; optional steps, vehicle-first, text-only search, ranked results, empty state, invalid URLs, keyboard, EN, 390/360 no overflow and no control overlapping the logo); typecheck PASS; lint 0 errors (2 pre-existing warnings). Visual review (local fixtures) fixed: navy header vs black film (minimal header now always on the film's ground), search icon hidden under the centred logo on phones (language/account moved into the menu), select resetting typed text when a list finishes loading.
- **Incident — server disk full (owner action needed):** starting the Preview image build for f3b03bc showed `/` at 100% (667 MB free). Stopped the build immediately; its leftover buildx client processes ended a few minutes later. Meanwhile the shared server was overloaded (load ≈37 on 4 vCPU) and the live home page and Preview took >30–40 s to finish; after the build stopped both answered in <1 s again (fa/en/parts HTTP 200) and all Production/Preview containers stayed up and healthy (none restarted). Removed only my own four unused superseded Preview web images (hedax-finder-web 0ceb0dfcb862/b9d1b6b3790e/1b441b0f0b32/1a7ef0ec6f3b; not referenced by any container or the Preview overlay) → 889 MB free (99%). Docker reports images 70.7 GB (14.7 GB reclaimable), build cache 9.7 GB (2.9 GB reclaimable); older release/rollback images (pr28/pr29/pr30, typewriter/editorial/hero/pr32 web …) are not this session's and need the owner's decision. Lesson: check `df` before any server build; a build on the shared host also competes with Production for CPU/RAM.
- **Owner decision 2026-10-26 («Cache + old images»), done 06:26–06:31 UTC:** guarded script `/opt/hedax-preview-candidates/disk-cleanup.sh` (log `disk-cleanup-20261026.log`) removed 23 unused old image tags (PR28 candidate/preserved, PR29 rollback copies, PR29/PR30 web, typewriter/editorial/hero Preview web, superseded PR31/PR32/PR35/PR37/smoke web) and 4.0 GB unused build cache; skipped anything used by a container; kept live images (compact-cards web, PR31 api/worker/tools), latest web rollback smoke-polish, backend rollback PR29 api/worker, Preview images, `latest` tags, backup and base images. Disk 99% → 87% (9.9 GB free). Not removed: ~50 older `pre-*`/`pr8-mail`/`before-s3` rollback tags (8–13 days) — owner decision.
- **Incident follow-up (in progress):** after the cleanup the live site answered (<1 s) but Preview returned incomplete responses (Preview web → Preview API connection timeouts logged during the overload; direct check later 200 in 0.4 s). About 10 minutes later both the live site and Preview stopped answering and SSH timed out during the banner exchange (server unresponsive). Nothing from this session was running on the server at that point. Reading the live edge proxy configuration is blocked for the agent. Monitoring availability; owner informed. 10:12 Tehran: both sites answer again (live home 9 s at first) and SSH works; then CPU 97–98% idle and memory free (2.9 GB available, no swap) yet `/proc/pressure/cpu` some avg10 ≈97% and the kernel logged RCU stalls («rcu_preempt kthread gets insufficient CPU time», 06:41 UTC) and systemd watchdog timeouts (06:06, 06:31 UTC) — the VM is not getting CPU time from the Arvan host (throttling/credit exhaustion after today's many image builds, or host contention). Requires Owner Decision: check CPU/steal/plan in the Arvan panel; restart only if it persists. No further builds on this server until it is stable; propose building images in GitHub Actions (or another machine) and only pulling them on the server.
  10:26 Tehran: live 200 in 0.39 s, CPU pressure ≈5%; Preview page still failing (Preview API public 200 in 0.2 s, but the Preview web container kept logging connect timeouts to `api:4000`, 42 in 5 min). Attempted a Preview-only `compose restart web` via the Preview wrapper; the SSH call returned no output (unknown whether it ran) and the live home page again took 40 s — the host stall recurred. Stopped all actions on the server; availability monitor running. Next: once the server is stable (owner checks the Arvan panel / restarts if needed), verify the Preview web container state and restart it alone if it still cannot reach its API.
  10:33–10:36 Tehran — **live site down (no response)**, load ≈72. Diagnosis (read-only): no CPU-heavy process in the VM; `/proc/stat` over 2 s: idle 0, iowait ≈47%, steal ≈16%; `/proc/pressure/io` full avg10 ≈91%; PostgreSQL (jbd2_log_wait_commit), Redis and the ext4 journal (jbd2/vda3) blocked on disk; kernel flush workers waiting in `rq_qos_wait`; Dirty only 7 MB; `/sys/block/vda/stat` showed **zero reads and zero writes completed in 5 s** with nothing in flight — the Arvan virtual disk is stalled/throttled at the host (possibly an exhausted I/O burst allowance after today's builds and cleanup). Requires Owner Decision / External: check the disk and server in the Arvan panel or contact Arvan support; a restart from the panel may be needed. Agent is not acting on the server.
  **Recovered 10:42 Tehran** (no restart of the server by the agent): disk completing I/O again, load ≈1, I/O pressure normal; live /fa, /en, /fa/parts and API 200 in 0.2–0.6 s; all Production containers up with restarts=0 (postgres since 2026-10-21, api/worker since 10-24, web since 10-25), `pg_isready` OK; Preview web restarted by the agent's Preview-only restart at 10:35 (restarts=0, healthy), no more connect timeouts, Preview /fa 200 in 0.5 s. Disk 87% (9.9 GB free). Outage window (approx.): 09:55–10:00 slow, ~10:11–10:42 intermittent/unavailable. Server can reach ghcr.io (401 in 0.36 s) and Docker Hub. Requires Owner Decision: how to build images without loading this server (proposal: GitHub Actions builds and pushes to GHCR, the server only pulls with low priority).
  **Outage continues:** 10:44–11:11 Tehran the live site flapped (502 / no response / slow) with repeated disk stalls (load up to ≈90); from 11:23 TCP 22 and 443 were refused (server restarting or stopped — not by the agent), at 11:32 connections time out. Live site down; owner must check the Arvan panel / support. Agent is not acting on the server.
  **Owner decision 2026-10-26: build in GitHub Actions + public GHCR.** Added `.github/workflows/images.yml` (manual run, or tag `images-preview-*`/`images-production-*`; builds api/worker/tools/web with the site address baked into web; GHA cache; actions pinned by SHA). Run 40288682494 for tag `images-preview-9265a94b385a`: all four SUCCESS; `ghcr.io/ali-hedax/source-{api,worker,tools,web}:9265a94b385a-preview` pullable anonymously (public, linked to the repo). Prepared Preview-only rollout (scratchpad `finder-rollout-ghcr.sh`: refuses <6 GB free, pulls one image at a time with nice/ionice and waits while disk pressure is high, Preview overlay with rollback copy, migrate no-op check, roll Preview api/worker/web, Production identity/document checks). Not run — waiting for the server.
  **Server unreachable since ≈11:23 Tehran (still at 14:00):** owner reported the server was powered back on around 12:00, but from this PC (12:58 onward) HTTPS, SSH and ping time out; DNS still 188.121.125.247; check-host.net from 5 foreign and 6 Iranian locations: TCP 443 connection timed out. Likely network/firewall/IP attachment or services not starting after the restart — owner to check in the Arvan panel/web console (public IP attached, cloud firewall ports 22/80/443, `ip a`, `ufw status`, `systemctl status ssh`, `df -h /`, `docker ps`). **Pending owner request (2026-10-26):** health report (server, disk, containers, database, live site), then weekly automatic Docker cleanup (only old build cache and dangling images, low priority, off-hours, never in-use images or rollback points) and log size limits (Docker json-file limits for containers and journald cap) — nothing to be published before the health report. Blocked until the server is reachable.
  **Full Playwright regression (local fixtures, f3b03bc code):** 69 passed / 11 failed in 33.8 min (dev server under load). Re-running the 6 non-baseline failures alone (assistant excluded paths, staff panel 360/390 px, 404 page, staff and customer sign-in prompts, contact details fa/en): 8/8 PASS → timing under load, not regressions. Remaining 5 = the known pre-existing failures (axe placeholder contrast ×3, site-content pages editor, equivalent-number sourcing) that also fail on the untouched base db363fd.
- **Next:** owner decides disk cleanup; then rebuild Preview images for the current commit (api/worker/tools/web), roll Preview only, move «مسیرهای خرید» to the end via Appearance, update the finder button text on the Preview page, hosted acceptance + screenshots + Core Web Vitals, full Playwright run, release prep (backup/rollback plan) and stop at the Production approval gate.

### Requires Owner Decision — vehicle finder and shopping paths active on Preview home only (branch feature/iran-vehicle-finder, draft PR #42) — 2026-10-25 19:40, Asia/Tehran

- **Owner scope (latest):** activate «انتخاب خودرو» and «مسیرهای خرید و دسته‌بندی قطعات» on the Preview home page only, immediately after the cinematic Hero, in a calm design matching the new identity; test desktop/mobile (beauty, RTL, scroll, function, speed); verified data only; check Appearance controls; before/after images; then stop for approval. No Production change, no merge, no migration/import on the main database. (Supersedes the earlier "shopping paths at the end" placement.)
- **Git/PR:** worktree `Desktop/source-vehicle-finder`, branch `feature/iran-vehicle-finder`, pushed; `main` merged in (no rebase/force push after the first push): ac269da (PR43) and fe52169 (PR44 docs). Draft PR https://github.com/ali-hedax/source-auto-parts-platform/pull/42, not merged. Commits since the previous checkpoint: 1b441b0 (shopping paths read as one area with the finder; fixture order film → finder → paths → new products), a02c910 (Appearance shows only effective settings for the two sections; keyboard test waits for step 3). Earlier CI runs SUCCESS; the PR was briefly CONFLICTING (PROGRESS.md only) until this merge.
- **Implementation (feature, unchanged):** additive migration `20261025120000_vehicle_finder`; finder API `/catalog/vehicle-finder/groups|vehicles|models`; `/catalog/products?group&vehicle&model&year` validated server-side (`VEHICLE_SELECTION_INVALID`); builder kinds `vehicle-finder`, `shopping-paths` (film omits its own paths while the page has the section); results summary/empty state/invalid warning; dataset `database/datasets/vehicles/` (120 records/119 importable, 76 models, 96 sources, 91 official) with `COVERAGE.md`.
- **Design (this stage):** standalone shopping paths take the finder's ground (`--color-paper`), content width and gutters; after the finder there is no seam, only a fine rule inside the content width; compact white cards, the «خودروی من» card no longer a full orange slab (orange icon tile only) so orange stays for the active finder step and main actions; arrows stay inline on phones. The film's own paths band is unchanged. Appearance settings: no picture/alt fields for either section; finder fields named «متن زیر عنوان», «لینک درخواست تأمین…», «متن دکمهٔ جست‌وجوی قطعات»; shopping paths keep only «نام بخش» (screen-reader name, hint explains).
- **Completed & Tested — Preview account (owner-approved option «Reset test account»):** the Preview test owner's previous password was accidentally printed into the agent session while inspecting a private note; with owner approval a guarded script in the Preview tools container (APP_ENV=staging + Preview base URL + exact test e-mail) set a new password and reset MFA, deleted challenges/recovery codes, revoked sessions and wrote audit `staff.mfa_reset`. New TOTP enrolled through the normal staff login form. New password/TOTP/recovery codes/session exist only in this chat's private scratchpad, never in Git/PROGRESS. The server note `hero-a1384f013fc2/owner-login.txt` now holds a stale password. Note: this PC's clock runs ~25 s ahead of the server; TOTP codes must be generated for server time.
- **Completed & Tested — Preview deployment:** current Preview images: api/worker/tools `hedax-finder-*:1a7ef0ec6f3b`, web `hedax-finder-web:a02c91044159` (candidate `/opt/hedax-preview-candidates/finder-a02c91044159`, rollback overlay `images.before.yml` there; earlier candidates finder-1a7ef0ec6f3b/0ceb0dfcb862/b9d1b6b3790e/1b441b0f0b32). Preview DB migrated and dataset imported earlier (dry run → apply → re-check new0; 1 expected conflict: Preview lacks the legacy «پژو / 2008» row). Production container identities and published home document hash identical before/after every rollout.
- **Completed & Tested — Appearance on Preview (normal editor UI):** draft equalled published (version 13) before editing; added both sections with «افزودن بخش جدید», moved with «بالا» to positions 2 and 3; checked controls: visibility toggle marks the section muted and undo restores it, move down + undo, settings show only effective fields, desktop/mobile editor previews; draft autosaved; every original section byte-identical in draft; published with «انتشار تغییرات»; public order now cinematic-hero › vehicle-finder › shopping-paths › new-products › (original sections), originals identical; order persists after editor reload. Evidence: scratchpad appearance/appearance.json, editor-desktop/mobile.png, panel-settings-1/2.png, published-before/after.json.
- **Completed & Tested — hosted acceptance:** `finder-accept.mjs` against https://preview.sourcebyhedax.ir: 42/42 PASS (API lists and server validation, Tondar 90 in two groups, empty selection total0, FA/EN × desktop 1440/mobile 390: section order, paths shown once and not inside the film, open list without overflow, real selection flow → /parts URL with selection, results page, invalid-selection page, no overflow, no page errors). Before/after home screenshots FA/EN desktop/mobile: scratchpad before-after/ (before-*, after-*) and design/r2-* (local fixture review).
- **Performance (read-only measurements, 3 runs, median):** Preview with the sections — desktop LCP 1.13 s, CLS 0.023, finder vehicles ready 0.21 s after choosing a group, search filter 0.04 s; mobile Slow-4G + 4× CPU: LCP 7.98 s, blocking 7.5 s, vehicles ready 4.7 s. No finder API call at page load (vehicles fetched only after a group is chosen). JS transferred 208 KB vs 204 KB on the main site. Reference (main site home, no finder, different content, public read only): mobile LCP 7.25 s, blocking 6.7 s; desktop LCP 0.95 s. Slow mobile LCP/blocking is the known, still-open cold-mobile issue, not introduced here; this was not a controlled A/B, so do not claim the finder has zero cost (desktop blocking 264 ms on Preview vs 33 ms on the main site is unexplained, possibly content).
- **Local tests this stage:** finder spec 20/20 (two repeats) + keyboard 5/5 after the wait fix; finder+fitment 15/15 after merging main; typecheck PASS; lint 0 errors (2 pre-existing warnings). Storefront axe failures are the pre-existing product-card placeholder contrast (also on base db363fd). Full API integration (167 passed/1 skipped) and full Playwright (68 passed/6 pre-existing failures) from the previous checkpoint still apply; no API code changed since.
- **Data (unchanged, verified only):** model/trim/year data only from official sources; years for 6 models (Toyota/Hyundai, Gregorian); IKCO/SAIPA trims without official years have the year step disabled; 28 makes not stated by sources left empty; uncertain equivalences not imported. See `database/datasets/vehicles/COVERAGE.md`.
- **Requires Owner Decision / Next:** owner reviews https://preview.sourcebyhedax.ir/fa and /en. Then (1) approve or request changes to design/placement; (2) decide a source policy for IKCO/SAIPA model years; (3) review uncertain items; (4) Production merge, migration and dataset import only after explicit approval (Production dry run expected: 187 new, 9 matched incl. پژو/2008). Optional: rotate or delete the stale password line in the server note. Leftover folder `Desktop/source-base-check` (temporary base worktree, unregistered from Git) can be deleted manually.

### Completed & Tested — compact New products cards and count suffix removed on Production — 2026-10-25, Asia/Tehran

- **Owner request:** make the oversized homepage New products boxes/text more delicate and compact; clarified explicitly that the “/ عدد” suffix after the amount is unnecessary and must be removed. Continue the existing approved main-site correction/publication workflow; no daily-hub implementation or vehicle-finder changes.
- **Baseline:** fe95a9c main, only preserved uncommitted daily-hub research note. New branchcodex/refine-new-product-cards. MainCI40197945579 SUCCESS; open PR42 Iran vehicle finder and PR16/20 are unrelated and left untouched. Production2f72d3b on deploy/smoke-polish-20261025/imagehedax-smoke-polish-web:322937d33522 healthy. Shared Preview is now another task’s finder imagehedax-finder-web:b9d1b6b3790e; preserve all its current services/data, do not rebuild/release this task there.
- **Implementation:** only New products CSS scope:1.8:1 contained image capped180px (Appearance override respected),16px title/600 weight,13px metadata and code,20px money with smaller currency,16px gutters,48px cart/source action/20px icons, subtle border/8px radius. Current4/2/1 layout and complete product info preserved. Optional hideCountUnit on PartCard is enabled only by the New products renderer and omits Price’s count-unit suffix when canonical unit name isعدد; non-count units and catalogue/detail displays remain, and real unit still goes unchanged to the cart. No price calculation or data changes.
- **Completed & Tested:** initial isolated CSS-only prototype12 cases passed; then actual local Next app against a GET-only cached public-data adapter tested both code and CSS. FA/EN1440/1366/768/390/360 plus two catalogue checks: all12 PASS/exit0. Whole Money text/product titles matched Production per product, New products count suffix absent,20px amounts fit,48px actions remain touchable, zero overflow/page errors; catalogue still has unit labels and72px actions. First-card height reduced26–30percent depending viewport/language. Actual desktop/mobile screenshots reviewed. Evidence outputs/compact-cards-tested/acceptance.json/screenshots; earlier CSS prototype outputs/compact-cards-local. Web typecheck and targeted lint passed. No new repository tests for this cosmetic/label-only change; CI will run its normal suite. Local helper/dev stopped; restore only Next-generated config changes, retain generated cache reversibly under this chat work/card-next-build.
- **Backup before release:** fresh dump99 TABLE DATA verified; checked all current S3 media(private22objects662862bytes/public70objects8264906bytes), encrypted with existing recipient and uploaded to existing backup bucket. Archive9053483bytes; remote-stream SHA256 matched47544b6cf93a21fbd1949680136023ea14a13d1d647a2a840063b67d86b611f1. Protected evidence/rollback /opt/hedax-release-candidates/compact-cards-20261025. No media uploads, data writes, payment or new credentials.
- **Completed & Tested — release:** PR43 reviewed13ed79ffdd4f35db4d6d8a3fa2c1aa50b495ff9e, CI40203849569 SUCCESS; mergedac269da8d1b6ef8c0a0b5964835771738e733cee, mainCI40204116837 SUCCESS. Reviewed/merged trees identical, exact-source Production web build exit0; imagehedax-compact-cards-web:13ed79ffdd4f healthy/restart0, serverbranchdeploy/compact-cards-20261025 atac269da. API/worker/DB/Redis/ClamAV/Caddy and all7 current Preview IDs preserved, expected operational Caddy difference/edge overlay retained. No CMS/API/schema/catalogue changes; published document byte-identical, SHA256087aac5b94b9b7648d9d8f559346383ec26850efb10413b17c7642d307da115e.
- **Completed & Tested — actual hosted acceptance:** FA/EN1440/1366/768/390/360 and both catalogue pages, all12 PASS/exit0,20px amounts fit, New products count labels absent,48px purchase targets, no page errors/overflow, catalogue72px buttons/unit labels retained. Actual main-site desktop/mobile screenshots reviewed. Real fresh anonymous cart added SKU05414022 quantity1 from the compact card, persisted on page/reload, then removed to empty; no checkout/order/payment, script exit0. Evidence outputs/compact-cards-production/acceptance.json, cart-check.json and screenshots. Height26–30percent improvement is the prior-production-to-local comparison, not the post-release script’s self-comparison metric.
- **Resolved — full-disk Redis persistence incident during final checks:** readiness initially503(redisdown) although container liveness washealthy. Diagnosed MISCONF/RDB+AOF write failures: root75G/100percent full;97 images and136 unused build-cache entries. Reused the owner’s earlier explicit authorization to remove ONLY unused Docker build cache. Age>1h filter reclaimed0B; then normal buildx prune--force reclaimed4.57GB. No image/volume/data deletion, restart, Redis protection change or credential change. Redis automatically recovered; readiness200/all dependenciesup, fresh scanner signatures; rdb_last_bgsave_status, aof_last_write_status and aof_last_bgrewrite_status allok. Current, prior rollback and shared Preview images verified retained. Remaining root space3.7G at95percent used; before future builds inspect space and reclaim only authorized cache. Any image-retention/disk-expansion decision is a separate owner-approved follow-up. Do not describe the initial failed readiness as passed; it was rerun successfully after this concrete fix. Anonymous cart check passed after recovery.
- **Continuity:** this requested visual/label fix is complete and live; code committed/pushed/merged, final documentation follows fromac269da with no runtime rebuild needed. Local helper processes stopped, generated config restored and test cache retained under task work/card-next-build. Preserve unrelated PR42/16/20, existing film/playback and shared Preview. Deferred daily-hub research note is preserved below and was committed with this continuity history; it is not implemented or scheduled. No further repeat deployment/acceptance needed absent a new change or failure.

### Deferred Later — three-column daily automotive hub plan (research only) — 2026-10-25, Asia/Tehran

- **Owner scope:** plan for future addition, inspired by the supplied pale three-column/card reference: daily technical/maintenance reading, common-car prices, and popular relevant Aparat videos; all refreshed at one configurable daily time. No implementation, scheduled automation, external messages, subscriptions, data import, merge or Production edits authorized by this planning request.
- **Read-only baseline:** fe95a9c/main documentation follow-up, clean before this continuity note. Existing builder/Appearance/media and worker dispatcher inspected; do not assume an existing news/price/Aparat scheduler or connectors. Latest film release remains complete and must not be repeated. Only PROGRESS.md changed locally for this assessment; no commit/push.
- **Proposed UI/content:** one editable automotive hub after Brands/before footer, three equal desktop columns, stacked on phones; concise sourced maintenance feature,6–10 exact model/trim/year price rows, one featured plus two video links with creator/date/views. Lazy click-to-load official video player (if permitted/tested), no autoplay/download/rehosting of third-party footage. Keep current brand typography/colors and avoid inner-scroll traps. Source links and source publication/update time shown per item; preserve original film/banner.
- **Proposed pipeline:** source allowlist and stable authorized feeds/APIs/provider agreement first; one server-side daily batch at a proposed12:00Asia/Tehran (configurable), bounded retries, dedup/provenance, model/trim/year normalization, explicit source currency and canonicalIRR conversion, per-column last-good cache and honest stale/unavailable state. Use measured source popularity within approved channels/time window; never claim global/top-today popularity from lifetime views. Sourced original summaries instead of full copied articles; vehicle-specific technical facts traceable to manufacturer manuals. Editorial review first, later auto-publish only from approved sources after an isolated trial. Admin source/schedule/pin/hide/override/history/error controls, safe ingestion/sanitization and restricted embed domains; no external fetch on visitor page load.
- **Verified sources/limits today:** Bama https://bama.ir/price accessible with daily-price page; Pedal https://www.pedal.ir/training/ accessible. IranJib actual domestic-price page https://www.iranjib.ir/showgroup/45/ (full canonical title URL in browser research) accessible and explicitly warns updates are temporarily suspended; its source update timestamp predates today. Never relabel an unchanged old source as today's price. Official https://api.aparat.com/ portal accessible but its api-document link returns the same sparse page; reliable supported automated search/ranking not established. Do not promise an integration or reuse rights from webpage readability alone. Earlier guessed IranJib /showgroup/2/price URL failed; corrected via its own homepage link.
- **Future execution stages:** (1) validate access/reuse terms, coverage, freshness and any paid provider costs; (2) prepare responsive mock with verified real examples; (3) implement persisted content/adapter/job/admin + mocked-source automated tests; (4) run isolated Preview2–3days for retries/staleness/dedup/ranking/RTL/mobile/security/performance; (5) obtain owner authorization for feature merge/Production publication. No live recurring automation created now. Inline Persian plan delivered; source/provider choice and final schedule can be decided when starting implementation.

### Completed & Tested — approved smoke banner published and verified on Production — 2026-10-25, Asia/Tehran

- **Owner authorization:** approved the finished film, delegated placement and requested publication through completion. Explicit follow-up confirmed MAIN WEBSITE only (the spoken Instagram mention was clarified); no Instagram action. Place after New products and before Brands. No further Kling credits or media generation.
- **Baseline:** clean042fdcc main apart from preserved local film continuity note; branchcodex/smoke-banner-sample. Unrelated PR16/20 unchanged, main CI40193331939 SUCCESS. Production8313e28/PR37 healthy, expected operational Caddy difference only; backend/Preview identities preserved for rollout guards.
- **Implementation:** reuse existing cinematic-hero film/media/schema/clearance with its compact template as an editable thin25:4 interlude. No extra H1/slogans/shopping links. Explicit Appearance presentation selector. Shared film's new optional deferUntilVisible (defaultfalse) lazy-loads only this below-fold movie; lazy low-priority poster; existing once/hold/pause/replay/offscreen/reduced-motion/data-saving/error fallback reused. Main opening Hero behavior unchanged. Scoped design note added. Web typecheck passed and targeted lint exit0 with only the two pre-existing raw-image warnings. Local read-only public-data adapter/Next dev acceptance: all13 cases PASS, exit0 (FA/EN1440/1366/768/390, pause/resume/end, deferred fetch, reduced-motion, data-saver, no-JS, slow link click-to-play and failed movie fallback). Desktop screenshot reviewed, whole25:4 frame and44px controls verified. Evidence outputs/smoke-local/acceptance.json/screenshots. No writes from tests. Adapter logs showed an unrelated catalogue image403, left outside scope. Stopped local helper/dev processes; restored only their generated config changes. Generated build retained under task work for reversible cleanup.
- **Before any content write:** fresh dump99 TABLE DATA entries verified; complete encrypted/offsite backup8611923bytes, SHA2564b8d858b34d37a661da326dcf519a4dd91af28de49dbf6c4e16b33c3ffba89b4 matched remote download stream. Existing public recipient/bucket reused. Private evidence /opt/hedax-release-candidates/smoke-banner-20261025; initialS3 private18/public64 objects verified.
- **Completed & Tested — normal Production media UI:** session already authorized; uploaded308775byte1400×224 movie via ordinary media picker; structural validation/scanning passed. Uploaded final-logo poster, optimized toWebP1400×224. Saved bilingual metadata and publisher clearance for both via ordinary UI/audit path. Movie /media/content/video/84339178-1009-4ad1-9df4-427339721fff.mp4; poster /media/content/image/9490a8e7-bc82-4312-a180-d7fae838b977.webp. Publication now completed through the normal UI; no local/Preview document was copied over it.
- **Completed & Tested — PR39 release:** reviewedf419baa0dda40ce406e4d58afda32e42749f4514, PRCI40196201681 SUCCESS, mergeda683d2594614807f3acbcfd7e49355ebebe05940, mainCI40196435832 SUCCESS. Exact reviewed/merged trees matched; Production web imagehedax-smoke-web:f419baa0dda4 built exit0 and deployed healthy/restart0, branchdeploy/smoke-banner-20261025. API/worker/database/Redis/ClamAV/Caddy and all7 Preview service IDs unchanged. Published document preserved during code rollout.
- **Completed & Tested — publication/acceptance:** draft initially equalled published (version171), so no unrelated draft was overwritten. Added/reordered/configured one compact block298faaff-5847-48ce-a9c6-3957c2c3de5e in normal Appearance UI; title “نشان سورس”, playbackonce, no extra logo/discovery. Reused cleared poster for desktop poster/still; mobile falls back to these same small files. Read-only prepublication comparison confirmed only that new block, with all3 originals exactly unchanged; private preview had one H1 and correct thin frame. Normal Publish UI returned success. Public postcheck confirms only the new block after New products/before Brands; original document otherwise identical. Movie Range206, internal readiness ready with database/Redis/storage/scanner up and fresh signatures. Actual public FA/EN1440/1366/768/390 plus reduced-motion/saveData/noJS/slow-link/failure: all13 cases PASS, exit0, no page errors/overflow/early movie fetch. Evidence outputs/smoke-production/acceptance.json and screenshots; desktop/mobile reviewed.
- **Completed & Tested — PR40 overlap polish:** visual review caught the existing floating assistant over the strip’s corner on phones; added only its existing data-assistant-avoid marker to the banner (no assistant logic change). PR40 reviewed322937d335227c6efb50d1c9bec54134a5ade0cb, CI40197016109 SUCCESS; merged2f72d3b076676934be2496a9539c727e9eb5091c, mainCI40197241640 SUCCESS. Exact-tree imagehedax-smoke-polish-web:322937d33522 built exit0, deployed healthy/restart0 on deploy/smoke-polish-20261025. All backend/7 Preview identities and current4-section published document preserved (SHA256087aac5b94b9b7648d9d8f559346383ec26850efb10413b17c7642d307da115e).
- **Completed & Tested — final backup:** before the second code rollout, fresh99-table-data dump and complete media/config backup (private18/public66 objects, including the new film/poster) encrypted with the existing age recipient, uploaded to the existing Arvan backup destination; remote-stream SHA256 matched5c7b62cb409b671ebebe0faa8dbaba5111d882994f8766dfe8eb4665490f213e,8935067bytes. Private evidence/rollback in /opt/hedax-release-candidates/smoke-polish-20261025. Initial release backup remains separately preserved.
- **Owner UI playback change preserved:** normal publisher history shows Ali Hedayat changed/published the banner fromonce toloop at13:18:14UTC and published again13:18:43UTC while final work continued. Kept that current live choice; did not silently restoreonce. The initial13 Production cases passed againstonce. Final overlap check initially assumed an empty boolean attribute (React correctly emits true), then twice waited for ended while the newly published live movie was looping; investigated DOM/public config/history and corrected the test assumptions without changing owner content. Earlier diagnostic reports retained in task work. Final targeted FA/EN1440/390/360: all6 cases PASS, exit0, currentloop confirmed, no assistant/avatar overlap, one H1, no overflow. Evidence outputs/smoke-polish/acceptance.json and screenshots; mobile390 screenshot visually reviewed.
- **Completed / continuity:** owner-approved film is publicly placed after New products and before Brands, editable in Appearance via the compact cinematic presentation. Cleared308775byte MP4 and optimized final-logo poster remain in the normal media library; no extra generation/credits, migrations, catalogue changes or Instagram action. Local helper processes stopped; Next’s temporary config changes restored and generated output retained reversibly in this chat work/smoke-next-build. Temporary admin/private-preview tabs closed; refreshed main-site tab retained at the banner. Only final continuity documentation follows the runtime release; no further web rebuild or repeat publication needed. The requested banner task is complete. Earlier cold-mobile LCP follow-up was not remeasured; do not claim all Core Web Vitals improved.

### Completed & Tested — thin supercar/smoke logo banner sample — 2026-10-25, Asia/Tehran

- **Authorization:** owner requested one very thin website banner: a fast supercar passes, rear exhaust smoke gathers and transforms into the Source by HEDAX logo. Explicitly approved ONE Kling6s1080p21:9 generation costing90 of124 existing credits; remaining34 verified after submission. Do not regenerate, buy credits or consume additional credits without separate explicit approval. Current scope is the reviewable film sample, not a Production change.
- **Prepared/submitted:** official logo-dark.png copied unscaled onto a1400×600 dark reference canvas to meet Kling's image dimensions/aspect constraints; raw600×191 and2172×724 attempts were rejected before generation/no credit cost. Final full prompt explicitly sequences empty road,0.4–2s silver supercar left-to-right,2–4.5s exhaust smoke gathering/condensing into exact reference logo,4.5–6s crisp logo hold; all action constrained to central third for thin crop. The earlier no-logo prompt was replaced before submission. Single Generate click, submitted successfully with90 credits deducted; no retry/upgrade/payment.
- **Completed & Tested:** one Kling job completed, slot943314798064840737. Downloaded via the normal visible account Download button; retained original unchanged. No extra charge/upgrade, regeneration or watermark bypass. Original2562657bytes,2200×940 H264Main/yuv420p24fps,6.04s (the UI labels1080p; actual dimensions are lower, report them accurately). Frame sequence reviewed: silver supercar crosses left-to-right, smoke gathers into the Source/by HEDAX mark with blue accent; no visible third-party watermark in inspected original frames. Final logo is readable; no corrective generation was needed.
- **Completed & Tested — thin deliverable:** local video crop of excess letterbox to2200×352 at0,332, scaled1400×224; silent H264/yuv420p with faststart,308775bytes (~302KiB). Whole car/final lettering preserved in reviewed12-frame contact sheet; full decode check exit0. Poster extracted at4.5s. This costs no additional Kling credits. Sample opened in the app; Kling tab retained as deliverable. Assets/evidence in this chat outputs/smoke-banner/: source-smoke-banner.mp4, kling-original.mp4, poster.jpg, thin-contact.jpg, kling-completed.png, media-inspection.json and verification.json; final exact prompt at outputs/smoke-banner-prompt.txt.
- **Continuity:** owner approved90 credits once; remaining34 observed. Do not regenerate/buy/consume extra credits. Sample is complete and ready for owner review before site placement. No Production/Preview/content change; PR37 runtime remains unchanged. Branchcodex/smoke-banner-sample based on042fdcc, only PROGRESS.md local edit; no commit/push for this film-sample task. Next owner decision is approval/location of the film before integrating it into the site. Prior release work must not be repeated.

### Completed & Tested — desktop Hero fit released to Production — 2026-10-25, Asia/Tehran

- **Authorization/scope:** owner explicitly requested shrinking the oversized desktop film so the complete film and typed slogans fit the opening screen, and authorized direct Production publication without a separate Preview round. Only desktop cinematic CSS, its scoped design note and continuity documentation changed; vehicle-finder implementation remains out of scope.
- **Git/release:** PR37 reviewed head0cb66bc450c0bf5dca03385c337a4eab08bee25d, CI40176695442 SUCCESS; merged-main CI40176848460 SUCCESS; merged as8313e2851f12aa18c44e8faeb9475f2ee32a19d8. Reviewed and merged trees matched. Production imagehedax-pr37-web:0cb66bc450c0 built from that exact reviewed tree, build exit0, main-site base URL and revision label verified. Server branchdeploy/pr37-20261025 at8313e28. Backend/Preview service IDs unchanged, web healthy/restart0; operational Caddy difference, edge overlay and existing images preserved.
- **Backup before rollout:** fresh database dump verified with99 TABLE DATA entries; complete encrypted archive includes dumps/configuration and checked S3 private18/public64 objects. Existing public age recipient and backup bucket reused. Archive8610903bytes, SHA256139796b3fdba18bff997af48e7e01bd2fc86b80c6ab5ec6d1c8a732692fa52ae; remote download-stream hash matched. Protected rollback/backup evidence under /opt/hedax-release-candidates/pr37-0cb66bc450c0. No secrets/dumps copied to workstation or Git.
- **Hosted acceptance:** actual Production anonymous browser FA/EN at1920×1080,1536×864,1440×900,1366×768,1280×720,1024×600,768×1024,390×844: all16 checks PASS, script exit0. Complete typed slogans below the whole uncropped film fit inside the initial viewport, no horizontal overflow/scroll/page errors; desktop film16:9 and contain. Actual1366px FA screenshot visually reviewed. Film playback separately confirmed advancing,1280×720, readyState4, muted/loop and no media error. Evidence in this chat outputs/hero-fit-production/acceptance.json, playback.json and screenshots. Initial injected local prototype also passed16 checks.
- **Preservation/health:** public FA/EN/parts HTTP200; original published document byte-for-byte unchanged (SHA256459500259ea62f2be487e60655089e199511cd74135d4ab8b307b6fcaafd1c71). Internal readiness ready, database/Redis/storage/scanner up with fresh signatures. No content/media/catalogue/account changes, migrations, backend restart or separate Preview release. Earlier cold-mobile LCP follow-up remains unresolved and was not remeasured.
- **Continuity:** documentation-only release checkpoint follows the code release on codex/pr37-release-notes; no runtime rebuild required for it. Current requested resize is complete. Future owner changes start from this release; preserve prior research-only vehicle-finder scope unless separately authorized.


### Completed & Tested — read-only vehicle-finder assessment (no implementation) — 2026-10-25, Asia/Tehran

- **Owner instruction:** inspect/discuss the new full-width vehicle finder and provide a VS Code execution prompt; explicitly do not implement or populate vehicles here. Confirmed scope: Iran-market vehicles, old/new/imported, four existing groups IKCO/SAIPA/Toyota/Hyundai; no plate/VIN integration now. Move existing three shopping links plus category chips to the bottom of the home page before the footer; new finder sits below existing Hero.
- **Read-only findings:** inspected clean base db363fd (PR36 merged release notes), root instructions, current Vehicle/VehicleModel/contracts and VehicleFinder/CinematicHero. Public /catalog/vehicles currently returns16 entries and2 child models; entries mix makes (Peugeot/Suzuki) and families (Dena/Samand). Vehicle has no VehicleBrand relationship; no canonical engine/year catalogue (year ranges exist on fitment rows). Existing chooser supports vehicle/model or brand-only, not the requested dependent4-stage flow. Current shopping links/categories are emitted inside CinematicHero's fragment, requiring proper extraction/reordering rather than hiding/deleting them.
- **Research:** Toyota official historical lineage and Hyundai official regional model pages are available, but are not a verified complete Iran-market variant/year dataset. Direct IKCO/SAIPA/aftersales pages were blocked/timed out in this browsing tool; do not claim a complete model list was verified. Future importer must record primary source URL, market, generation/trim/year/calendar and verification date; missing/conflicting facts stay unconfirmed. Adding a vehicle must never invent product compatibility.
- **Handoff:** provide an incremental VS Code prompt: preserve existing IDs/slugs/product fitments, review brand/assembler mapping, sourced dataset with dry-run/dedup/import provenance, editable dependent finder and bottom shopping section, isolated Preview acceptance, no Production merge/data import without explicit later approval. Unmodified owner screenshot copied to this chat outputs/vehicle-finder-reference.png for stable reference. No application/code/database/site changes, no tests required for this review; this continuity note was the only repository edit at that research checkpoint and was subsequently preserved/committed with PR37. Prior Production release remains unchanged.

### Completed & Tested — approved PR35 Production release — 2026-10-25, Asia/Tehran

- **Owner authorization:** explicitly requested committing/pushing and applying all reviewed changes to the main site through completion. This supersedes the earlier PR35 Preview-only/owner-decision gates. Scope: reviewed code, four brand logos and product-section presentation; preserve current real Production catalogue/media/settings and exclude all PREVIEW-CARD synthetic records/prices/stock.
- **Inspected baseline:** clean feature HEAD456ec9f50824f729343b0180e1f469faa9c47fab, PR35 mergeable/draft, final CI40172565199 SUCCESS; origin/main f908df8. Server Production deploy/pr33-hero-20261025 at14a6896, only expected operational Caddyfile difference, web hedax-hero-web:a1384f013fc2 healthy/restarts0; backend remains PR31. Active owner session works in normal Production Appearance UI. Published Production has its own cinematic block/media, playback loop, real New products and brands; do not overwrite it with Preview's document or publish unrelated draft changes.
- **Completed & Tested — release:** PR35 ready/merged asda5a199802e3d37312bc2b18c8bba74545f1ce18; merged-main CI40173154338 SUCCESS. Reviewed and merged trees matched. Fresh pre-rollout dump456470bytes, pg_restore catalogue99 TABLE DATA entries. Exact merged-source Production web build exit0 with correct main-site base URL. No new keys/credentials.
- **Completed & Tested — backup correction:** generic Compose backup initially rejected unsupported run --no-build; existing scheduled /usr/local/sbin/hedax-db-backup ran exit0 but inspection showed it is local/raw, not encrypted/offsite. Corrected the earlier description to the owner. The pre-rollout rollback dump had already been verified before deployment. Then created a complete age-encrypted release archive with that pre-release dump, a fresh post-release dump, configuration and all S3 files (private18objects/596825bytes; public64objects/7899929bytes); rclone source/local checks passed. Reused the existing public age recipient and existing backup bucket, no credentials/config changes. Encrypted archive8604900bytes; offsite download-stream SHA256 exactly matched0f8a077d1dd38a264da1955bf4bf7426496923246af11c1c7d25f2e81da578bf. Both before/after DB snapshots remain in the archive. Evidence on server candidate encrypted-backup-verified.json; private payload/config/logs remain protected, not in Git/chat outputs. Daily cron still makes a local raw dump; do not assume it provides this encrypted/offsite workflow automatically.
- **Completed & Tested — web rollout:** imagehedax-pr35-web:da5a199802e3, server branchdeploy/pr35-20261025 atda5a199; healthy/restarts0, FA/EN/parts HTTP200 with new markup. API/worker/postgres/redis/ClamAV/Caddy and all7 Preview service IDs preserved; published Production document hash unchanged during code rollout. Only expected operational Caddyfile difference remains; edge overlay/wrapper preserved. Rollback in /opt/hedax-release-candidates/pr35-456ec9f50824/rollback, state/logs in candidate folder. No migration/API replacement or catalogue transfer.
- **Completed & Tested — normal owner UI:** uploaded four JPG logos through Production taxonomy file pickers and saved each existing brand; all4 image elements remain after reload. No account/MFA change. Kept current live film/media/playback loop. Saved a valid grid edit to capture the separate original draft in normal history (11:11:47 Asia/Tehran), then restored the exact current09:25:52 published revision through the history UI; applied only New products4/2/1 columns and published. Confirmed public document has original3 sections/media and exactly the targeted style change,24 real products and0 PREVIEW/DEMO items.
- **Completed & Tested — external Production acceptance:** real Chromium FA/EN1920/1440/768/390/360: full-width uncropped film above typed slogans, one H1, local Lalezar, FA silver/EN blue, separate shopping section, correct4/2/1 product grid and red72px cart controls, no page errors/overflow. All4 logos load publicly; screenshots reviewed. Reduced-motion still/full text makes zero movie requests; no-JS complete text works. Three original movies return206 Range. Real anonymous cart added SKU0910900701 quantity1, persisted on cart page/reload and was removed to empty; no checkout/order/payment. Anonymous admin API401. All15 reported checks PASS, script exit0. Public catalogue24 real items and0 Preview/DEMO records. Evidence this chat outputs/pr35-production/acceptance.json, slogans-{fa,en}-{1440,390}.png, products-{fa,en}-1440.png, brands-{fa,en}.png and cart-before-remove.png. Internal readiness ready: database/redis/storage/scanner up, fresh ClamAV signatures. Initial readiness probe used the wrong /api/v1/health/ready route; corrected to the configured excluded /health/ready route and passed. Postcheck confirms the live document differs from the original only in New products grid styles; original film/media/playback loop and all other content are unchanged.
- **Next / continuity:** release notes on codex/pr35-release-notes based on inspected main da5a199; commit/push/PR the checkpoint, then hand off the real main-site link. Production runtime code is PR35/da5a199; documentation-only follow-up needs no rebuild. Earlier cold-mobile LCP/performance follow-up remains open and was not remeasured; do not claim all Core Web Vitals improved. Future owner changes can start from this completed release without repeating the deployment. Keep shared Preview for further reviews; do not copy its synthetic products into Production.

### Completed & Tested — silver Persian / blue English slogans on Preview — 2026-10-25, Asia/Tehran

- **Owner scope:** final correction requests silver for Persian Hero slogan and blue for English; this supersedes the interrupted orange request. Change colors only on the current Preview, retain font/typing/vertical layout/product cards. No merge/Production authorization.
- **Baseline:** clean inspected codex/hero-editorial-preview HEAD10385bb364f431bab7cf78db0e3c9c7bff94b813; prior code12e9c9e CI40171812069 passed, documentation CI40172152070 in progress. Root/web instructions, continuity and scoped design read; interrupted color turn left no changes.
- **Implementation:** language-scoped Hero copy CSS: FA#C0C0C0 silver, EN#39A0FF blue on either locale page. Transparent source/typewriter overlay and full-text fallback inherit the correct phrase color. Scoped design note updated; no content/account/data writes.
- **Completed & Tested — rollout:** diff check exit0; codefa8541f8fb86bc2556d107947943c900e3246a09 pushed to draft PR35. CI40172337576 SUCCESS; remote exact-source web build exit0. Only isolated Preview web rolled to hedax-typewriter-web:fa8541f8fb86, candidate /opt/hedax-preview-candidates/typewriter-fa8541f8fb86; previous12e9c9e image overlay retained in images.before.yml. Healthy/public HTTP200; Production web/api/worker/postgres/caddy identities and published document hash preserved; Preview API/database identities preserved. No data/content/account changes.
- **Completed & Tested — hosted:** real computed parent/typing-overlay colors FA rgb192/192/192 and EN rgb57/160/255, keyed to phrase language in both locale pages at1440/390. Complete after intro, no overflow/page errors; reduced-motion and JS-disabled full text keeps the same colors. Contrast against#05080D: silver11.02:1, blue7.30:1. Browser check exit0; mobile screenshot visually reviewed. Evidence this chat outputs/slogan-colors/acceptance.json and {fa,en}-{1440,390}.png. This small CSS-only change did not warrant new repository tests or unrelated retesting; existing CI ran automatically.
- **Requires Owner Decision / Next:** owner can refresh https://preview.sourcebyhedax.ir/fa for silver/blue review. Keep PR35 draft/unmerged pending explicit Production approval. Subsequent checkpoint commit is documentation-only; deployed code remainsfa8541f. Previous cold-mobile CWV follow-up remains open, not remeasured.

### Completed & Tested — reference product cards/quick cart on Preview — 2026-10-25, Asia/Tehran

- **Owner scope:** match the supplied white AUTODOC product-card screenshot's colors/layout and bottom cart action for home-page products. Use the shared PartCard in home collections and catalogue. Keep all current Hero work; Preview only, PR35 remains draft with no Production release approval.
- **Baseline:** inspected clean branch codex/hero-editorial-preview at875403e85961a2f70291a00456b21a079be01d64; prior final CI40170115308 SUCCESS. Root/web instructions, design master and local Next guidance retained. The owner's explicit red-card reference overrides the older master palette restriction only for product cards.
- **Implementation:** white lightly outlined vertical card, uncropped image, dark title/large price, muted technical metadata, blue details, full-width72px red icon cart button; one pattern across home/catalogue and mobile. Stock/fitment/unit/IRR-reference money and image fallback preserved. No invented rating/discount/RRP/tax/shipping/seller claims or nonfunctional heart. New CardCartButton uses existing CSRF cart API and firstAmount unit helper, busy ref/disabled button, accessible label/status, header count event, readable error/retry. Nonbuyable items use prefilled sourcing link. No nested interactive controls. New part-card.css/client action and scoped design record; part-card.tsx updated. Red/white contrast measured4.91:1.
- **Completed & Tested — local:** web typecheck/focused ESLint/diff check exit0; browser FA/EN at1440/768/390/360 verifies home and catalogue, white/red colors, vertical geometry,72px purchase control, no overflow/runtime errors, two purchasable and two sourcing cards. Local initial run saw the previous empty60s anonymous cache; subsequent revalidated run passed all8 scenarios. Local phone screenshot reviewed; cart POST is deferred to hosted Preview because local origin is not the staging API's allowed origin. Dev server stopped and generated next-env.d.ts restored.
- **Completed & Tested — isolated test data:** guard asserted hedax-preview project, staging and exact Preview base URL before normal authenticated admin writes. Empty Preview got only4 clearly labelled synthetic PREVIEW-CARD-01..04 products with test price/stock; no Production data copied. Two unmodified650×640 photos downloaded from official LIQUI MOLY page; image provenance in scoped design record. Normal product/media/inventory/publication APIs used; no account/MFA changes. Preview new-products block set4/2/1 columns via normal versioned Appearance publication; other sections retained. Evidence this chat outputs/product-cards/preview-test-products.json, local/acceptance.json and screenshots. None of these test products may be copied to Production.
- **Completed & Tested — code/CI/rollout:** initialade560a candidate was superseded before deployment by12e9c9ec5daaa276d6c6bec1ac2c99885e31558e, preserving the established compact one-line fitment field. Earlier CI40171740615 cancelled normally on the newer push; final code CI40171812069 SUCCESS. Exact-source remote build exit0; only isolated Preview web rolled to hedax-typewriter-web:12e9c9ec5daa, candidate /opt/hedax-preview-candidates/typewriter-12e9c9ec5daa. Previous8cb1003 image overlay retained in images.before.yml. Public HTTP200/web healthy; Production web/api/worker/postgres/caddy identities and published document hash preserved, Preview API/database identities preserved. No Production changes or migrations.
- **Completed & Tested — hosted:** home and catalogue FA/EN1440/768/390/360 (8 scenarios), white/red colors, image/title/price/button ordering,72px full-width control, no horizontal/card overflow or page errors. Four-column desktop grid and loaded photos visually reviewed in outputs/product-cards/hosted/new-products-fa-1440.png; phone reference card also reviewed. Actual anonymous Preview cart: keyboard Enter purchase, disabled/aria-busy loading, one POST, correct product and quantity1, persistence after reload; simulated422 readable alert followed by successful real retry to quantity2; /fa/cart renders the selected SKU. Anonymous admin API401. Script exit0; outputs/product-cards/hosted/acceptance.json, card-{fa,en}-390.png and real-preview-cart.png. No checkout/order/payment performed. Source/inquiry links retain meaningful actions and no controls are nested inside the product link.
- **Requires Owner Decision / Next:** owner can reload https://preview.sourcebyhedax.ir/fa and review New arrivals (the4 displayed items are explicitly synthetic Preview samples). PR35 remains draft/unmerged. After explicit approval, prepare the reviewed code release and use existing real Production product data; never transfer these test products/prices/stock. Subsequent checkpoint commit is documentation-only; deployed code remains12e9c9e. Previous cold-mobile CWV follow-up is unchanged and not remeasured in this revision.

### Completed & Tested — full-width vertical Hero on Preview — 2026-10-25, Asia/Tehran

- **Owner scope:** move the full-width banner/film above both slogans, no side-by-side layout. Keep the existing typewriter effect. Preview-only revision; PR35 stays draft pending explicit release approval.
- **Baseline:** clean branch codex/hero-editorial-preview at c0d5cf4a300dc9eaeae402a606bb720140a209ea, prior final CI40169529111 SUCCESS. Root/web instructions and scoped design record read. Existing Preview image117a51d and Production PR33 retained before rollout.
- **Implementation:** single column in every locale/viewport; edge-to-edge uncropped16:9 media first, centered slogan block below; shopping cards remain outside and below the Hero. Natural media aspect can extend the banner below the first fold on wide screens; communicated this consequence to the owner. Start the existing one-time typing sequence when the shared slogan block enters view so it does not finish unseen below a tall film. Keep reduced-motion/no-JS behavior and existing panel text/media values. Changed cinematic.css, cinematic-typewriter.tsx, scoped design record and this checkpoint.
- **Completed & Tested — layout prototype:** browser-only injection of candidate stylesheet on public Preview (no persisted changes), FA/EN at1920/1440/768/390/360: full viewport media width, media above centered text without overlap, no horizontal overflow, uncropped16:9 frame, cards below. Desktop/phone screenshots reviewed in this chat outputs/vertical-layout-local/. Prototype exposed excess tablet grid-row spacing; start alignment fixed it and hosted768px confirms film and copy now touch without the excess gap. Focused local web typecheck/ESLint and diff check exit0.
- **Completed & Tested — candidate/deployment:** code8cb1003d34a1b3bd29a0c1d5095fd19df464bc90 pushed to PR35; CI40169875180 SUCCESS (lint/types/unit/catalogue/CMS/backup drill/web build). Exact-source remote build exit0; only existing isolated Preview web replaced with hedax-typewriter-web:8cb1003d34a1, candidate /opt/hedax-preview-candidates/typewriter-8cb1003d34a1. Previous image overlay retained in images.before.yml. Preview web healthy/public HTTP200; Production web/api/worker/postgres/caddy identities and published content hash preserved, Preview API/database identities preserved. No content/account/media/Production mutation.
- **Completed & Tested — hosted acceptance:** real public URL, no stylesheet injection: FA/EN at1920/1440/768/390/360 (10 scenarios) confirm full viewport width, uncropped16:9 frame above centered slogans, no overlap/overflow, cards below. On wide screens typing remains unstarted while below the fold, starts when scrolled into view, and does not replay after leaving/reentering. Separate FA/EN1440/390 typing checks confirm sequential partial→complete phrases, accessible complete heading, no changing copy bounds, no loop, reload restart. Reduced-motion, runtime preference change and JS-disabled fallbacks PASS. Both browser scripts exit0; hosted mobile screenshot visually reviewed; evidence this chat outputs/vertical-layout/acceptance.json and hero-{fa,en}-{1440,390}.png, outputs/vertical-typewriter/acceptance.json and partial/complete screenshots.
- **Requires Owner Decision / Next:** owner can reload https://preview.sourcebyhedax.ir/fa to review the vertical arrangement. Keep PR35 draft/unmerged until explicit release approval. Subsequent checkpoint commit is documentation-only; deployed code remains8cb1003. Previous cold-mobile CWV follow-up remains unresolved and was not remeasured here.

### Completed & Tested — typewriter slogan intro on Preview — 2026-10-25, Asia/Tehran

- **Owner scope:** add a page-entry typing effect to both existing slogans on the current Preview revision. No separate authorization to merge or publish this revision on Production; PR35 stays draft.
- **Baseline:** branch codex/hero-editorial-preview, clean inspected HEAD ce4e5f7a6389e1303d0c58d165d2f21409a091af; final prior CI40168693824 SUCCESS. Root/web instructions, scoped design record and Next client/server guide read.
- **Implementation:** new small CinematicTypewriter client enhancement; primary phrase types once in1.8s after120ms, secondary follows after2070ms and types in1.2s. Local fonts settle first. Grapheme segmentation preserves Persian joining/combining characters. Complete accessible source remains in flow; aria-hidden visual prefix changes without moving the media/cards. No looping/deletion, caret disappears on completion, timers cleaned on unmount. Reduced-motion and no-JS immediately show both full phrases; runtime motion preference changes finish the intro. Appearance values remain the source. Changed cinematic-hero.tsx/cinematic.css, new cinematic-typewriter.tsx and scoped design note. Dev-generated next-env.d.ts route imports restored to their original build form after stopping the local server.
- **Completed & Tested — local:** web typecheck, focused ESLint and diff check exit0. Real Chromium against local Next rendering the isolated Preview public API: FA/EN at1440/390, sequential partial text then exact completed slogans, one accessible complete heading, zero copy position/height change during typing, no horizontal overflow/runtime errors, no loop, reload restarts. Reduced motion, runtime preference change and JS-disabled complete-text fallback PASS. Evidence: this chat outputs/typewriter-local/acceptance.json and partial/complete screenshots. Local dev server stopped; no admin/content writes.
- **Completed & Tested — hosted:** code117a51dcc084e5f1f307f063c36eb0ae6b059d2d pushed to PR35; CI40169329068 SUCCESS (lint/types/unit/catalogue/CMS/backup drill/web build). Remote exact-source web build exit0. Only Preview web rolled to hedax-typewriter-web:117a51dcc084 from /opt/hedax-preview-candidates/typewriter-117a51dcc084; images.before.yml retained for rollback. Production web/api/worker/postgres/caddy identities and published document hash preserved; Preview API/database identities preserved; web healthy/public HTTP200 with typewriter markup. Hosted Chromium repeated FA/EN at1440/390, sequential partial→complete text, exact accessible heading, unchanged copy bounds throughout, no overflow/page errors, no loop, reload restart, reduced-motion/runtime preference change and JS-disabled fallback: PASS, exit0. Evidence in this chat outputs/typewriter/acceptance.json and typing/complete FA/EN screenshots; partial desktop/phone frames visually reviewed. No admin/content/media/account changes in this step.
- **Requires Owner Decision / Next:** owner can reload https://preview.sourcebyhedax.ir/fa to see the one-time intro. Keep PR35 draft and unmerged; merge/Production rollout still require explicit approval of this revision. The subsequent checkpoint commit is documentation-only; deployed code remains117a51d. Earlier cold-mobile CWV follow-up is unchanged, not remeasured here.

### Completed & Tested — display-only Hero on isolated Preview — 2026-10-25, 09:50 Asia/Tehran

- **Owner scope:** approved six-item list and said start. This revision is Preview-first; no Production rollout, Merge or Production taxonomy mutation until the owner reviews it. Prior Hero release approval does not authorize this new appearance release.
- **Baseline:** reused premium worktree; inspected root/web instructions, PROGRESS, Git, open PR16/20 and passing main CI. New branch `codex/hero-editorial-preview`, reconciled main with the pushed final delivery checkpoint; inspected base4d5bb01. Existing Production/Preview infrastructure unchanged.
- **Completed & Tested — implementation:** display-only Hero (no eyebrow/search/CTA); independent full-width columns without negative overlap; shopping cards/categories are a separate sibling section below the banner, one orange vehicle card. Lalezar display type in Persian/Latin is self-hosted with OFL and font preloads. Existing film/still/motion controls and Appearance text/media persistence retained. Hidden link/button fields removed from the cinematic block's panel; discovery toggle relabelled. Brand-card logo frame enlarged within its existing fixed-height area. Changed files: cinematic-hero.tsx, cinematic.css, builder/settings.tsx, brand-card.tsx, public/fonts/hero/*, scoped design record and this checkpoint.
- **Completed & Tested — assets/panel:** four downloaded logos normalized to JPG800×500/0.4MP, 19–32KB (Iran Khodro official source is73×88, suitable only at the small card display size); Toyota/Hyundai official sources and SAIPA Commons provenance recorded in design-system/pages/hero-editorial.md. Font files52,128+16,572bytes. Downloads verified without disabling TLS checks; Python trust failures were resolved using Windows curl's normal certificate validation. All four JPGs uploaded using the signed-in Preview media/taxonomy API; the normal image pipeline stores optimized WebP. Names/order/active status preserved; featured logos persisted after admin reload and rendered publicly. Evidence in this chat outputs/editorial/logo-registration.json, admin-brand-logos.png and brand-logos-public.png; original JPGs in outputs/brand-logos/. No hardcoded logo substitutes.
- **Completed & Tested — Preview authentication:** existing synthetic owner's MFA seed was unavailable. A bootstrap attempt correctly refused because the owner already existed. The user explicitly authorized resetting only the Preview test owner's MFA; guarded staging/project/base-URL checks preceded invalidation of only that test account's factor/challenges/recovery codes, auth version increment and audit entry. Immediately completed normal password login and fresh MFA enrollment; MFA is enabled again. Production accounts were untouched. Test credentials/session files remain uncommitted private work intermediates; never copy their contents here.
- **Completed & Tested — Git/build/deployment:** code commit f266fc58cdbc78b26b01e6b47fb08cb1b9567b90 pushed to codex/hero-editorial-preview; draft PR35 https://github.com/ali-hedax/source-auto-parts-platform/pull/35. CI40167890118 (Lint, types and unit tests) SUCCESS. Focused local web typecheck/ESLint and production build exit0; remote exact-source build exit0. Existing isolated Preview web alone replaced with image hedax-editorial-web:f266fc58cdbc from /opt/hedax-preview-candidates/editorial-f266fc58cdbc; previous image overlay retained for rollback. Production web/api/worker/postgres/caddy and Preview api/postgres container IDs preserved, Production published document hash unchanged. Public Preview HTTP200, web healthy. No new server, DNS change, migration or Production content mutation.
- **Completed & Tested — hosted visual acceptance:** real Chromium at 1920×1080,1440×900,768×1024,390×844,360×800 in FA/EN (10 scenarios): no horizontal overflow, no text/media overlap, one H1, exact saved bilingual slogans, both local Lalezar subsets loaded, no external Google font calls/page errors, progressing video, orange vehicle card and separate card/category section before new products. All three card destinations HTTP200. Reduced-motion sends no video request and shows still. Normal versioned Preview content API changed playback to static, published and verified image-only mode, then restored once-video and republished successfully. Appearance text/media controls and independent-card toggle checked. Initial playback checks had a synchronization race (clicked during loading); waiting for a real ready playback state resolved it, final run exit0. Screenshots visually reviewed for desktop/mobile/cards/logos. Evidence: this chat outputs/editorial/visual-qa.json and hero-{fa,en}-{1920,1440,768,390,360}.png, shopping-cards-desktop.png, reduced-motion.png, static-image-mode.png. Preview-only new-products block added with an honest empty state; no real catalogue copied. Production GET still serves previous approved Hero. No new CWV measurement; earlier cold-mobile LCP follow-up below remains unresolved.
- **Requires Owner Decision / Next:** give the owner https://preview.sourcebyhedax.ir/fa for this six-item visual review. Keep PR35 draft and unmerged. Only after explicit approval: reconcile main/CI, prepare rollback, deploy the approved code and register the same logos through normal Production admin workflows, preserving live content. Until then Production retains PR33 Hero and existing taxonomy.

### Completed & Tested — public Preview and Production Hero — 2026-10-25, Asia/Tehran

- **Authorization:** the owner explicitly approved the existing-host Preview changes, then separately requested completing Merge and Hero publication on Production. No server purchase/payment was made. Arvan and server access worked; the Production owner session expired and the owner signed in again. Normal MFA/session/panel workflows were used; no login bypass.
- **Git/CI:** PR33 merged as `14a6896f23faa64fdad0e8b68b1c2609b0356ddb`; candidate `a1384f013fc21a55e6a0a71c3280299e1f818751` CI40109386737 and merged-main CI40162788843 both SUCCESS. Candidate and merge trees matched before rollout. Web image `hedax-hero-web:a1384f013fc2`, revision label a1384f0; server branch `deploy/pr33-hero-20261025`, HEAD14a6896. API/worker/tools remain PR31; PostgreSQL/Redis/ClamAV/Caddy container IDs were preserved. No Production migration, seed, import, catalogue/customer/order/payment change.
- **Preview https://preview.sourcebyhedax.ir/fa:** public DNS A188.121.125.247 added on Arvan (only preview; existing apex/www/mail/TXT/NS retained), valid public TLS, HTTP200 and noindex headers. Seven `hedax-preview` services have their own network, new DB/Redis/storage/AV volumes and fresh secrets. Runtime staging; local media storage; payments/SMS/mail/messengers/live AI disabled. Only the two ingress containers share the new edge bridge. Resource ceilings enabled. No Production data copied to Preview; only base metadata and a Preview-only owner. Original `/opt/hedax-preview` failed checkout preserved.
- **Infrastructure:** unused Docker build-cache cleanup reclaimed reported10.99GB; disk91%→81%, ~14GB free; ~3.4GB RAM available after both stacks. No image/volume/backup pruning. Preview AV CDN downloads initially failed403; signed public main/daily/bytecode definitions were copied to a separate Preview AV volume (not shared), and scanner readiness/signature freshness passed. Runtime freshclam remains enabled. Both stacks healthy/running, Production web restarts0.
- **Persistent proxy/rollback:** existing Caddy gracefully reloaded with only the new Preview host. `/opt/hedax-preview-edge.yml` persists its edge-network attachment and mounts `/opt/hedax-preview-edge.Caddyfile`; current wrapper includes this overlay. Current repository `infra/caddy/Caddyfile` intentionally carries the same operational host addition for the current bind mount (ONLY expected dirty server file); do not discard it without preserving the external override. Before-images/wrapper/proxy are in the candidate rollback folders. Production before-Hero dump `pr33-a1384f013fc2/rollback/database-before-hero.dump`451657bytes; pg_restore catalog99 TABLE DATA entries verified. No secrets copied into this report.
- **Production media/publication:** seven clean-v2 files uploaded through the signed-in owner's Appearance media picker, scanned, structurally inspected and explicitly cleared via the panel (normal audit). Added cinematic block `059bb8ff-4920-41a7-ba0a-a83cf4a46eb7`, exact FA/EN slogans, MP4/WebM/mobile, two posters/two stills, once playback, logo9.8s/28%. Old hero hidden, not deleted. Products and legacy brands retained unchanged. Found pre-existing draft had already removed brands; before-Hero backup proved this. Rebased the edit on the exact current published revision through the panel history, retaining old draft/history, so Hero publication did not accidentally publish that unrelated deletion. Panel confirmed publication.
- **Completed & Tested — external Production acceptance:** seven media MIME/Range206 checks, three full served-video SHA256 matches to accepted encodes; FA/EN at360/390/768/1440px HTTP200, oneH1, both exact slogans/font families, correct mobile/desktop video, no horizontal overflow, no page errors, no visible broken image. Full12s film ends with one logo; reduced-motion uses still and makes zero video requests; anonymous admin API401. Results/screenshots: current chat outputs/production/acceptance.json, hero-fa-390.png, hero-ended.png. Preview also passed real media upload/clearance, Appearance editing/autosave/reload/restore/publication, eight viewport/language playback checks, reduced-motion and401/403 checks. A test-only TOTP attempt failed from PC/server clock drift; corrected the test generator to use server Date and rerun passed; no authentication control weakened.
- **Performance:** hosted Preview slow4G/4xCPU cold median of3: LCP2164ms (2068–2384), CLS0.005, interaction proxy64ms. Hosted Production median of3/profile: mobile cold LCP3884ms (2640–4380), CLS0, interaction proxy112ms; mobile warm704ms/CLS0/proxy152ms; desktop cold1052ms/CLS0.008/proxy120ms; desktop warm308ms/CLS0/proxy48ms. Cold mobile exceeds the2.5s good-LCP threshold and remains a performance follow-up; do NOT claim all Core Web Vitals are good. Lab values are not CrUX/field INP. Raw outputs/production/hero-cwv-hosted.json. Local contracts/domain8 tests and real API integration6 tests, typecheck/lint/build all passed as recorded below.
- **Security limitation retained:** audit0critical,1high deepmerge-ts via Prisma configuration,1moderate uuid via ExcelJS; existing transitive advisories, not introduced by Hero. Whole-project vulnerability-free status is NOT claimed. CSRF/RBAC/MFA, media release gates and antivirus remain enabled.
- **Completed & Tested — final readback:** Production Appearance reload retained exact FA/EN strings and all four layers; status confirmed publication. Public page opened in the app browser. Owned disposable local stack stopped. Removing its temporary data folder was rejected by automatic approval review with reason `blocked by policy`; no bypass attempted and the temporary folder was retained. Preview and Production remain running.
- **Next / follow-ups:** release itself is deployed and verified. Preserve the residual cold-mobile performance and two transitive advisories for future work; no clean-audit or field-CWV claim. Save these documentation-only release notes; no new application rollout is needed for notes. No further Merge/Production permission is required for this explicitly approved Hero scope. Do not repeat successful tests without a new failure/change. Future design work is outside this release.
- **Release-notes delivery / GitHub reconciliation, 2026-10-25 Asia/Tehran:** PR34 documentation-only CI40163645900 SUCCESS at6a240bc; merged as `f908df8c85478ab4d06334e3ba30daf6ec479a7c`. Merged-main CI atf908df8 and14a6896 both verified SUCCESS. No application image/rollout needed for this notes merge. Final delivery checkpoint is recorded on `codex/hero-release-notes` from inspected base6a240bc; application code and release report are already merged on main. Deployment code remains server14a6896/imagea1384f0 as above. Public Production tab retained as deliverable; Appearance retained for handoff. All requested deployment steps complete; cold-mobile LCP and existing advisories explicitly remain follow-ups.

### Hero bilingual / shared Arvan Preview — 2026-10-24, Asia/Tehran

- **Owner authorization:** requested public Preview, then explicitly approved reusing the existing server, deleting unused build cache only, a separate Preview stack/database/media, adding the Preview proxy host and only its DNS record. Subsequently explicitly requested completing Merge and publishing Hero on the main site after verification. No server purchase authorized or needed.
- **Completed & Tested:** inspected root/web AGENTS, both local PROGRESS checkpoints, Git/worktrees/PRs/CI. Worktree reused at `818a843`, branch `codex/hero-bilingual-preview`; preserved the pre-existing PROGRESS change. Main `33c3f3c` and PR32 CI successful; unrelated open PR16/20 left untouched.
- **Implemented Pending Verification (final image):** both Hero titles render simultaneously with explicit language/direction, Vazirmatn/Montserrat, and editable Appearance FA/EN title fields. New block defaults use the requested exact slogans. Existing published documents are not silently rewritten. Shared-host ingress/Compose overlay and review runbook added; no new host ports or Production data-network sharing.
- **Completed & Tested — local:** contracts builder 4/4, domain video 4/4, API integration82 6/6 (isolated PostgreSQL, full exit0). Web typecheck, focused ESLint and diff checks passed. Production-mode disposable stack at localhost3192/4192/55449; seven REAL files uploaded via media API and cleared there, Appearance edit/autosave/reload/restore/publication passed. FA/EN at 360/390/768/1440px: both slogans, correct direction/font, playback, one H1, no overflow or page errors. Reduced motion: no film download. Guest admin401 and missing-CSRF403. Evidence in current chat outputs/hero-qa.json and screenshots. A final fallback-only code adjustment requires final-image recheck.
- **Completed & Tested — media:** existing original SHA256 `aff3366cec1a3390b4ad4dcf755138c4e89c4185c4baf3a89baeaa2f8f844087` matches the prior official Without Watermark download. No fresh download claimed. Requested Kling slot opens VIDEO03, whereas accepted continuous v2 uses Create_a_p_4310_0; accepted clean v2 preserved. Chrome AX readable but click geometry/capture failed twice. Full decode of the three existing encodes passed with full FFmpeg7.1; Playwright's limited FFmpeg initially failed and was not treated as corrupt media.
- **Completed & Tested — local lab performance:** three samples/profile, mobile slow4G/4xCPU cold median LCP1712ms (1580–2592), CLS0, interaction proxy80ms. These are local lab values, NOT hosted/CrUX or proof of public deployment.
- **Security review open:** pnpm audit --prod: 0 critical, 1 high (`deepmerge-ts`7.1.5 via Prisma config, GHSA-ggr8-5vv4-36mx), 1 moderate (`uuid`8.3.2 via ExcelJS, GHSA-w5hq-g745-h8pq). Not new dependencies; no claim of a clean whole-project audit. Existing CSRF/RBAC/media gate remain enabled.
- **Server read-only baseline:** hedax 4CPU/8GB; 5107MiB available; disk91%/6.6GB free, all seven live services running/healthy. Authorized unused builder cache cleanup recovered disk to80%/15GB free; images, volumes, backups retained. Existing `/opt/hedax-preview` is an OLD failed checkout with no containers; preserve it. New candidate must use a separate directory. Caddy shared-ingress config validates with installed Caddy; Compose2.40.3 supports `!reset`.
- **In progress / next:** commit/push feature and PR/CI; build pinned web candidate, provision isolated Preview with fresh secrets and base metadata, add approved DNS/proxy route, upload media and publish only Preview, then run hosted acceptance. After successful Preview+CI, use the owner's later explicit authorization for Merge, backed-up web rollout and audited Appearance publication on Production. Arvan and Production owner browser sessions currently active. No Production Hero/content mutation yet; public Preview still unverified/NXDOMAIN.

### انتشار PR #32 (کارت محصول راهنما) — 2026-10-24 UTC 15:25

- **Completed & Tested:** PR #32 (CI موفق) با merge `33c3f3c` ادغام شد؛ main CI برای `33c3f3c` موفق. انتشار فقط web: image `hedax-pr32-web:818a843f3d97` (برچسب revision)، checkout سرور `deploy/pr32-20261024` در `33c3f3c` و تمیز؛ web healthy، api/worker همچنان PR31. بررسی دوبارهٔ بیرونی: ۲۳ صفحهٔ fa/en دسکتاپ/موبایل 200، overflow 0، تصویر شکستهٔ قابل‌مشاهده 0، DEMO 0؛ پنل برای مهمان محافظت‌شده (API 401)؛ کارت راهنما «موجود ۱٬۲۲۰٬۰۰۰٬۰۰۰ ریال / عدد». این یادداشت محلی است و commit نشده.
- stack محلی یک‌بارمصرف متوقف و پوشهٔ موقت آن حذف شد.

### انتشار PR #31 روی Production — 2026-10-24 (UTC 14:39–15:15)

- **Completed & Tested — GitHub:** شاخهٔ `feature/source-premium-experience` push شد؛ PR #31 (CI «Lint, types and unit tests» موفق) با merge commit `7917ed1` ادغام شد. بدون force push یا بازنویسی تاریخچه.
- **Completed & Tested — پشتیبان پیش از انتشار:** dump سفارشی `database-20261024.dump` (۹۹ ورودی دادهٔ جدول در `pg_restore --list`)، نسخهٔ env/wrapper/images قبلی در پوشهٔ rollback نسخهٔ نامزد؛ پشتیبان رمزنگاری‌شدهٔ `source-backup-20261024T144055Z.tar.age` در باکت پشتیبان با `rclone check` (۱ فایل منطبق، ۰ اختلاف).
- **Completed & Tested — انتشار:** imageهای `hedax-pr31-{api,worker,web,tools}:367423ab9f86` با برچسب revision از export همان merge commit ساخته شدند (درخت merge = درخت head بازبینی‌شده). migrationهای افزایشی `20261022100000_visual_media_video` و `20261024100000_vehicle_brand_logo` با image tools اجرا و در `_prisma_migrations` تأیید شدند. api/worker/web روی imageهای جدید، healthy، restart صفر؛ readiness: database/redis/storage/scanner همه up، امضای ضدویروس تازه. checkout سرور `deploy/pr31-20261024` در `7917ed1` و تمیز؛ wrapper `hedax-compose-current` به فایل images نسخهٔ PR31 اشاره می‌کند. بازگشت: فایل images قبلی + checkout `deploy/pr30-20261022`.
- **Completed & Tested — بررسی از بیرون (https://sourcebyhedax.ir، فقط GET به‌جز یک پرسش راهنما):** ۲۲ مسیر fa/en (خانه، قطعات، وارداتی، خودروها، برندها، درخواست، تماس، چهار صفحهٔ راهنما، شرایط، حریم خصوصی، سبد، جست‌وجو، صفحهٔ قطعه) در دسکتاپ و موبایل HTTP 200 با markup جدید؛ overflow افقی 0؛ تصویر شکسته قابل‌مشاهده 0 (عکس قدیمی `05402068` با جانگهدار؛ درخواست فایل آن هنوز 403)؛ DEMO 0؛ لینک خالی 0؛ لوگو و تصویر راهنما 200. پنل مدیریت برای مهمان فقط «لطفاً وارد حساب شوید» + «ورود کارکنان»؛ API مدیریت 401؛ صفحهٔ ورود کارکنان 200. راهنما به پرسش واقعی «میل لنگ دارید؟» پاسخ فارسی با قطعهٔ واقعی و قیمت داد.
- **ایراد یافت‌شده و اصلاح (PR بعدی):** کارت محصول در پنجرهٔ راهنما وضعیت خام `IN_STOCK` و مبلغ قالب‌بندی‌نشده نشان می‌داد (از PR29 روی main)؛ اکنون برچسب موجودی و قالب قیمت فروشگاه؛ آزمون Playwright دستیار تکمیل شد (۱۴/۱۴ در اجرای تکراری؛ یک شکست زمان‌بندی بی‌ارتباط در اجرای اول تکرار نشد).
- **Requires Owner Decision:** (۱) فیلم و شعار جدید روی Production هنوز نیستند: صفحهٔ اصلی منتشرشدهٔ Production بلوک فیلم ندارد؛ بارگذاری فیلم تمیز در کتابخانهٔ Production، «تأیید انتشار» مالک و انتشار بلوک فیلم لازم است. (۲) عکس قطعهٔ `05402068`: بارگذاری دوباره یا افزودن پیشوند `catalog/` به سیاست خواندن عمومی باکت (پنل آروان). (۳) فضای دیسک سرور ۹۱٪؛ پاک‌سازی build cache/imageهای قدیمی نیازمند تأیید مالک.


### آماده‌سازی انتشار Production — 2026-10-24 ~22:00 Asia/Tehran

- **دستور مالک:** آماده‌سازی، commit/push به همین مخزن، PR در صورت نیاز گردش کار، انتشار روی مقصد موجود و بررسی نسخهٔ منتشرشده؛ بدون force push، بدون تغییر تنظیمات واقعی Production برای آزمایش، بدون دورزدن ورود.
- **وضعیت مبنا (بررسی واقعی):** main و سرور Production هر دو `901c037` (PR29/PR30؛ سرور روی `deploy/pr30-20261022`، درخت تمیز). شاخهٔ ویژگی شامل `901c037` است. main محافظت‌شده نیست ولی گردش کار پروژه PR → merge → انتشار است. روش انتشار جاری: پوشهٔ نسخهٔ نامزد، imageهای برچسب‌دار، فایل images سنجاق‌شده، rollout اسکریپتی با بازگشت خودکار و wrapper `hedax-compose-current`.
- **Completed & Tested — DEMO:** دادهٔ DEMO و «سازندهٔ نمونه» فقط در DB آزمایشی محلی (seed توسعه) است؛ Production (بررسی فقط‌خواندنی API/HTML عمومی) هیچ کالای DEMO ندارد (۲۴ قطعهٔ واقعی در /fa/parts). seed توسعه خارج از APP_ENV=development اجرا نمی‌شود.
- **Completed & Tested — پیش‌نمایش کد جدید با دادهٔ واقعی Production (فقط GET، درخواست غیر GET مسدود):** صفحهٔ اصلی Production بلوک فیلم ندارد (legacy hero + محصولات + بخش دیگر)؛ پس انتشار کد ظاهر را به‌روز می‌کند ولی فیلم/شعار جدید فقط پس از بارگذاری فیلم در کتابخانهٔ Production، «تأیید انتشار» مالک و انتشار بلوک فیلم دیده می‌شود.
- **Completed & Tested — اصلاح‌ها:** (۱) عکس قطعهٔ `05402068` روی Production 403 می‌دهد (کلید قدیمی `catalog/` خارج از پیشوند عمومی باکت) — اکنون `PartImage` در کارت، گالری و سبد به‌جای تصویر شکسته جانگهدار SOURCE نشان می‌دهد؛ اصلاح ریشه‌ای: بارگذاری دوبارهٔ عکس یا افزودن پیشوند در سیاست باکت (پنل آروان، با مالک). (۲) دروازهٔ انتشار، لوگوی اختصاصی فیلم (تصویر محتوای خود مالک) را دیگر «فیلم بدون تأیید» حساب نمی‌کند؛ پیش‌تر هر لوگوی اختصاصی انتشار را برای همیشه مسدود می‌کرد. فیلم‌ها، پوسترها و تصاویر جایگزین همچنان نیازمند تأییدند (آزمون ۸۲).
- **Completed & Tested — پنل ظاهر روی stack یک‌بارمصرف (فقط فایل‌های مصنوعی خودم «تأیید انتشار» شدند):** تعویض ویدیو + شعار + لوگوی فیلم → انتشار موفق → صفحهٔ عمومی پس از دو بار بارگذاری همان مقادیر؛ پنل پس از reload همان مقادیر؛ عنوان انگلیسی دست‌نخورده. لوگوی سایت (محتوا ← عمومی)، آواتار راهنما، Instagram و LinkedIn: ذخیره، بارگذاری مجدد و نمایش عمومی. راهنما به پرسش «لنت ترمز جلو» با provider آزمایشی پاسخ داد. مهمان در صفحه‌های پنل فقط پیام «لطفاً وارد حساب شوید» و دکمهٔ ورود کارکنان می‌بیند؛ API مدیریت 401.
- **آزمون‌ها:** web/API typecheck؛ ESLint 0 error (۲ هشدار قدیمی)؛ API unit 105/105؛ integration کامل 159 passed / 1 skipped / 0 failed؛ Playwright 64/64؛ build تولیدی Next 16.4.2 موفق.
- **مستندات:** README (en/fa) با امکانات ظاهر سایت و دستورهای آزمون؛ `docs/DEPLOYMENT.md` با روش نسخهٔ قابل بازگشت و جریان فیلم/تأیید انتشار (بدون نشانی سرور یا راز)؛ تاریخ وضعیت عمومی. `.gitignore`: `/hero-videos/`.
- **Pending:** migrationهای افزایشی `20261022100000_visual_media_video` و `20261024100000_vehicle_brand_logo` روی Production اجرا نشده‌اند (هر دو فقط ADD COLUMN). قدم بعدی: commit، push، PR، CI، merge، پشتیبان، build نسخهٔ نامزد، migration، rollout و بررسی عمومی.


### امنیت وابستگی‌ها، فیلم تمیز در کتابخانهٔ تست و Hero خلوت‌تر — 2026-10-24 ~19:00 Asia/Tehran

- **دستور مالک:** بررسی تازهٔ وابستگی‌ها و رفع هدفمند؛ آماده‌سازی فیلم بدون واترمارک از مسیر کتابخانهٔ رسانهٔ محیط تست بدون دورزدن اعتبارسنجی/تأیید انتشار؛ پنهان‌کردن پاراگراف توضیحی Hero (fa/en) بدون حذف داده/فیلد؛ عنوان فعلاً بدون تغییر؛ بدون Push/Merge/Deploy/Production.
- **مبنا:** HEAD `a316529`؛ یادداشت commit‌نشدهٔ جلسهٔ قبل (جایگزینی محلی فیلم تمیز) حفظ و همراه این مرحله commit شد.
- **Completed & Tested — امنیت (منبع رسمی):** GitHub Advisory Database: `GHSA-2464-fhr4-w9xw` (RCE در Image Optimization با SVG، روی glibc Linux؛ راه موقت sharp>=0.35.5) و `GHSA-673q-mjm6-r5xr` (RCE در `use cache` با typed array) هر دو critical، بازهٔ آسیب‌پذیر `>=16.0.0 <=16.4.0`، اولین نسخهٔ اصلاح‌شده `16.4.1` (یادداشت انتشار رسمی v16.4.1 همین دو را نام می‌برد). هیچ advisory منتشرشده‌ای برای 16.4.1–16.4.3 نبود. وجود advisory اثبات بهره‌برداری عملی از این سایت نیست؛ مسیر Image Optimization و نوع لینوکس سرور Production بررسی نشد.
  - تغییرها: `next` و `@next/eslint-plugin-next` 16.3.7→**16.4.2** (شامل هر دو اصلاح بحرانی + backportهای پایداری؛ 16.4.3 یک‌روزه بود)؛ `zod` 4.6.5→4.6.6 (web/api/contracts)؛ `multer` 2.4.0→2.5.0؛ `nodemailer` 10.1.0→10.1.4؛ overrides دقیق در `pnpm-workspace.yaml` فقط برای نسخه‌های آسیب‌پذیر موجود در lockfile (همان major): body-parser 2.3.0→2.4.0، mysql2 3.15.3→3.24.6، fast-uri 3.1.8→3.1.9، source-map-js 1.2.1→1.2.2، multer 2.4.0 (کپی Nest)→2.5.0، vite 8.3.1 (فقط dev/vitest)→8.3.3. sharp مورد استفادهٔ Next: 0.35.5.
  - `pnpm audit --prod`: پیش‌تر 2 critical / 8 high / 12 moderate / 3 low → اکنون **0 critical / 1 high / 1 moderate / 0 low**. audit کامل (با dev): 0 / 1 / 1 / 0.
  - **Deferred Later (باقی‌مانده):** `deepmerge-ts` 7.1.5 (high، GHSA-ggr8-5vv4-36mx) با pin دقیق `@prisma/config` 7.10.0؛ اصلاح فقط در 8.0.0 (major) و فقط هنگام اجرای CLI روی `prisma.config` خودمان (ورودی کاربر نمی‌رسد) — با ارتقای Prisma جداگانه. `uuid` 8.3.2 در exceljs (moderate، GHSA-w5hq-g745-h8pq) فقط v3/v5/v6 با buf؛ اصلاح در 11.x (major) — بدون تغییر.
- **Completed & Tested — جدایی محیط تست:** launcher فقط متغیرهای سیستمی را عبور می‌دهد (بدون DATABASE_URL/S3 به ارث رسیده)، با وجود `.env` وب اجرا را رد می‌کند؛ API فایل `.env` بارگذاری نمی‌کند (فقط `.env.example` در مخزن)؛ PostgreSQL embedded در پوشهٔ موقت `hedax-home-review-*` روی 127.0.0.1:55449؛ ذخیره‌سازی `STORAGE_DRIVER=local` در همان پوشه؛ پرداخت none، پیامک dev-log، ایمیل none، AI mock.
- **Completed & Tested — فیلم تمیز در کتابخانهٔ رسانهٔ تست:** فایل‌های review-media (۱۲ ثانیه، MP4 دسکتاپ 1280×720 2.5MB، WebM 1.4MB، MP4 موبایل 854×480 0.9MB، poster/still WebP) با نام‌های `source-hero-clean-*` از مسیر عادی «تصاویر و رسانه‌ها» بارگذاری شدند: هر سه ویدیو «بررسی، اسکن و ذخیره شد» و برچسب «بدون تأیید انتشار». بلوک فیلم (پیش‌نویس) کلیپ ۱ + پوسترها + تصاویر جایگزین را از کتابخانه گرفت؛ «یک بار پخش» و نمایش لوگو بدون تغییر ماند. «انتشار تغییرات» با پیام «انتشار متوقف شد: … تأیید انتشار عمومی ندارد» رد شد و سند عمومی دست‌نخورده ماند. پیش‌نمایش خصوصی: دسکتاپ WebM و موبایل MP4 از `/media/content/video/…`، ۱۲ ثانیه، بی‌صدا، بدون loop. بررسی بصری: گوشهٔ قاب‌های آغاز/میانه/پایان و poster/stillها بدون واترمارک.
  - **Requires Owner Decision:** «تأیید انتشار» (اظهار مجوز، با ثبت نام تأییدکننده) عمداً ثبت نشد. صفحهٔ عمومی پیش‌نمایش همچنان فایل‌های تمیز review-media محلی را پخش می‌کند؛ برای Production باید همین فایل‌ها در کتابخانهٔ Production بارگذاری و توسط مالک «تأیید انتشار» شوند.
- **Completed & Tested — Hero:** پاراگراف توضیحی (`b.body`) دیگر در Hero عمومی (fa/en و پیش‌نمایش) رندر نمی‌شود؛ متن ذخیره‌شده، فیلد «متن» در پنل و ساختار داده بدون تغییر؛ زیر فیلد «متن» بلوک فیلم راهنمای «ذخیره می‌شود، اما فعلاً در Hero عمومی نمایش داده نمی‌شود.» افزوده شد. عنوان تغییر نکرد. فاصلهٔ عنوان تا جست‌وجو: ۲۴px دسکتاپ، ۱۶px موبایل (بدون فضای خالی).
- **آزمون‌ها (همه محلی):** build تولیدی Next 16.4.2 (Turbopack) موفق؛ web/API typecheck؛ ESLint 0 error (۲ هشدار قدیمی)؛ contracts 22/22، domain 132/132، API unit 105/105؛ API integration کامل **159 passed / 1 skipped / 0 failed**؛ Playwright مخزن **64/64**. مرورگر واقعی build تولیدی (fa/en؛ ۱۴۴۰، ۷۶۸، ۳۹۰، ۳۶۰): پاراگراف 0، label/placeholder/دکمه/«انتخاب خودروی من» سالم، پخش→توقف (زمان ثابت)→ادامه→پایان در ۱۲s با «پخش دوباره» و دقیقاً ۱ لوگوی قابل‌مشاهده→پخش دوباره (لوگو پنهان)، muted، بدون autoplay attribute و loop؛ reduced-motion: حالت still، ۰ درخواست فیلم، تصویر جایگزین دسکتاپ/موبایل؛ overflow افقی 0، تصویر شکسته 0، خطای console 0. جست‌وجو `/fa/parts?q=` 200؛ «انتخاب خودروی من» → `/fa/cars` → صفحهٔ خودرو (در دادهٔ آزمایشی هیچ خودرویی قطعهٔ منتشرشده ندارد؛ empty state با «درخواست تأمین قطعه»)؛ `/fa/brands/toyota` و `iran-khodro` قطعه نشان دادند؛ fitment.spec 5/5. پنل: فیلد «متن» fa/en با متن قبلی و راهنما.
- **فایل‌ها:** `package.json`، `apps/web/package.json`، `apps/api/package.json`، `packages/contracts/package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `apps/web/src/components/builder/cinematic-hero.tsx`، `apps/web/src/components/builder/settings.tsx`، `apps/web/AGENTS.md` (بلوک تولیدی Next 16.4.2)، این فایل. `docs/import/*.xlsx` و `next-env.d.ts` تولیدی بازگردانده شدند. تصاویر: `Desktop/SOURCE-HERO-CLEAN-2026-10-24`.
- **پیش‌نمایش:** `http://localhost:3192/fa` در حال اجرا (stack `hedax-home-review-Nn6Ble`). ورود آزمایشی مالک و کلید TOTP همین stack یک‌بارمصرف در همان پوشهٔ موقت (`owner-login.txt`، `owner-totp.txt`) — مقدار آن‌ها اینجا ثبت نشده است.
- **قدم بعدی دقیق:** بازبینی مالک؛ انتخاب شعار نهایی؛ در صورت تأیید: Push شاخه و PR، استقرار با تأیید جداگانه، اجرای migration افزایشی `20261024100000_vehicle_brand_logo`، بارگذاری فیلم تمیز در کتابخانهٔ Production و ثبت «تأیید انتشار» توسط مالک، سپس انتشار بلوک فیلم. سلامت Production در این مرحله بررسی نشده است.


### بازبینی پخش و آمادگی انتشار — 2026-10-24، پس از جایگزینی رسانه

- **Completed & Tested (فقط محلی):** گزارش مالک دربارهٔ پخش بررسی شد. وضعیت اولیه video: `ended=true,currentTime=12,loop=false,readyState=4`؛ «پخش دوباره» فیلم را اجرا کرد. در reload دسکتاپ حالت DOM `ondemand` بود؛ طبق `cinematic-film.tsx` اتصال طبقه‌بندی‌شدهٔ 3g به پخش دستی می‌رود. کلیک پخش در ۱۴۴۰×۹۰۰، WebM دسکتاپ را با `paused=false,readyState=4` اجرا کرد؛ در ۳۹۰×۸۴۴ نیز MP4 موبایل همین وضعیت را داشت. overflow و تصویر شکسته در هر دو صفر؛ خطای console در نمونهٔ دسکتاپ صفر. viewport به حالت عادی بازگشت. تنظیم once/loop تغییر نکرد.
- هشت درخواست محلی خانه fa/en، جست‌وجوی قطعه، خودروها، برندها، درخواست تأمین، تماس و سبد HTTP 200 دادند؛ این بررسیِ بارگذاری است و جای آزمون تراکنش واقعی/Production نیست.
- **Blocked External / آمادگی انتشار تأیید نشد:** اجرای تازهٔ `pnpm audit --prod --json`، ۲ critical، ۸ high، ۱۲ moderate و ۳ low گزارش کرد. هر دو critical مربوط به Next (`GHSA-2464-fhr4-w9xw` و `GHSA-673q-mjm6-r5xr`؛ نسخهٔ اصلاح‌شدهٔ گزارش >=16.4.1) هستند. این شناسایی advisory در dependency است، نه اثبات قابل‌بهره‌برداری‌بودن مسیرهای همین سایت. ارتقا و آزمون سازگاری انجام نشده است. رسانهٔ تمیز نیز همچنان فقط در review-media محلی است و وارد کتابخانهٔ انتشار نشده.
- بدون تغییر کد/تنظیمات/DB یا Production، بدون انتشار. قدم بعدی: رفع هشدارهای امنیتی و بررسی مجدد، آماده‌سازی رسانه در کتابخانه، سپس بررسی نسخهٔ هدف و تأیید انتشار مالک. HEAD همان `a316529`، تنها تغییر tracked یادداشت PROGRESS است.

### نسخهٔ رسمی بدون واترمارک Hero — 2026-10-24 16:19 +03:30

- **دستور مالک:** دانلود خروجی بدون واترمارک از حساب واردشدهٔ Kling و قراردادن در همین سایت تست محلی؛ Production مجاز نشد.
- **Completed & Tested:** گزینهٔ رسمی `Without Watermark` در حساب Standard روشن و فایل همان فیلم انتخاب‌شدهٔ v2 (`kling_20261021_VIDEO_Create_a_p_4310_0 (2).mp4`) دریافت شد؛ تطبیق تصویر با منبع قبلی و نبود نشان Kling در contact sheet ده‌فریم تأیید شد. SHA-256 منبع تمیز: `aff3366cec1a3390b4ad4dcf755138c4e89c4185c4baf3a89baeaa2f8f844087`.
- تدوین قبلی (۰–۶٫۴ ثانیه، سرعت ۲/۳، توقف انتهایی، ۱۲ ثانیه، بی‌صدا) حفظ شد؛ نسخه‌های MP4 دسکتاپ/موبایل، WebM و poster/still بازتولید و فقط در مسیر git-ignored `apps/web/public/review-media/source-hero/v2/` جایگزین شدند. کد و DB/تنظیمات پنل تغییر نکرد. فایل‌های قبلی در `Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an-4/work/hero-before-clean/` پشتیبان دارند.
- هر سه فیلم کامل decode شدند (exit 0)؛ HTTP 200 و تطبیق هش فایل سرو‌شده با فایل جدید برای هر سه فیلم و poster/still دسکتاپ تأیید شد. مرورگر واقعی `/fa`: فایل موبایل ۱۲ ثانیه، readyState=4، پخش فعال بدون خطای media؛ تصویر انتهایی با لوگوی رسمی و بدون واترمارک مشاهده شد. خروجی اصلی/وب و تصویر نتیجه در `Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an-4/outputs/` ذخیره شدند.
- HEAD بررسی‌شده `a316529`؛ پیش از این مرحله درخت Git تمیز بود؛ تنها تغییر tracked این یادداشت است. بدون commit/push/deploy. دانلود اول `VIDEO_03` فیلم دیگری بود و در سایت استفاده نشد.
- **Requires Owner Decision:** انتشار عمومی همچنان جداگانه نیازمند تأیید مالک و ورود رسانه به کتابخانه/فرایند تأیید انتشار پنل است؛ این جایگزینی محلی آن دروازه را تغییر نمی‌دهد. یادداشت‌های قدیمی «منبع دارای واترمارک» دربارهٔ فایل قبلی‌اند؛ منبع تمیز اکنون دریافت شده است. قدم بعدی: بازبینی مالک در `http://localhost:3192/fa`.

### اصلاحات متمرکز آمادگی انتشار — 2026-10-24 ~15:30 Asia/Tehran

- **دستور مالک:** اصلاح‌های سریع پیش از انتشار بدون بازنویسی: شعار Hero «قطعهٔ درست، برای خودروی شما»، مدیریت بدون کد (Hero، آواتار راهنما، برندها، فوتر/راهنما)، کارت برند با لوگو، تفکیک «برند خودرو»/«سازندهٔ قطعه»، راهنمای کوچک‌تر و غیرمزاحم، فوتر، موبایل/دسترس‌پذیری/سرعت، QA و گزارش. انتشار عمومی فقط پس از تأیید صریح مالک.
- **مبنا:** HEAD `50508fa`؛ commit این مرحله `3a52c95` (فقط محلی، بدون Push/PR). پیش‌نمایش تمیز روی `http://localhost:3192` در حال اجرا.
- **Completed & Tested — Hero:** پیش‌فرض بلوک: عنوان «قطعهٔ درست، برای خودروی شما» و توضیح جست‌وجو با نام/شماره فنی/OEM یا انتخاب خودرو (fa/en جدا). جست‌وجوی اصلی داخل Hero (دکمهٔ نارنجی «جست‌وجوی قطعه» → `/fa/parts?q=`)، اقدام دوم «انتخاب خودروی من» → `/fa/cars` (200). جست‌وجوی هدر روی موبایل فقط در صفحهٔ اصلی پنهان (یک جست‌وجوی اصلی). ارتفاع Hero و فاصله‌ها کوتاه‌تر (۳۶۰/۳۹۰: جست‌وجو در اولین صفحه، پایین ≈۴۶۶px از ۸۰۰). فیلم بی‌صدا، کنترل توقف، reduced-motion بدون فیلم و با تصویر ثابت. فیلم بازبینی با واترمارک فقط در stack محلی؛ دروازهٔ انتشار (MEDIA_NOT_CLEARED) همچنان انتشارش را رد می‌کند.
- **Completed & Tested — مدیریت در پنل (ذخیره، بارگذاری مجدد، نمایش عمومی، رد ورودی نامعتبر):**
  - لوگو و نام fa/en برند خودرو: «کاتالوگ ← دسته‌ها و برندها» (ویرایش هر برند؛ فقط `products.write`). ستون جدید `vehicle_brand.logo_url` با migration افزایشی `20261024100000_vehicle_brand_logo` (بدون حذف/تغییر داده).
  - نمایش نام فارسی زیر نام انگلیسی: بلوک برندها در «مدیریت ظاهر سایت» (و «محتوای سایت ← صفحهٔ اصلی» برای صفحهٔ اصلی غیربصری)؛ `/brands` اکنون از همان بلوک منتشرشدهٔ صفحهٔ اصلی پیروی می‌کند (یک منبع).
  - آواتار راهنما: «دستیار ← ظاهر و انیمیشن» (پیش‌نمایش دایره‌ای؛ فقط `settings.manage`؛ خالی = کاراکتر پیش‌فرض).
  - شبکه‌های اجتماعی (Instagram/LinkedIn): «محتوای سایت ← شبکه‌های اجتماعی»؛ فقط https؛ ردیف بدون نشانی یا مخفی نمایش داده نمی‌شود. ساعت پاسخ‌گویی: «محتوای سایت ← تماس». صفحات راهنما: «محتوای سایت ← صفحه‌ها» (help-buying/sourcing/shipping/returns).
  - عنوان/متن Hero: «مدیریت ظاهر سایت ← بلوک فیلم» (پیش‌نویس، پیش‌نمایش خصوصی، انتشار).
- **Completed & Tested — امنیت ورودی:** `contentImageSchema` اکنون نشانی protocol-relative (`//host/…`) را رد می‌کند (پیش‌تر پذیرفته می‌شد؛ برای همهٔ تصاویر محتوا).
- **Completed & Tested — کارت برند/بخش‌ها:** `BrandCard` مشترک (کادر ثابت، `object-contain`، بدون کشیدگی؛ بدون لوگو = نام لاتین به‌صورت تایپ، بدون لوگوی ساختگی؛ نام انگلیسی زیر لوگو، فارسی اختیاری)؛ برچسب «برند خودرو» و «سازندهٔ قطعه»؛ گذار تیره→روشن کوتاه (۱٫۵rem)؛ فاصلهٔ بالای بخش‌ها روی موبایل کمتر؛ لینک‌های صفحهٔ تماس و فوتر ≥۴۴px؛ اینستاگرام/لینکدین با آیکن فقط با نشانی معتبر.
- **Completed & Tested — راهنما (چت‌بات):** کاراکتر تمام‌قد → آواتار دایره‌ای (۶۲px دسکتاپ، ۵۴px موبایل)؛ دسکتاپ: پنل کناری بدون تیره‌کردن صفحه و صفحه قابل کلیک (۴۱۶×۴۷۳px)؛ موبایل: modal هم‌راستا با viewport/کیبورد؛ Escape، بازگشت فوکوس؛ سرویس پاسخ‌گویی دست‌نخورده. محاسبهٔ برخورد اصلاح شد (کارت‌ها/ردیف‌های بزرگ فقط محل متن/آیکن): دیده‌شدن در اسکرول `/fa` ۱۳/۱۴ و `/fa/parts` ۷/۷ (پیش‌تر ۸/۱۴ و ۳/۷). مسیرهای مجاز راهنما (allowlist قبلی: خانه، قطعات، وارداتی، تماس، درخواست) تغییر نکرد. باگ کشیدن (drag) که با حذف `pointer-events:none` تصویر پیش می‌آمد رفع شد.
- **آزمون‌ها (همه محلی):** contracts 22/22؛ API unit 105/105؛ API typecheck؛ integration کامل 158/160 در اجرای اول (۱ skipped؛ `80-staff-erasure` timeout ۱۵۰s هم‌زمان با build سنگین — اجرای جداگانه 3/3 موفق)؛ آزمون جدید `97-release-content` + `96` با هم 7/7 (ذخیره/نمایش عمومی/رد `javascript:`، `//host`، svg خارجی/`.html`؛ مهمان 401، پشتیبانی 403؛ حفظ مقدار قبلی پس از ذخیرهٔ ناموفق؛ سازگاری تنظیمات قدیمی بدون avatarUrl). `96` برای ترتیب مستقل، شمارش audit را نسبی کرد (audit فقط‌افزودنی است). web typecheck؛ ESLint 0 error (۲ هشدار قدیمی cinematic-film). Playwright مخزن **64/64** (پس از رفع drag و پنهان‌کردن نشانگر dev سرور Next فقط در آزمون دستیار). بررسی مرورگر واقعی build تولیدی در ۳۶۰/۳۹۰/۷۶۸/۱۴۴۰: overflow 0، تصویر شکسته 0، input بدون label 0، لینک خالی 0، خطای console جدید 0 (فقط 401 مهمان `/me` قدیمی). E2E پنل→عمومی روی stack یک‌بارمصرف با دادهٔ آزمایشی مصنوعی: 7/7.
- **سرعت (A/B هم‌زمان با build `50508fa` در worktree موقت، cold، میانهٔ ۵):** دسکتاپ همه برابر/بهتر (خانه LCP 0.52→0.44s، قطعات 1.22→0.49s، CLS 0.011→0.002)؛ موبایل slow-4G+4×CPU خانه 2.95→2.23s، قطعات 4.20→2.32s؛ قطعه/سبد (بدون تغییر کد در این مرحله) با نوسان ±1.5s بدتر دیده شد — نوسان ماشین (بار پس‌زمینه ~۳۵٪). worktree موقت حذف و prune شد.
- **فایل‌های تغییرکرده:** contracts (`assistant.ts`, `assistant-public.ts`, `builder.ts`, `catalog.ts`, `content.ts`)؛ `database/prisma/schema.prisma` + migration جدید؛ API (`admin-catalog.controller.ts`, `catalog.service.ts`, آزمون‌های `96`/`97`)؛ web (`brand-card.tsx` جدید، `legacy-home.tsx`, `makers-home.tsx`, `brands/page.tsx`, `cinematic-hero.tsx`, `cinematic.css`, `globals.css`, `hedax-assistant-widget.tsx`, `assistant-settings.tsx`, `catalog-ops.tsx`, `content/home.tsx`, `contact-details.tsx`, `site-footer-view.tsx`, `fixtures/data.ts`, پیام‌های fa/en، `e2e/assistant.spec.ts`)؛ `scripts/home-review-local.mjs` (کلید تصادفی بازسازی کش در هر اجرا، ذخیره‌نشده). فایل‌های تولیدی `docs/import/*.xlsx` و `next-env.d.ts` بازگردانده شدند.
- **Requires Owner Decision / Blocked External:**
  - فایل فیلم بدون واترمارک با مجوز روشن (فیلم فعلی KlingAI واترمارک دارد و فقط محلی است).
  - لوگوهای رسمی برندهای خودرو (ایران‌خودرو، سایپا، تویوتا، هیوندای) با مجوز استفاده؛ تا آن زمان نام به‌صورت تایپ نمایش داده می‌شود.
  - عکس قطعهٔ بدون تصویر Production (SKU 0050104801) و نشانی LinkedIn؛ تأیید ادعای «پشتیبانی ۲۴ ساعته، ۷ روز هفته» در محتوای تماس.
  - به‌روزرسانی امنیتی Next.js 16.3.7 (هشدارهای بحرانی، Production فعلی هم) در شاخهٔ جدا.
  - Preview میزبانی‌شده (`preview.sourcebyhedax.ir` NXDOMAIN) نیازمند سرور/DNS/TLS/رمز.
- **قدم بعدی دقیق:** بررسی مالک روی `http://localhost:3192/fa` و پوشهٔ `Desktop/SOURCE-RELEASE-FIXES-2026-10-24` (before/after/panel-test-data). پس از تأیید صریح: Push شاخه، PR به main، اجرای migration افزایشی در Production فقط با تأیید، افزودن بلوک فیلم با رسانهٔ مجاز از پنل. هیچ Push/Merge/Deploy/تغییر Production انجام نشده است.


### آماده‌سازی پیش‌نمایش برای بررسی طراحی مالک — 2026-10-24 ~11:20 Asia/Tehran

- **تصمیم مالک:** فاز ۴ برای بررسی بصری تأیید شد؛ دستور: بدون تغییر طراحی/منطق، اجرای نسخهٔ آزمایشی، ارائهٔ نشانی‌ها، بررسی رسانهٔ Hero، جدایی از Production، بررسی فقط‌خواندنی preview.sourcebyhedax.ir، تصاویر، گزارش آمادگی؛ سپس توقف.
- **مبنا:** HEAD `1749f9c`، درخت تمیز، main بدون commit تازه. هیچ کد طراحی/منطق تغییر نکرد (فقط این یادداشت).
- **Completed & Tested — پیش‌نمایش محلی:** stack ایزوله با build تولیدی روی `http://localhost:3192` در حال اجرا (صفحهٔ اصلی `/fa`، فروشگاه `/fa/parts`، پنل `/fa/admin/appearance`).
- **Completed & Tested — رسانهٔ Hero:** هر هفت فایل سند منتشرشده (MP4/WebM دسکتاپ، MP4 موبایل، پوسترها و تصاویر ثابت WebP) HTTP 200، MIME درست، حجم دقیق و Range 206؛ پیش‌بارگذاری پوستر در هدر Link؛ مرورگر واقعی ۶ زمینه: پخش تا پایان، لوگو یک‌بار، reduced-motion بدون دانلود فیلم، بدون خطا/overflow.
- **Completed & Tested — جدایی از Production:** ۹ پردازش stack فقط روی 127.0.0.1 گوش می‌دهند و **هیچ اتصال خروجی به میزبان غیرمحلی** ندارند؛ PostgreSQL embedded با data dir در پوشهٔ موقت؛ بدون `.env` (لانچر بارگذاری را رد می‌کند و فقط متغیرهای سیستمی را عبور می‌دهد)؛ AI=mock و live calls خاموش؛ پرداخت none، ایمیل none، پیامک dev-log، storage محلی، صف inline.
- **Blocked External — preview.sourcebyhedax.ir:** امروز DNS عمومی (Google 8.8.8.8) NXDOMAIN؛ مطابق `docs/PREVIEW_ISOLATION_PROFILE.md` سرور/ingress جدا، رکورد DNS، TLS و محافظت با گذرواژه هنوز «Missing» است؛ فایل‌های compose/Caddy آماده‌اند ولی اجرا نشده‌اند. هیچ تغییر زیرساختی انجام نشد.
- **تصاویر بررسی:** `Desktop/SOURCE-PREVIEW-REVIEW-2026-10-24/` (خارج از Git): ۲۴ تصویر دسکتاپ/موبایل فقط‌خواندنی و مهمان (بدون سبد، بدون مشتری آزمایشی، بدون ورود به پنل تا MFA حساب آزمایشی مالک دست نخورد) + ۶ تصویر پنل از آزمون 13/13 همین نسخه + README.
- **آمادگی انتشار — باقی‌مانده‌های ضروری (همه Requires Owner Decision):** (۱) **وصلهٔ امنیتی Next.js 16.3.7 (Critical RCE؛ سایت زنده هم)** روی شاخهٔ جدا؛ (۲) نسخهٔ بدون واترمارک فیلم برای انتشار عمومی (آپلود در کتابخانه + تأیید انتشار)؛ (۳) Preview میزبانی‌شده (سرور/DNS/TLS/گذرواژه) و اندازه‌گیری PageSpeed روی آن؛ (۴) تأیید شخصی طراحی؛ (۵) سپس PR بازبینی و تصمیم Merge/انتشار با تأیید صریح. Deferred: فونت‌ها، بازطراحی عمیق‌تر بخش حساب، بخش‌های legacy صفحهٔ اصلی (قابل تنظیم در پنل)، فاز ۵ دستیار.
- **وضعیت:** Production، DNS، سرور، `.env` و دادهٔ اصلی دست نخوردند؛ هیچ PR ساخته/Merge نشد.


### تکمیل فاز ۴ — حساب کاربری، تصویر جایگزین، یکپارچگی و آزمون‌ها — 2026-10-24 ~10:35 Asia/Tehran

- **تصمیم مالک:** فاز ۴ به‌صورت مشروط تأیید شد؛ دستور: هماهنگی حساب کاربری، تصویر جایگزین با هویت SOURCE، بررسی دستیار، یکپارچگی کل صفحات، رفع/مستندسازی تست ناموفق، اجرای دوبارهٔ تست‌های امنیتی/عملکردی/خرید/پنل؛ بدون Merge/انتشار/Production.
- **مبنا:** HEAD `179140b`، درخت تمیز، main بدون commit تازه.
- **Completed & Tested — حساب کاربری:** `AccountShell` با بند فصل (`titleAs="p"` تا هر صفحه H1 خودش را داشته باشد)، منوی کناری کارت‌دار با حالت فعال stage/electric؛ `.card` مشترک (بخش‌ها، جدول‌ها، کارت‌ها) در `.store` ارتفاع/سایهٔ جدید گرفت؛ صفحهٔ نمای کلی: H1 = نام مشتری یا موبایل ماسک‌شده (LTR ایزوله، قبلاً در RTL وارونه دیده می‌شد) و زیرعنوان «حساب کاربری» (حذف تکرار). نمای کلی، سفارش‌ها، درخواست‌ها، سفارش‌های تأمین، پیام‌ها، اعلان‌ها، مرجوعی، نشانی‌ها و پروفایل — دسکتاپ و موبایل.
- **Completed & Tested — تصویر جایگزین:** `components/store/part-placeholder.tsx`: کاشی «نقشهٔ فنی» SOURCE (زمینهٔ stage/navy، شبکهٔ blueprint، طرح هاب/دیسک با خط اندازه به رنگ signal، نشان SOURCE و برچسب صادق «بدون تصویر»)؛ SVG/CSS درون‌خطی، بدون دانلود، سازگار با CSP؛ فقط وقتی محصول عکس ندارد در کارت قطعه، صفحهٔ قطعه و سطر سبد؛ در کادرهای کوچک موبایل متن فقط برای صفحه‌خوان. هیچ عکس یا دادهٔ واقعی حذف/بازنویسی نشد؛ placeholderهای پنل مدیریت دست نخوردند.
- **Completed & Tested — دستیار:** بررسی شد؛ لانچر و پنل (هدر stage، تأکید signal، WebP کاراکتر) با طراحی هماهنگ‌اند؛ باز/بسته شدن در دسکتاپ و موبایل آزموده شد. تغییر بیشتری لازم نبود؛ قابلیت‌ها دست نخوردند.
- **Completed & Tested — یکپارچگی:** جست‌وجوی رنگ‌های قدیمی در کد فروشگاه؛ باقی‌ماندهٔ carbon/tech-light (شمارهٔ مراحل checkout، آیکن ورود کارکنان، لینک درخواست تأمین هدر، شمارندهٔ سبد، منوی موبایل، hover پیام‌ها) به توکن‌های stage/signal/electric یکسان شد. سیاست دکمه: نارنجی فقط اقدام خرید، آبی برای سایر اقدام‌ها؛ فونت‌ها یکسان (Vazirmatn/Montserrat)؛ RTL/LTR و موبایل در همهٔ صفحات آزموده شد.
- **Completed & Tested — تست ناموفق باقی‌مانده (`storefront › site content panel…`):** علت دولایه: (۱) **محیط آزمون:** از commit `5eba97e` مسیر `/admin/content/home` به ویرایشگر بصری می‌رود و backend آزمایشی (fixtures) endpoint صفحه‌ساز نداشت → ویرایشگر بارگذاری نمی‌شد. endpointهای فقط‌خواندنی `/admin/content/builder[/:slug[/history]]` و `/admin/content/media` به `lib/fixtures/handler.ts` اضافه شد (همان پیش‌نویس آغازین API). (۲) پس از آن یک **باگ واقعی** که پنهان مانده بود دیده شد: ویرایشگر ظاهر در موبایل 360px به‌اندازهٔ 32px اسکرول افقی داشت، چون قاعدهٔ قدیمی `.builder-panel input{width:100%}` ورودی‌های فایل پنهان (sr-only) را پهن می‌کرد → `builder.css` اصلاح شد. اکنون موفق.
- **آزمون‌ها (همه exit 0 مگر ذکر شود):** Playwright مخزن **64/64** (با keep-awake). API integration کامل روی PostgreSQL واقعی موقت: **156 موفق، 1 skip، 1 شکست محیطی** (`78-my-account › changes the password…` در اجرای کامل 1200 ثانیه طول کشید = خواب/تعلیق PC و شکستن پنجرهٔ TOTP؛ اجرای مجدد با keep-awake: 3/3 موفق). unit: domain 132، contracts 22، API 105. web typecheck/ESLint بدون خطا. هدرهای امنیتی پیش‌نمایش (CSP، nosniff، X-Frame-Options DENY، Referrer/Permissions-Policy) سالم. مرورگر واقعی build تولیدی: فروشگاه ۳۴/۳۴، حساب کاربری ۱۸/۱۸ (ورود OTP محلی)، Hero ۶/۶، مسیر خرید (قطعه→سبد) دسکتاپ و موبایل، نوار خرید موبایل، E2E پنل مدیریت ظاهر **13/13**، بدون خطای console. فایل‌های نمونهٔ `docs/import/*.xlsx` که تست 40-imports بازتولید می‌کند بازگردانده شدند (commit نشدند).
- **سرعت:** A/B هم‌زمان با build فاز ۴ (`179140b`): دسکتاپ پایدار و برابر (LCP 0.5–1.6s، CLS ≤0.011). موبایل در این نوبت به‌علت بار سنگین پس‌زمینهٔ PC (~47% CPU از برنامه‌های دیگر) اعداد مطلق نامعتبر و بسیار پراکنده داشت (هر دو نسخه)، اما در مقایسهٔ درهم‌تنیده میانهٔ LCP «بعد» در ۵ از ۵ صفحهٔ موبایل برابر یا کمتر از «قبل» بود؛ حجم +0 تا +20KB. مرجع مطلق معتبر همان اندازه‌گیری فاز ۴ (LCP موبایل 1.6–2.0s) است.
- **🔴 یافتهٔ امنیتی مهم (Requires Owner Decision):** `pnpm audit --prod`: نسخهٔ نصب‌شدهٔ **Next.js 16.3.7** دو آسیب‌پذیری **Critical** (اجرای کد از راه دور بدون احراز هویت در Image Optimization API و توابع `use cache`؛ رفع در ≥16.4.1) و چند High (SSRF در Image Optimization، DoS در Server Actions) دارد؛ همچنین High در multer، body-parser، zod، mysql2/deepmerge-ts (وابستگی Prisma). lockfile با main یکسان است → **سایت زندهٔ فعلی هم همین نسخه‌ها را دارد** و ربطی به بازطراحی ندارد. پیشنهاد: یک شاخهٔ وصلهٔ امنیتی جدا از main برای ارتقای Next.js و وابستگی‌های آسیب‌پذیر، با تست کامل و انتشار فقط با تأیید صریح مالک. خروجی کامل: `.local-run/phase4b-final-2026-10-24/pnpm-audit-prod.json`.
- **فایل‌ها:** جدید `components/store/part-placeholder.tsx`؛ تغییر `account/page.tsx`، `parts/[slug]/page.tsx`، `staff/{login,invite}/page.tsx`، `globals.css`، `account/{account-shell,detail-pages}.tsx`، `builder/builder.css`، `catalog/part-card.tsx`، `commerce/{cart-view,checkout-view}.tsx`، `layout/{header-client,header-nav,mobile-nav}.tsx`، `lib/fixtures/handler.ts`. worktree موقت مبنا حذف و prune شد. شواهد: `.local-run/phase4b-final-2026-10-24/` (۵۹ تصویر، JSONها، اسکریپت‌ها، audit).
- **وضعیت:** Production، DNS، سرور، `.env` و دادهٔ اصلی دست نخوردند؛ هیچ PR ساخته/Merge نشد. پیش‌نمایش محلی تازه روی `http://localhost:3192/fa`.
- **قدم بعد:** بررسی نهایی مالک؛ تصمیم دربارهٔ وصلهٔ امنیتی Next.js (پیشنهاد: فوری و جدا)؛ سپس فاز ۵ (دستیار) یا آماده‌سازی Preview میزبانی‌شده/PR بازبینی، فقط با تأیید.


### فاز ۴ — بازطراحی تجربهٔ فروشگاه — 2026-10-22 ~14:15 Asia/Tehran

- **تصمیم مالک:** فاز ۶ تأیید شد؛ دستور فاز ۴ (بازطراحی کامل فروشگاه هم‌سو با Hero سینمایی) با همان محدودیت‌ها: فقط همین شاخه، بدون Merge/انتشار/تغییر Production و پایگاه دادهٔ اصلی، پایش سرعت موبایل، توقف پس از اتمام.
- **مبنا:** HEAD `6fb6fdb`، درخت تمیز، main بدون commit تازه. معماری، داده‌ها، منطق قیمت/موجودی/تأمین، مسیرها، API و پنل مدیریت دست نخوردند؛ فقط لایهٔ نمایش storefront.
- **Completed & Tested — سیستم طراحی:** پالت سینمایی به‌صورت توکن‌های سراسری Tailwind (stage, stage-2, navy, signal, electric, mist, paper, commerce) با جفت‌های کنتراست مستند؛ محدودهٔ `.store` (فقط فروشگاه، ادمین بدون تغییر): شعاع 10/16/22px، سایهٔ card/lift؛ اجزای مشترک `store-band` (بند فصل تیره با گذار به بوم)، `studio` (زمینهٔ عکس قطعه)، `store-card`، `store-chip`، `store-rise` (حرکت فقط بدون reduced-motion)، `store-eyebrow`. دکمهٔ `commerce` نارنجی فقط برای اقدام خرید (افزودن به سبد، ادامهٔ خرید، پرداخت، درخواست تأمین قطعه). اجزای جدید: `components/store/{chapter-band,purchase-steps,reveal-when-away}.tsx`. فونت‌ها تغییر نکردند (سرعت).
- **Completed & Tested — صفحات:** جست‌وجو/کاتالوگ/قطعات وارداتی/برند/خودرو (`CatalogPage` مشترک: بند فصل با عنوان، تعداد نتیجه، عبارت جست‌وجو و تراشه‌های مدل؛ فیلتر در کارت؛ کارت قطعهٔ جدید با studio، یک نشان وضعیت، قیمت و فلش)؛ خودروها و برندها (کاشی‌های ارتفاع‌دار با لوگو در studio)؛ جزئیات قطعه (بند باریک با مسیر، گالری studio، برچسب خرید با نارنجی، **نوار خرید چسبان موبایل** که فقط وقتی جعبهٔ خرید از دید خارج است ظاهر می‌شود)؛ سبد و تکمیل خرید (بند + مراحل ۱/۲/۳ خرید، کارت خلاصه، دکمهٔ نارنجی)؛ درخواست تأمین؛ هدر/فوتر/منوی موبایل/سوئیچرها روی stage، دکمهٔ جست‌وجوی هدر نارنجی مثل Hero؛ پنل دستیار با رنگ stage و signal (ماژول چت‌بات بازسازی نشد). صفحات About/Contact/Terms/Privacy/Pages/Payment با همان `PageHeader` موجود، فقط در `.store` به‌صورت بند تمام‌عرض دیده می‌شوند (حساب کاربری عمداً با سرصفحهٔ قبلی و توکن‌های جدید). «یک جعبهٔ جست‌وجو در هدر» (تصمیم قبلی و تست‌شده) حفظ شد. الهام: AUTODOC (مسیر خودرو/خرید)، PartSouq (شماره فنی/مشخصات)، Nike (تایپوگرافی و فضای بصری) — بدون کپی.
- **اصلاح‌های حین بازبینی:** هم‌ترازی eyebrow لاتین در RTL؛ نرم‌کردن لبهٔ بند؛ حذف تکرار نشان وضعیت در کارت (تست `unified-parts` آن را گرفت)؛ **CLS سبد/تکمیل خرید از قبل 0.10–0.16 بود** (بارگذاری سمت مرورگر) → با رزرو ارتفاع ناحیه به **0** رسید (سه نمونه، خالی و با کالا، موبایل throttled).
- **آزمون‌ها:** web typecheck (1144 کلید پیام fa/en) و ESLint بدون خطا. بازبینی مرورگر واقعی build تولیدی: ۳۴ ترکیب صفحه×نمای (دسکتاپ fa، موبایل fa 390، دسکتاپ en) — همه 200، یک H1، overflow افقی 0، dir درست، بدون خطای console؛ مسیر خرید واقعی (قطعه → افزودن → سبد) دسکتاپ و موبایل موفق. Hero (۶ زمینه) بدون تغییر رفتار. Playwright مخزن: **63/64** (تنها شکست همان مورد از پیش موجود `site content panel…`). E2E پنل مدیریت ظاهر: **13/13**. API/contracts/domain تغییری نداشتند (تست‌هایشان تکرار نشد).
- **سرعت (A/B هم‌زمان مرورگر واقعی با build فاز ۶ `6fb6fdb` در worktree موقت، cold، موبایل slow-4G+4×CPU، میانهٔ ۳):** LCP موبایل `/fa` 1.74→1.68s، `/fa/parts` 1.79→1.87s، قطعه 1.94→1.63s، خودروها 1.42→1.45s، سبد 1.70→1.98s — همه زیر 2.5s و در محدودهٔ نوسان؛ دسکتاپ 0.33–1.16s. CLS بدتر نشد (سبد بهتر شد). INP-proxy ≤176ms. حجم +≤25KB (CSS). worktree موقت پس از اندازه‌گیری حذف و prune شد.
- **شواهد:** `.local-run/phase4-store-2026-10-22/` (۳۷ تصویر صفحات، JSONهای بازبینی/E2E/A-B، اسکریپت‌ها).
- **Known / Deferred:** دادهٔ seed محلی عکس قطعه و قطعهٔ فقط‌تأمینی ندارد (حالت placeholder و مسیر موجود دیده شد؛ مسیر قابل تأمین با تست‌های fixture پوشش دارد). صفحات حساب کاربری فقط توکن‌های جدید را گرفته‌اند (بازطراحی کامل بخش حساب در صورت نیاز در مرحلهٔ بعد). بخش‌های legacy صفحهٔ اصلی زیر Hero تابع تم صفحه‌ساز (قابل تنظیم در پنل) ماندند. PageSpeed روی Preview واقعی هنوز لازم است.
- **وضعیت:** Production، DNS، سرور، `.env` و دادهٔ زنده دست نخوردند؛ هیچ PR ساخته/Merge نشد. پیش‌نمایش محلی تازه روی `http://localhost:3192/fa` اجرا شد. **Requires Owner Decision:** تأیید فاز ۴.


### فاز ۶ — سرعت و Core Web Vitals — 2026-10-22 ~13:05 Asia/Tehran

- **تصمیم مالک:** فاز ۳ تأیید شد؛ دستور فاز ۶ (اولویت سرعت/CWV) با همان محدودیت‌ها: فقط همین شاخه و محیط توسعه/Preview، بدون Merge و بدون تغییر Production؛ پس از فاز ۶ توقف برای تأیید پیش از فاز ۴.
- **مبنا:** HEAD `e396e84`، درخت تمیز، main بدون commit تازه. Production فقط با GET/Lighthouse خوانده شد (بدون هیچ تغییر).
- **تشخیص (اندازه‌گیری‌شده):** اعداد «۴٫۹s دسکتاپ / ۶٫۵s موبایل» در هیچ اندازه‌گیری ما بازتولید نشد (lab دسکتاپ قبلی ۰٫۴۹s؛ Lighthouse دسکتاپ ۰٫۹–۱٫۰s). علل واقعی: (۱) **تصویر کاراکتر دستیار PNG 1024×1536 با حجم 1,653KB** با اولویت High در همهٔ صفحات (در سایت زندهٔ فعلی هم) — ۵۳٪ حجم صفحه؛ (۲) شروع دانلود فیلم موبایل 891KB در ~0.6s و رقابت با پوستر/فونت؛ (۳) پوستر LCP دیر کشف می‌شد و پس از دانلود ~0.9s منتظر main thread می‌ماند (trace: load 3.13s، render 4.04s)؛ (۴) mount ویجت دستیار و فیلم در زمان hydration؛ (۵) فونت‌ها (۹ فایل، swap) و JS مشترک ~217KB (عمدتاً react-dom/Next) سراسری‌اند.
- **Completed & Tested — اصلاحات:** کاراکتر: WebP شفاف 160/320/480px (۹/۲۲/۳۸KB) با srcset و بارگذاری پس از load+idle، جعبهٔ ثابت 2:3 (PNG اصلی دست‌نخورده، دیگر ارجاع ندارد؛ مقایسهٔ بصری روی زمینهٔ تیره/روشن بدون تفاوت قابل‌مشاهده). ویجت دستیار (درخواست تنظیمات + کد) پس از load+idle و در `startTransition`. فیلم Hero: فقط پس از load+idle و در transition؛ اتصال 3G (effectiveType) → پوستر سبک + دکمهٔ «پخش فیلم» و دانلود فقط با لمس؛ Save-Data/2G/کاهش حرکت → تصویر ثابت (بدون دانلود فیلم). پیش‌بارگذاری پوستر LCP با `preload` → هدر HTTP `Link` با media جدا برای موبایل/دسکتاپ. پوسترهای WebP (88→43KB دسکتاپ، 48→25KB موبایل؛ اسکریپت ساخت به‌روز). آیکن تب `app/icon.png` 37.8KB→5.4KB (palette، بدون تفاوت دیداری). `lib/after-load.ts` مشترک. `inlineCss` آزمایشی Next عمداً فعال نشد (سراسری و experimental). فونت‌ها برای حفظ کیفیت طراحی تغییر نکردند.
- **نتایج قبل/بعد — مرورگر واقعی (Edge+CDP، build تولیدی محلی، موبایل slow-4G 1.6Mbps/150ms + 4×CPU، میانهٔ ۳ نمونه):** `/fa` موبایل cold: LCP **6.05s → 1.88s** (بازه 1.64–3.27)، FCP 5.73→1.88، CLS 0→0، INP-proxy 144→104ms، حجم 3,124KB→1,441KB (تصویر 1,733→79KB؛ فیلم پس از load). `/fa` دسکتاپ cold: LCP 0.49→0.44s، CLS 0.017→0.011، INP-proxy 64→56ms، حجم 3,709→2,014KB. `/fa/parts` موبایل: LCP 4.53→1.65s، حجم 2,170→506KB.
- **نتایج قبل/بعد — Lighthouse 12.8 (روش PageSpeed، A/B درهم‌تنیده با build قبل `e396e84` در worktree موقت روی پورت‌های جدا، شاخص CPU مشابه ~1700–1900):** `/fa` موبایل: امتیاز 67→78، LCP میانه 12.6s (ناپایدار 4.3–13.0) → 4.33s (پایدار 3.95–4.41)، TBT 238→212ms، CLS 0.018→0.018، حجم 3,084→1,401KB. `/fa` دسکتاپ: امتیاز 99→99، LCP 0.93→0.92s، TBT 0→0، CLS 0.013، حجم 3,722→2,020KB. `/fa/parts` موبایل: امتیاز 85→84، LCP 3.92→3.94s، حجم 2,166→503KB. سایت زندهٔ فعلی (بدون فیلم، فقط خواندن): موبایل LCP 2.88s (H1)، دسکتاپ 0.71s.
- **محدودیت اندازه‌گیری (مهم):** LCP شبیه‌سازی‌شدهٔ Lighthouse موبایل روی localhost حتی برای صفحهٔ بدون فیلم ~3.9–4.3s است چون بدون تأخیر شبکه، همهٔ JS پیش از اولین فریم مشاهده می‌شود و ×4 به LCP نسبت داده می‌شود؛ مرورگر با throttling واقعی 1.6–1.9s اندازه گرفت. بار پس‌زمینهٔ همین PC شاخص CPU را بین ~1000 و ~2100 جابه‌جا می‌کرد؛ مقایسهٔ اول Lighthouse (غیرهم‌زمان) به همین دلیل نامعتبر و کنار گذاشته شد و A/B هم‌زمان جایگزین شد. هدف 2.5s در Lighthouse موبایل localhost هنوز برآورده نشده؛ ارزیابی نهایی PageSpeed باید روی Preview میزبانی‌شده انجام شود. اینها lab هستند، نه داده میدانی (CrUX).
- **آزمون‌ها:** web typecheck و ESLint (0 error) exit 0. Playwright مخزن (fixtures): **63/64** — تنها شکست `site content panel: every section opens on a phone…` **از پیش موجود** است: از commit `5eba97e` مسیر `/admin/content/home` به ویرایشگر بصری می‌رود و backend آزمایشی endpoint صفحه‌ساز ندارد؛ مستقل از فاز ۶ (Deferred). آزمون‌های بصری دستیار با assertion به‌روز (WebP) موفق. بازبینی بصری Hero (دسکتاپ/تبلت/موبایل fa/en/کاهش حرکت): همه درست، overflow 0، یک H1، بدون خطای console. probe شبکه: slow-3G → «پخش فیلم» بدون دانلود تا لمس؛ fast-3G/4G → پخش خودکار پس از load. CLS: موبایل 0، دسکتاپ ~0.011 (font swap 0.005 + جابه‌جایی جای دستیار 0.006). E2E پنل مدیریت روی build نهایی: 12/13 در اجرای اول؛ تنها شکست race خود اسکریپت (`currentSrc` خالی بین دو فیلم) بود که اصلاح و سناریو جداگانه تأیید شد: ترتیب پخش دسکتاپ و موبایل درست، پایان با لوگو.
- **فایل‌ها:** `apps/web/src/lib/after-load.ts` (جدید)، `components/builder/{cinematic-film,cinematic-hero}.tsx`، `components/chat/{assistant-entry,hedax-assistant-widget}.tsx`، `app/globals.css`، `app/icon.png`، `public/assistant/hedax-mechanic-idle-v1-{160,320,480}.webp` (جدید)، `e2e/assistant.spec.ts`، `scripts/media/build-hero-v2.sh`، `scripts/home-review-local.mjs`. worktree موقت مبنا (`Desktop/source-perf-baseline`) پس از اندازه‌گیری حذف و prune شد. شواهد: `.local-run/phase6-perf-2026-10-22/` (JSONهای Lighthouse/CDP، اسکریپت‌ها، تصاویر).
- **Deferred / پیشنهاد بعدی:** اندازه‌گیری PageSpeed روی Preview واقعی؛ در صورت نیاز کاهش وزن/تعداد فونت‌ها (variable font یا حذف وزن‌های کم‌کاربرد — تغییر ظاهری کوچک، نیازمند تأیید)؛ اصلاح backend آزمایشی برای تست site content.
- **وضعیت:** Production، DNS، سرور، `.env` و دادهٔ زنده دست نخوردند؛ هیچ PR ساخته/Merge نشد. **Requires Owner Decision:** تأیید نتایج فاز ۶ و شروع فاز ۴ (بازطراحی کامل فروشگاه).


### فاز ۳ — مدیریت ظاهر سایت و ویدیوهای Hero — 2026-10-22 ~11:20 Asia/Tehran

- **تصمیم مالک:** فاز ۲ (طراحی صفحهٔ اول) **به‌صورت مشروط** تأیید شد؛ دستور فاز ۳ با محدودیت‌های قطعی: بدون Merge، بدون تغییر Production، بدون انتشار ویدیوی واترمارک‌دار روی سایت عمومی، انتشار عمومی فقط با تأیید صریح بعدی مالک.
- **مبنا:** HEAD `d1c3535` (پس از commitهای فاز ۲). ماژول موجود «مدیریت ظاهر سایت» (`/fa/admin/appearance`) گسترش یافت؛ CMS موازی ساخته نشد. پیش‌نویس/ذخیرهٔ خودکار/تعارض نسخه، پیش‌نمایش خصوصی، انتشار با مجوز `content.publish`، تاریخچه و بازگردانی، drag/keyboard، undo/redo، نمایش/پنهان/کپی/حذف بخش از قبل وجود داشتند و دوباره ساخته نشدند — فقط آزموده شدند.
- **Completed & Tested — ویدیو در کتابخانهٔ رسانه:** `packages/domain/src/video.ts` (`inspectVideo`، جدا از `inspectFile` تا مسیرهای دیگر آپلود ویدیو نپذیرند): ساختار واقعی MP4 (ftyp/moov/mvhd/tkhd/hdlr) و WebM (EBML/DocType/Info/Tracks) از بایت‌ها خوانده می‌شود؛ نبود track ویدیویی، مدت >۲ دقیقه، ابعاد >3840×2160، حجم >۵۰MB و فایل جعلی رد می‌شوند. API: `POST /admin/content/media/video` (multer 50MB زیر سقف 60MB Caddy؛ اسکن ClamAV با timeout 60s موجود؛ ذخیره با driver موجود local/Arvan S3 زیر کلید تصادفی `content/video/…` با MIME بازرسی‌شده). migration افزایشی `20261022100000_visual_media_video` (kind, mime, duration_ms, release_cleared, cleared_by, cleared_at؛ بدون تغییر/حذف دادهٔ موجود). حذف ایمن موجود (بایگانی، منع حذف فایل استفاده‌شده در صفحه/پیش‌نویس/تاریخچه) برای ویدیو هم برقرار است.
- **Completed & Tested — دروازهٔ واترمارک/حق انتشار:** `POST /admin/content/media/:id/clearance` فقط مالک یا `content.publish`، با audit (`content.media.cleared`/`clearance_revoked`). `BuilderService.publish` (و بازگردانی) هر فیلم/پوستر/تصویر جایگزین/لوگوی اختصاصی بلاک Hero را بررسی می‌کند: فقط فایل کتابخانه، بایگانی‌نشده و «تأیید انتشار»دار؛ وگرنه `409 MEDIA_NOT_CLEARED`. لغو تأیید فایلِ صفحهٔ زنده رد می‌شود. نتیجه: فیلم v2 واترمارک‌دار (در `/review-media`، خارج از کتابخانه) از پنل قابل انتشار عمومی نیست.
- **Completed & Tested — Hero چندفیلمی:** `film.clips` (حداکثر ۶؛ هر کدام دسکتاپ MP4، WebM اختیاری، موبایل مستقل، پوستر دسکتاپ/موبایل، فعال/غیرفعال) به ترتیب ذخیره‌شده پخش می‌شوند؛ تصویر جایگزین مستقل دسکتاپ/موبایل؛ پخش once/loop/static («فقط تصویر»)؛ لوگو: نمایش/زمان در آخرین فیلم/عرض ۱۰–۶۰٪/لوگوی اختصاصی. بلاک جدید بدون فیلم شروع می‌شود (پیش‌فرض امن). پنل «فیلم‌های بنر اصلی» با انتخاب از کتابخانه و برچسب وضعیت انتشار هر فایل.
- **Completed & Tested — کتابخانه:** آپلود تصویر/ویدیو با نوار پیشرفت و لغو، فیلتر همه/تصاویر/ویدیوها، پیش‌نمایش ویدیو، ابعاد/مدت/حجم واقعی، تأیید انتشار با تیک صریح «بدون واترمارک و دارای حق انتشار»، پیام خطای دقیق دلیل رد.
- **Completed & Tested — قالب‌های کنترل‌شدهٔ بخش:** «قالب آمادهٔ بخش» (۶ قالب) فقط با مقادیر معتبر schema موجود؛ بدون CSS آزاد؛ «بازگشت» قابل‌استفاده.
- **Completed & Tested — رفع متن روی ویدیو در موبایل:** متن Hero در موبایل کاملاً زیر تصویر قرار گرفت (همپوشانی منفی حذف شد)؛ دستیار عناصر `data-assistant-avoid` را هم دور می‌زند و روی متن Hero نمی‌آید (در صفحهٔ اول موبایل تا اسکرول کنار می‌رود و بعد ظاهر می‌شود؛ دسکتاپ نمایش دارد).
- **مسیر رسانهٔ بازبینی:** `public/media/source-hero` → `public/review-media/source-hero` (در Production مسیر `/media/*` به S3 می‌رود؛ تداخل حذف شد). gitignore، اسکریپت ساخت و EDL به‌روز شدند.
- **آزمون‌ها (همه exit 0):** domain vitest 14 فایل/132 (۴ تست جدید ویدیو با fixtureهای مصنوعی 64×64)؛ contracts 22/22؛ API unit 15/105؛ API integration واقعی PostgreSQL `81-site-content` + `82-visual-builder`: 2 فایل/13 تست (تست جدید: ویدیوی جعلی/صوتی/نقش بی‌مجوز رد، دروازهٔ انتشار، تأیید فقط مالک، منع لغو/بایگانی فایل زنده، منع انتشار فایل خارج کتابخانه)؛ API build و web typecheck exit 0 (105 audit action برچسب‌دار)؛ ESLint 0 error. **E2E پنل واقعی** (build تولیدی `next start`، stack ایزوله، مالک آزمایشی + TOTP محلی، Edge): **13/13** گام موفق، بدون خطای صفحه — رد انتشار فیلم واترمارک‌دار، رد ویدیوی جعلی، آپلود با پیشرفت، تأیید فقط فایل‌های مصنوعی بدون واترمارک، جایگزینی/افزودن/جابه‌جایی فیلم‌ها، تصاویر جایگزین، عرض لوگو، خصوصی‌ماندن پیش‌نویس (پیش‌نمایش مدیر بله، مهمان و API عمومی خیر)، انتشار و پخش ترتیبی در صفحهٔ عمومی، موبایل فقط یک فایل، پنهان‌کردن/قالب/جابه‌جایی بخش، رد بازگردانی به انتشار واترمارک‌دار و بازگردانی موفق انتشار قبلی، حالت فقط تصویر بدون دانلود فیلم، منع بایگانی/لغو تأیید فایل زنده. اجرای اول/دوم شکست‌های اسکریپتی داشت (context، انتظار URL ورود، کش ۳۰ ثانیه‌ای) که اصلاح شد؛ یک کمبود واقعی (نبود «قالب آماده» برای بخش‌های legacy صفحهٔ اصلی) در همان چرخه رفع شد.
- **اندازه‌گیری سرعت (lab، Edge+CDP، build تولیدی محلی، ۳ نمونه، میانه؛ field data نیست):** `/fa` با فیلم v2 — دسکتاپ cold: LCP 492ms، CLS 0.017، INP-proxy 64ms؛ warm: LCP 232ms. موبایل slow-4G+4×CPU cold: FCP 5.7s، **LCP 6.0s (بازه 2.5–8.2s) — هدف 2.5s برآورده نشده**؛ CLS 0؛ INP-proxy 144ms؛ warm LCP 0.92s. مبنای بدون فیلم `/fa/parts` همان پروفایل: LCP 4.5s (4.4–7.8s). در هر دو LCP≈FCP؛ گلوگاه اولین رنگ‌آمیزی سراسری سایت است (۸+ فایل فونت VeryHigh و ~۱۱۵KB JS مشترک)، نه پوستر Hero (۴۸KB، رسیده در ~1.8s). در یک اجرای جداگانه `/fa` FCP 2.1s/LCP 2.3s داشت؛ پراکندگی زیاد ناشی از بار ماشین است. شواهد: `.local-run/phase3-review-2026-10-22/` (اسکرین‌شات‌ها، `e2e-r3.json`، `cwv-*.json`، اسکریپت‌ها).
- **Known / Deferred:** بهینه‌سازی فونت/LCP موبایل سراسری → فاز ۶. انتشار صفحهٔ عمومی پس از انتشار تا ~۳۰ ثانیه کش می‌شود (رفتار موجود). دستیار در `/fa/parts` موبایل به‌علت شلوغی کنار می‌رود (رفتار موجود). پیش‌نمایش میزبانی‌شده (preview.sourcebyhedax.ir) هنوز Blocked External است؛ پیش‌نمایش آزموده فقط محلی است. اسکن ClamAV واقعی در stack محلی `none-dev` است (در Production اسکنر موجود اعمال می‌شود؛ ویدیوی ۵۰MB با timeout 60s واقعاً روی clamd آزموده نشده).
- **Git / پیش‌نمایش:** commit محلی `ccc3b09` روی `feature/source-premium-experience` (بدون push/PR). stack بازبینی تازه با build تولیدی روی `http://localhost:3192/fa` در حال اجرا گذاشته شد (فیلم v2 فقط در DB موقت محلی؛ ورود آزمایشی در فایل `owner-login.txt` پوشهٔ موقت `hedax-home-review-*`؛ بستن پردازش، پوشه را پاک می‌کند).
- **Requires Owner Decision:** (۱) بررسی فاز ۳؛ (۲) نسخهٔ بدون واترمارک فیلم برای هر انتشار عمومی؛ (۳) تأیید صریح پیش از Merge/Production. **Production، DNS، سرور، `.env` و دادهٔ زنده دست نخوردند؛ هیچ PR ساخته/Merge نشد.**
- **قدم بعد:** پس از نظر مالک: فاز ۴ (گسترش طراحی به فروشگاه) یا فاز ۶ (فونت/LCP موبایل)؛ برای انتشار عمومی، آپلود نسخهٔ بدون واترمارک در کتابخانه + تأیید انتشار + تأیید صریح مالک.


### فاز ۲ — صفحهٔ اصلی سینمایی با فیلم منتخب v2 — 2026-10-22 ~09:10 Asia/Tehran

- **تطبیق:** مسترپرامپت و CONTEXT_AND_STATUS بستهٔ `Desktop/SOURCE-VSCODE-HANDOFF-2026-10-22` خوانده شد. هش فیلم منتخب با manifest برابر است (`ff813139…59b2`). پوشهٔ اصلی روی `codex/assistant-live-copy` / `60d72e3` با تغییرات ثبت‌نشدهٔ PROGRESS، PNG و `hero-videos/` دست‌نخورده ماند. انتشار دستیار (PR29+PR30) روی main تمام است؛ کار موازی فعالی نبود. `origin/main` (`901c037`، فقط دو فایل متن locale) در `ba7ffcc` به این شاخه merge شد. HEAD قبل از commit این فاز: `ba7ffcc`.
- **Completed & Tested — رسانه (فاز ۱ v2):** نسخهٔ وب از همان منبع و همان EDL ساخته شد، بدون لوگوی سوخته (لوگو را سایت یک‌بار در 9.8s نشان می‌دهد). مستند: `docs/media/HERO_FILM_V2_EDL.md`؛ اسکریپت: `scripts/media/build-hero-v2.sh` (ffmpeg 7.1، exit 0، decode کامل هر سه فیلم exit 0، هر سه 288 فریم/12.00s). خروجی‌ها در `apps/web/public/media/source-hero/v2/` و **gitignore** (مخزن عمومی است و واترمارک Kling دارد). حجم: WebM دسکتاپ 1,459,230، MP4 دسکتاپ 2,603,378، MP4 موبایل 911,136 بایت. contact sheet با نسخهٔ review مقایسه شد: فریم‌ها یکسان، فقط لوگو متفاوت. واترمارک حفظ شده است. `HERO_FILM_EDL.md` (v1) برچسب Superseded گرفت.
- **Completed & Tested — بلاک صفحه‌ساز `cinematic-hero`:** نوع جدید در `packages/contracts/src/builder.ts` با `film` سخت‌گیر (strict؛ فقط MP4/WebM مسیر سایت یا https؛ `//host` رد می‌شود — این حفره را تست جدید پیدا کرد و بسته شد). پیش‌فرض فیلم در `constants.ts` (بدون zod). نمایش: `components/builder/cinematic-hero.tsx` (سرور: H1، متن، CTA، جست‌وجوی واقعی `/parts?q=`، سه مسیر خودرو/کاتالوگ/درخواست تأمین، دسته‌های واقعی) + `cinematic-film.tsx` (client: فقط یک فیلم متناسب دستگاه، WebM در صورت پشتیبانی، reduced-motion/Save-Data/2G/حالت static → تصویر ثابت بدون دانلود فیلم، توقف/پخش/پخش دوباره، توقف خارج از دید، رد autoplay → دکمهٔ پخش، خطای فایل → تصویر ثابت) + `cinematic.css`. پنل «فیلم افتتاحیه» در تنظیمات بلاک (فیلم‌ها، پوسترها با ImageField موجود، نحوهٔ پخش once/loop/static، زمان لوگو، بخش جست‌وجو). سایت عمومی تا وقتی سندی با این بلاک منتشر نشود تغییری نمی‌کند؛ پیش‌فرض API دست نخورد.
- **Completed & Tested — آزمون‌ها:** contracts vitest 22/22 (۱ تست جدید امنیت/پیش‌فرض فیلم)؛ API unit کامل 15 فایل/105 تست؛ API build exit 0؛ web typecheck exit 0؛ ESLint 0 error (۳ هشدار `<img>` مشابه کد موجود builder). integration DB تست builder اجرا نشد.
- **Completed & Tested — پیش‌نمایش واقعی ایزوله:** `apps/web/scripts/home-review-local.mjs` (الگوی همان launcher دستیار: PostgreSQL موقت، storage موقت، بدون `.env`، AI mock، بدون پرداخت/SMS/ایمیل؛ پورت‌های 3192/4192/55449). سند home از `BuilderService.state()` واقعی + بلاک فیلم ساخته، با schema اعتبارسنجی و فقط در DB موقت منتشر شد. Playwright/Edge واقعی روی `http://localhost:3192`: دسکتاپ 1440 fa/en، تبلت 820، موبایل 390 fa/en، reduced-motion — هر زمینه فقط یک فایل فیلم دریافت کرد، پخش تا پایان، لوگو یک‌بار، overflow افقی 0، یک H1، dir درست، بدون خطای console جز 401 قبلی `/me` برای مهمان؛ reduced-motion هیچ فیلمی دریافت نکرد. دکمهٔ توقف کار کرد؛ جست‌وجو به `/fa/parts?q=1240100901` رفت. ویرایشگر `/fa/admin/appearance` با ورود مالک آزمایشی + MFA محلی: بلاک اول لایه‌ها، پنل فیلم دیده شد، نشانی نامعتبر علامت خورد و پیش‌نویس ذخیره نشد. تصاویر: `.local-run/home-review-2026-10-22/` (13 فایل، خارج Git).
- **یافته/اصلاح در حین بازبینی:** فیلم دسکتاپ کوچک بود و فضای خالی داشت → بزرگ‌تر و زیر لبهٔ محو متن؛ ارتفاع صحنه هدر دوردیفه را حساب نمی‌کرد → اصلاح؛ کنترل فیلم موبایل روی خودرو بود → گوشهٔ بالا؛ شمارش «۰» دسته‌ها حذف شد؛ تیتر انگلیسی کوچک‌تر شد. یک هشدار hydration فقط در اجرای اول dev دیده شد و تکرار نشد.
- **Known issue (Phase 5):** در 390px کاراکتر دستیار موجود روی بخشی از متن hero می‌افتد؛ جای‌گذاری دستیار در فاز ۵ هماهنگ شود.
- **اندازه‌گیری نشده:** LCP/CLS/INP، Lighthouse و bundle impact هنوز اندازه‌گیری نشده‌اند (dev server معیار نیست).
- **Requires Owner Decision — دروازهٔ طراحی:** مالک باید جهت طراحی همین صفحه (دسکتاپ/موبایل) را تأیید یا اصلاح کند؛ پیش از تأیید، طراحی به بقیهٔ فروشگاه گسترش داده نمی‌شود. **Blocked External:** نسخهٔ بدون واترمارک برای انتشار عمومی؛ Preview میزبانی‌شده تأیید/ایزوله نشده است.
- **وضعیت Git:** commit محلی `9151824` روی `feature/source-premium-experience` (بدون upstream؛ push/PR انجام نشده). stack بازبینی محلی روی پورت 3192 در حال اجرا گذاشته شد (Ctrl+C در همان ترمینال یا بستن پردازش، پوشهٔ موقت را حذف می‌کند). Production، DNS، داده، سرور و `.env` دست نخوردند.
- **قدم بعد:** (۱) گرفتن نظر مالک روی تصاویر/پیش‌نمایش محلی؛ (۲) مستقل از آن، فاز ۳: آپلود ویدیو در کتابخانهٔ رسانه (اعتبارسنجی محتوایی MP4/WebM، حجم/مدت/ابعاد، اسکن، Caddy/ClamAV limits، جلوگیری از حذف فایل در استفاده) تا جایگزینی فیلم بدون مسیر دستی ممکن شود؛ (۳) اندازه‌گیری LCP/CLS روی build تولیدی محلی.


### بازطراحی سینمایی (Premium Experience) — 2026-10-21، Asia/Tehran

- **مبنا:** worktree جدا `Desktop/source-premium-experience`، شاخهٔ محلی
  `feature/source-premium-experience` از `origin/main` = `6b1c9dd` (merge PR #29)؛ upstream
  عمداً حذف شد تا push تصادفی به main ممکن نباشد. پوشهٔ اصلی و تغییرات جلسهٔ انتشار
  دست نخوردند. GitHub در این جلسه از این PC در دسترس نبود (fetch timeout)؛ push انجام نشده.
- **Completed & Tested — فاز ۰ ممیزی:** Next 16.3.7 / NestJS / Prisma؛ visual builder موجود
  (`/admin/appearance`، draft/publish/revision/restore، کتابخانهٔ رسانهٔ فقط تصویر JPG/PNG/WebP
  ≤5MB با اسکن)، Hero فعلی در `components/builder/legacy-home.tsx`، توکن‌ها در `globals.css`،
  دستیار مکانیک در `apps/web/public/assistant`. **کمبودها برای فاز ۳:** نوع block ویدیویی،
  آپلود/اعتبارسنجی/اسکن ویدیو (mime، حجم، مدت، Caddy/ClamAV StreamMaxLength 160M)،
  انتخاب desktop/mobile/poster. معماری برای فاز ۳ قابل گسترش است؛ بازسازی لازم نیست.
- **Completed & Tested — فاز ۱ رسانه:** ۷ ویدیو یکتا در `Desktop/hero-videos` (+۱ سوپرکار در
  Downloads، کنار گذاشته شد) با ffmpeg و contact sheet واقعاً دیده شدند؛ تکراری‌ها با MD5.
  فیلم ۱۶٫۷۵ ثانیه بدون مکانیک/بنیان‌گذار، برش پیش از هر متن AI، لوگوی رسمی در پایان.
  فهرست، EDL، اندازه‌ها و روش: `docs/media/HERO_FILM_EDL.md`. خروجی‌ها (خارج Git):
  `Desktop/hero-videos/source-hero-edit/`. فریم‌های master و پایان‌بندی با چشم بررسی شدند.
- **Blocked External — واترمارک:** همهٔ منابع «KlingAI 4.0» دارند؛ حذف/برش نشد. برای
  انتشار عمومی نسخهٔ بدون واترمارک همان generationها از حساب Kling لازم است.
- **Completed & Tested — نمونهٔ جهت طراحی:** `Desktop/hero-videos/source-hero-edit/prototype/index.html`
  (HTML مستقل، داده‌های نمونه برچسب‌دار). با Edge/Playwright در 1440×900 و 390×844: ویدیو
  واقعاً پخش شد (WebM دسکتاپ، MP4 موبایل)، `scrollWidth` برابر viewport، بدون خطای media.
  اصلاح‌ها پس از دیدن تصویر: scrim قوی‌تر زیر تیتر، جابه‌جایی دکمهٔ دستیار در موبایل.
  این نمونه هنوز در اپ Next پیاده نشده؛ Core Web Vitals اندازه‌گیری نشده‌اند.
- **محیط:** commit حافظهٔ ویندوز ~28.0/28.8GB بود و encode اول با malloc شکست خورد؛ با
  رندر مرحله‌ای و thread کمتر رفع شد. build وب (~2GB) در این وضعیت ریسک دارد. پردازش‌های
  قدیمی node/postgres جلسات دیگر بسته نشدند.
- **Requires Owner Decision / قدم بعد:** (۱) تأیید یا اصلاح جهت طراحی و فیلم؛ (۲) نسخهٔ
  بدون واترمارک؛ (۳) پس از تأیید: فاز ۲ = block `cinematic-hero` در builder با ویدیو/پوستر
  desktop/mobile و fallback به Hero فعلی، سپس فاز ۳ آپلود ویدیو در کتابخانهٔ رسانه.
  هیچ Production، DNS، داده یا preview تغییر نکرده است.

### ادامهٔ مستقیم اتصال آروان — 2026-10-21، 09:45 Asia/Tehran

- **Completed & Tested — تطبیق:** شاخه `codex/assistant-phase-one`، HEAD/base بررسی‌شده
  `ae89b0c` / `b16770c`؛ PR #29 باز/Draft/MERGEABLE و CI همان HEAD موفق است.
  تغییر محلی قبلی PROGRESS حفظ شد. کد سرور روی `0c6e94c` و سرویس‌های موجود سالم‌اند؛
  فایل محیط mode 600 و helper ورود مخفی موجود mode 700 است؛ هیچ secret چاپ نشد.
- **Requires Owner Decision، رفع‌شده:** مالک در همین گفتگو صریحاً سقف آزمون
  50,000 ریال و سقف عمومی روزانه 300,000 ریال و 100 درخواست را تأیید کرد.
  این مجوز، شارژ حساب یا خرید اعتبار نیست. صوت همچنان Deferred Later است.
- **Blocked External — ورود:** تب IAB آروان اطلاعات cache قدیمی نشان می‌داد؛
  پس از reload به صفحهٔ login رفت. ورود مجدد توسط مالک درخواست شده است. درگاه
  `gateway-4cjht` در checkpoint قبلی ثبت شده؛ قبل از ساخت هر مورد، inventory زنده
  همان حساب باید بررسی شود. درگاه/کلید تکراری ساخته نشد و تماس پولی انجام نشد.
- **Completed & Tested — اصلاح لازم پیش از فعال‌سازی:** برآورد bytes/3 می‌توانست
  متن فارسی را کمتر از واقع رزرو کند؛ به envelope بایتی با حاشیهٔ framing تبدیل شد.
  settlement نیز هزینهٔ گزارش‌شدهٔ بیشتر از رزرو را در ledger منظور می‌کند تا سقف
  درخواست‌های بعدی نادیده گرفته نشود. دو regression اضافه شدند؛ اجرای هدفمند
  `pnpm --filter @hedax/api exec vitest run test/unit/assistant-budget.service.test.ts
  test/unit/assistant.service.test.ts`: دو فایل/هفت تست، exit 0. API typecheck، ESLint
  دو فایل و diff whitespace موفق‌اند. این نتیجه، آزمون واقعی provider یا Redis نیست.
- **Implemented Pending Verification:** اصلاح budget محلی در service/test و این
  checkpoint است؛ هنوز commit/push/CI تازه ندارد. پس از ورود، درگاه و least-privilege
  key review شوند؛ ساخت نهایی credential نیازمند تأیید همان عمل است. سپس secret فقط
  از مسیر مخفی server-side تنظیم، آزمون واقعی ایزوله و انتشار مجاز ادامه یابد.
  Production، `.env`، DNS و داده‌های زنده در این ادامه تغییر نکرده‌اند.

### بازبینی واقعی شش قابلیت و اجرای محلی — 2026-10-20، Asia/Tehran

- **Completed & Tested — ۱. ظاهر:** asset نهایی فعلی alpha واقعی دارد و در مشاهدهٔ
  screenshot هیچ کارت/مربع/دایره/پس‌زمینه دور خود کاراکتر نبود. بازبینی اول نشان
  داد ابعاد تمام‌قد با اندازهٔ SVG قدیمی کوچک است؛ اندازه 1.8 برابر و collision
  geometry اصلاح و متن زیر pet حذف شد. visual 390 بعد از اصلاح موفق شد. شباهت و
  لباس از دو مرجع تولید شده‌اند، اما پذیرش هنری نهایی هنوز تصمیم مالک است.
- **Completed & Tested — ۲. تعامل / ناقص از نظر 3D:** mouse/pointer drag واقعی،
  آستانه click/drag، clamp، ذخیره/reset موقعیت، keyboard، hide/minimize و حرکت idle
  در browser test آزموده شدند. فایل ویدئو
  `.local-run/assistant-ai-review/assistant-drag-dialog-390.webm` و تصاویر full/open
  کنار آن ساخته شدند. این PNG متحرک‌شده با CSS است؛ مدل rigged سه‌بعدی نیست، حالت‌های
  مستقل تصویری/اسکلتی کامل ندارد و آزمون touch روی دستگاه فیزیکی انجام نشده است.
- **Incomplete/Blocked — ۳. AI آزاد:** endpoint/provider واقعی وجود ندارد؛ پاسخ
  همچنان adapter قطعی مرحلهٔ اول است. provider، مدل مجاز، secret server-side، منطقهٔ
  داده، retention و سقف هزینه لازم‌اند. پاسخ هوشمند واقعی آزموده یا فعال نشده است.
- **Incomplete/Blocked — ۴. ابزار کاتالوگ:** سرویس موجود کاتالوگ در همین stack
  قیمت/موجودی مصنوعی را نمایش می‌دهد، ولی دستیار آن را فراخوانی نمی‌کند. بنابراین
  نمایش کاتالوگ شاهد ابزار AI نیست و این مورد تکمیل‌شده محسوب نمی‌شود.
- **Incomplete/Blocked — ۵. صوت:** کنترل میکروفن/STT/TTS/stream وجود ندارد؛ دریافت
  فارسی، transcript، صدای خروجی و stop عملاً آزموده نشده‌اند. فایل صوت یا نمایش
  ساختگی ارائه نشد. provider صوت و آزمون مرورگر/میکروفن واقعی لازم است.
- **Completed & Tested — ۶. مدیریت:** ذخیرهٔ صریح SiteSetting با RBAC/CSRF/MFA،
  version conflict، audit و default-off در integration واقعی DB موقت قبلاً موفق
  بوده؛ فرم browser نیز save/reset را آزموده است. در stack فعلی مسیر مدیریت باز است
  و تا ورود مالک آزمایشی پیام ورود نشان می‌دهد؛ پذیرش دستی این اجرای تازه به عهدهٔ
  مالک است.
- **Completed & Tested — اجرای فعلی:** launcher واقعی با PostgreSQL/storage تازه،
  queue inline، بدون اتصال Redis و بدون `.env`/Production روی 3191/4191/55439 در
  حال اجراست. تب‌های login، `/fa/admin/assistant` و `/fa` در مرورگر باز و deliverable
  هستند. حساب فقط `owner@hedax.test` است؛ رمز در این فایل ثبت نشده. پس از ورود/MFA،
  فعال‌سازی و save، تب خانه refresh شود. stack در پایان این جلسه عمداً باز می‌ماند.
- **شواهد:** ضبط اول به‌دلیل قفل Next روی dev server دوم اجرا نشد؛ retry روی سرور
  موجود به نبود FFmpeg رسید. مؤلفه رسمی Playwright FFmpeg با مجوز نصب و retry نهایی
  visual 390 با video موفق شد: 1 passed، exit 0. هیچ صوتی در ویدئو نیست.

### ارتقای دستیار هوشمند/صوتی — milestone A در حال اجرا، 2026-10-20

- **Implemented Pending Verification:** درخواست مالک برای مراحل A تا F خوانده شد؛
  تصاویر مرجع واقعاً بررسی شدند و راهنمای Server/Client نسخهٔ نصب‌شدهٔ Next 16.3.7
  خوانده شد. همان شاخه و تغییرات مرحلهٔ اول حفظ شده‌اند؛ commit/push/merge/deploy
  یا تماس با Production انجام نشده است.
- **Implemented Pending Verification:** با ImageGen داخلی و هر دو مرجع، یک رندر
  idle تمام‌قد با لباس مکانیک سرمه‌ای ساخته و در
  `apps/web/public/assistant/hedax-mechanic-idle-v1.png` قرار گرفت. فایل
  1024×1536 و دارای alpha واقعی است (pixel گوشه alpha=0). عکس شخصی و پوستر مرجع
  داخل public/Git کپی نشده‌اند. prompt تولید: رندر مکانیک سه‌بعدی‌نما، حفظ هویت
  مرجع چهره و لباس showcase، patch خالی برند، cutout شفاف، بدون متن/قاب/دایره/
  حلقه/پس‌زمینه/UI. این فایل فقط رندر دوبعدی است و GLB/glTF rigged نیست.
- **Completed & Tested:** launcher کارت‌دار حذف و کاراکتر شفاف جایگزین شد؛ drag
  با pointer برای mouse/touch، آستانهٔ تفکیک click/drag، clamp به visual viewport،
  ذخیرهٔ فقط مختصات غیرحساس، reset قابل‌دسترسی، minimize، hide تا navigation و
  pause/reduced-motion پیاده شد. کنترل‌ها سطح کوچک مستقل دارند و خود کاراکتر هیچ
  کارت، مربع، دایره یا حلقه ندارد.
- **Completed & Tested:** web typecheck و ESLint هدفمند موفق شدند. نخستین browser
  run دو تست را به علت `next/image localPatterns` شکست داد؛ assertion حذف یا ضعیف
  نشد. asset ثابت با `unoptimized` اصلاح شد و اجرای مجدد سناریوی اصلی و visual 390
  شامل نبود قاب، drag واقعی، عدم بازشدن dialog هنگام drag، ذخیره/reset موقعیت،
  reduced motion، keyboard و dialog موفق شد: 2 passed، exit 0.
- **Completed & Tested:** visual 768 نیز در اجرای بعدی موفق شد. visual 1440 ابتدا
  نشان داد action bar عرض compact را نگه می‌دارد؛ action bar به overlay مستقل تبدیل
  شد. retry بعدی صرفاً به‌علت پوشاندن launcher توسط Next dev overlay هنگام pointer
  click timeout شد؛ مسیر keyboard واقعی (`focus` + Enter) بدون force-click استفاده
  شد و همان تست کامل 1440 موفق شد: 1 passed، exit 0. تغییر تولیدی `next-env.d.ts`
  پس از dev server به محتوای tracked بازگردانده شد.
- **Blocked External:** ابزار تصویر می‌تواند رندر شفاف بسازد اما مدل سه‌بعدی
  rigged و انیمیشن GLB/glTF تولید نمی‌کند. asset/ابزار 3D حرفه‌ای برای نیاز اصلی
  کاراکتر و تأیید ظاهر همین رندر توسط مالک لازم است. رندر فعلی سه‌بعدی واقعی نامیده
  نشود. برای provider متن/صوت واقعی نیز حساب، مدل مجاز، منطقهٔ داده، سیاست retention
  و سقف هزینه لازم است؛ کلید باید فقط در secret manager/environment تنظیم شود و در
  چت ارسال نشود. آزمون صوت واقعی هنوز انجام نشده است.
- **Deferred Later:** مراحل B تا F (adapter واقعی AI و ابزارهای فروشگاه، RAG مجاز،
  صوت واقعی، مدیریت نسخه‌دار/حافظه/handoff، آزمون کامل و بستهٔ انتشار) هنوز پیاده یا
  تأیید نشده‌اند. پاسخ‌های فعلی همچنان deterministic مرحلهٔ اول‌اند و نباید قابلیت
  AI/voice فعال تلقی شوند.
- **قدم بعدی دقیق:** پس از پذیرش/اصلاح ظاهر idle، حالت‌های تصویری هماهنگ یا asset
  rigged تأمین شود؛ مستقل از آن، مرحلهٔ B با provider adapter ساختگی، endpoint سمت
  سرور، quota و ابزار خواندنی کاتالوگ موجود پیاده و روی DB/Redis/storage ایزوله
  آزموده شود. سپس مراحل C تا F بدون ادعای اتصال واقعی تا فراهم‌شدن credential ادامه یابند.

### اجرای محلی برای بازبینی مالک — 2026-10-20 16:23، Asia/Tehran

- **Completed & Tested:** وضعیت واقعی Git و همین checkpoint بررسی شد؛ شاخه
  `codex/assistant-phase-one` روی `b16770c` است و تغییرات پیاده‌سازی مرحلهٔ اول
  همچنان فقط محلی و بدون commit/push/merge/deploy هستند.
- **Completed & Tested:** جدایی launcher پیش از اجرا دوباره تأیید شد: فایل‌های
  `.env` خوانده نمی‌شوند؛ PostgreSQL تازه در پوشهٔ موقت روی loopback و storage
  داخل همان پوشه ساخته می‌شوند؛ `QUEUE_DRIVER=inline` است و اتصال Redis ندارد؛
  پرداخت/ایمیل خاموش و API/Web فقط روی `127.0.0.1` هستند. هیچ داده یا سرویس
  Production استفاده یا تغییر نکرد.
- **Completed & Tested:** buildهای معتبر قبلی دوباره اجرا نشدند. launcher واقعی
  `node apps/web/scripts/assistant-local.mjs` با موفقیت در حال اجراست؛ صفحهٔ اصلی
  `http://localhost:3191/fa` و صفحهٔ مدیریت
  `http://localhost:3191/fa/admin/assistant` در مرورگر باز و برای تحویل به مالک
  نگه داشته شدند؛ هر دو endpoint پاسخ HTTP 200 دارند. صفحهٔ مدیریت تا ورود، لینک
  ورود کارکنان را نشان می‌دهد. تغییر خودکار dev server در `next-env.d.ts` نیز به
  محتوای tracked قبلی بازگردانده شد و تغییر پروژه‌ای محسوب نمی‌شود.
- **خطای رفع‌شده:** تلاش اول فقط به‌علت رد شدن رمز آزمایشی با سیاست
  `COMMON_WORD` پیش از ساخت حساب متوقف شد؛ launcher دادهٔ موقت همان تلاش را پاک
  کرد. اجرای دوم با رمز تصادفی محلی پذیرفته شد و حساب موقت
  `owner@hedax.test` ساخته شد. هیچ رمز در این فایل ثبت نشده است.
- **Requires Owner Decision / قدم بعدی:** مالک با حساب آزمایشی وارد شود، MFA
  موقت را برای همین stack ثبت کند، در `/fa/admin/assistant` دستیار را فعال و
  صریحاً ذخیره کند، سپس تب `/fa` را refresh کند تا مکانیک و پنجرهٔ گفتگو را
  ببیند. توقف launcher با Ctrl+C داده‌های موقت را حذف می‌کند. قابلیت تازه، AI/RAG،
  commit، push یا انتشار انجام نشود.

### دستیار مرحلهٔ اول — 2026-10-20، Asia/Tehran

- **Implemented Pending Verification:** درخواست جدید مالک، مجوز ویرایش و آزمون
  محلی ایزوله است؛ commit/push/merge/deploy ممنوع. مبنا `main` در `b16770c`،
  working tree هنگام شروع تمیز و شاخهٔ فعلی `codex/assistant-phase-one` است.
- root/web AGENTS و راهنمای Server/Client نسخهٔ نصب‌شده Next 16.3.7 خوانده شد.
  PR #20 هنوز OPEN و merge نشده است؛ SVG مکانیک از ref محلی همان PR بازیابی و
  به‌عنوان تصویر دوبعدی توسعه داده شد، نه مدل سه‌بعدی. هیچ شاخهٔ قدیمی جایگزین نشد.
- قرارداد تنظیمات bounded دوزبانه با پیش‌فرض خاموش، adapter قطعی با لینک‌های واقعی
  `/parts?q=` (سقف ۱۲۰ کاراکتر)، `/request-part` و `/contact` اضافه شدند.
- SettingsService/SiteSetting با کلید مستقل `assistant.phase1`، permission موجود
  `settings.manage`، قفل تراکنشی concurrent create/update، audit و مسیر تنظیمات
  زیر `admin/settings` برای invalidation موجود استفاده شدند؛ migration تازه نیست.
- UI مدیریت `/fa/admin/assistant` و `/en/admin/assistant` شامل چهار بخش کاربردی،
  ذخیرهٔ صریح و reset صرفاً فرم است. ویجت lazy، پنجره Radix، کنترل motion/compact،
  reduced-motion/visibility و مسیرهای allowlist دارد. پیام فقط حافظهٔ component است.
- **آزمون جاری:** build contracts/API موفق؛ نخستین web typecheck نبود label تازهٔ
  audit را یافت و در حال اصلاح است. هنوز backend/browser/build نهایی تأیید نشده.
  harness integration دیتابیس PostgreSQL موقت تازه و storage داخل همان پوشه دارد؛
  Redis URL آزمایشی مجزا و worker production اجرا نمی‌شود. فایل محیط واقعی خوانده نشد.
- **قدم بعدی:** اصلاح label، آزمون قرارداد/API ایزوله، مرورگر ۳۹۰/۷۶۸/۱۴۴۰ و بررسی
  واقعی تصاویر، سپس lint/typecheck/build مرتبط. نتایج و شکست‌ها همین‌جا ثبت شوند.
- فایل‌های جاری: `packages/contracts/src/assistant.ts` و export/test آن، سرویس/
  controller تنظیمات API و test 96، entry/widget/admin assistant وب، route مدیریت،
  site layout، shell، CSS، messages، fixture عمومی پیش‌فرض خاموش و SVG مکانیک.
- **Completed & Tested:** ۹ تست قرارداد، ۴ API integration روی DB واقعی موقت
  (RBAC مشتری/پشتیبانی/مهمان، persistence، concurrent create 200/409، audit و
  projection عمومی)، و regression موجود گفت‌وگوی انسانی با نام acknowledged
  message موفق شدند؛ ۷ تست نامرتبط همان فایل عمداً انتخاب نشدند.
- **Completed & Tested:** اجرای اصلاح‌شدهٔ شش browser test کامل موفق شد، با عکس
  ۳۹۰/۷۶۸/۱۴۴۰. عکس‌های موبایل open، تبلت open و دسکتاپ launcher واقعاً دیده شدند؛
  نزدیکی لبهٔ launcher به CTA سبب افزودن shrink/yield تطبیقی شد. کدهای لاتین در
  متن فارسی اکنون bdi مستقل دارند؛ این تغییر UI و تست visibility/collision تازه
  هنوز در انتظار اجرای هدفمند نهایی‌اند.
- **تاریخچهٔ شکست، رفع‌شده:** نخستین اجرای test به spawn EPERM sandbox خورد؛
  همان مسیر با مجوز اجرا شد. lint مرز zod-free را نشان داد؛ constants/adapter
  از schema جدا شدند. اجرای هم‌زمان مرورگر هنگام rebuild موقتاً export قدیمی دید
  و یک fixture نقش owner نامعتبر داشت؛ rebuild و نقش staff علت‌ها را رفع کردند.
  هیچ assertion برای سبزشدن ضعیف نشده است. ترجمهٔ فارسیِ تولیدشده با encoding
  نامناسب پیش از پذیرش اصلاح و تغییرات newline نامرتبط پاک شدند.
- **Implemented Pending Verification:** launcher اختصاصی
  `apps/web/scripts/assistant-local.mjs` برای بررسی مالک با DB/storage تازه،
  inline queue، environment allowlist بدون .env و bind loopback اضافه شد؛
  smoke آن در حال اجراست. تلاش اول فقط approval deadline خورد و اجرا نشد؛ retry
  همان درخواست پذیرفته شد. راهنما در `docs/HEDAX_ASSISTANT_PHASE1.md` است.
- هیچ commit/push/merge/deploy یا تماس با سرور/DNS/دادهٔ Production انجام نشده.
- **Completed & Tested — نتیجهٔ نهایی مرحله:** قرارداد/پایداری تنظیمات و پوستهٔ
  راهنمای دوزبانه پیاده و محلی آزموده شدند. دستیار همچنان به‌صورت پیش‌فرض خاموش
  است؛ API مدل، RAG، حافظه، VIN، قیمت‌گذاری یا اقدام تجاری خودکار اضافه نشده‌اند.
- **Completed & Tested — آزمون نهایی:**
  - `pnpm --filter @hedax/contracts exec vitest run test/assistant.test.ts`:
    ۹ تست موفق؛ اجرای نهایی پس از تفکیک public/schema نیز exit 0.
  - `pnpm --filter @hedax/api exec vitest run --config vitest.integration.config.ts
    test/integration/96-assistant-settings.test.ts`: چهار تست، exit 0 و cleanup موفق.
  - همان integration config، فایل `30-chat-files-access.test.ts` و
    `-t 'acknowledged message'`: یک regression واقعی REST/WebSocket موفق، exit 0.
  - browser: شش سناریوی اولیه موفق؛ با افزودن visibility هفت سناریو شد. اصلاح
    جلوگیری از پوشاندن کنترل‌ها ابتدا launcher را در viewport کوتاه پنهان کرد؛
    این شکست حفظ و با جابه‌جایی محدود به لبهٔ مقابل/ارتفاع امن رفع شد. چهار تست
    متاثر نهایی (`-g 'disabled by default|visual'`) همگی موفق، exit 0 در 35.3s؛
    سه سناریوی دیگرِ مسیرهای مستثنا/ذخیرهٔ صریح/visibility قبلاً موفق بودند و
    بی‌دلیل دوباره اجرا نشدند. assertion عدم تقاطع، حرکت عمودی یا افقیِ بدون
    پوشاندن کنترل را می‌سنجد؛ تست یا معیار پذیرفتن هم‌پوشانی حذف نشده است.
  - `pnpm lint`، typecheck API/web/contracts، build API/contracts و build نهایی
    وب موفق‌اند. `pnpm --filter @hedax/web build` در 169 صفحه و TypeScript
    exit 0 داشت؛ فقط endpoint محلیِ بی‌داده برای build تنظیم شد. شکست اول build
    دسترسی sandbox به SWC native cache بود؛ همان فرمان با مجوز موفق شد، package
    تازه یا ارتقای وابستگی انجام نشد. lint/typecheck هدفمند پس از آخرین اصلاح
    launcher نیز موفق‌اند؛ `git diff --check` سالم است.
- **Completed & Tested — راه اجرای ایزوله:**
  `node apps/web/scripts/assistant-local.mjs --smoke` با DB/storage تازه و API/web
  loopback واقعاً اجرا شد، public default=false و صفحهٔ مدیریت HTTP/200 بودند؛
  سپس stack/داده‌های موقتِ خودش پاک شدند. این smoke معادل ورود/ذخیرهٔ UI نیست؛
  ذخیره در API integration و رفتار فرم در browser fixture جدا آزموده شده است.
- **Completed & Tested — تصاویر:** هر شش تصویر نهایی launcher/open در عرض‌های
  ۳۹۰، ۷۶۸ و ۱۴۴۰ دیده و بررسی شدند؛ برش متن، خروج پنجره از viewport یا پوشاندن
  CTA اصلی دیده نشد. تصویر موبایل و تبلت RTL خوانا و کنتراست پنجره مناسب است.
  نسخهٔ قابل‌مراجعهٔ تصاویر در `.local-run/assistant-phase1/assistant-*.png`
  (ignored؛ فقط دادهٔ synthetic) نگهداری می‌شود.
- **Deferred Later / محدودیت پذیرش:** کیبورد و safe-area دستگاه فیزیکی iPhone/
  Android بررسی نشده‌اند؛ مرورگر desktop با visual viewport کوتاه و reduced
  motion بررسی شد. browser fixture اثبات backend واقعی محسوب نمی‌شود. فعال‌سازی
  روی سایت اصلی و اتصال مدل AI در این مرحله انجام نمی‌شود.
- **قدم بعدی دقیق:** مالک با دستورهای راهنمای `docs/HEDAX_ASSISTANT_PHASE1.md`
  launcher محلی را اجرا کند، در `http://localhost:3191/fa/staff/login` با مالک
  کاملاً آزمایشی وارد شود و `/fa/admin/assistant` را بررسی کند. تغییرات کد فقط
  local/uncommitted روی `codex/assistant-phase-one` با HEAD `b16770c` باقی‌اند؛
  commit/push/merge/deploy تنها با درخواست تازهٔ مالک. baseline یا آزمون‌های سبز
  تکرار نشوند مگر تغییر یا شکست تازه. `next-env.d.ts` پس از build برابر HEAD است.

### انتشار Production — 2026-10-20، 09:25 Asia/Tehran

- **Completed & Tested — تصمیم و Git:** مالک پس از دریافت طرح/ریسک‌ها، صریحاً
  Merge، انتشار و commit/push را تأیید کرد. PR #28 با guard روی SHA
  `883df80db8febd1eadf308967c3b079adbf9a3ab` ادغام شد. merge commit برابر
  `0c6e94cc30a92065b563402f7b3415c876b8ab0b` و tree آن دقیقاً برابر candidate است.
  CI feature، run `39373413011`، و CI main پس از merge، run `39376889261`، SUCCESS شدند.
- **Completed & Tested — انتشار واقعی:** در 05:49 UTC ورودی API/web متوقف،
  Importهای فعال عادی/برند و outbox تخلیه، سپس worker قدیمی متوقف شد. API، worker
  و web هماهنگ با سه image آمادهٔ revision `883df80` جایگزین شدند. هیچ migration،
  تغییر DNS/storage policy، restore زنده یا ورود فایل تأمین‌کننده انجام نشد.
- **Completed & Tested — سلامت پس از انتشار:** readiness شامل database/Redis/
  storage/scanner سالم و امضاهای scanner تازه؛ صفحات www، فارسی، انگلیسی، قطعات
  و ورود کارکنان HTTPS/200 هستند. www به apex فارسی هدایت می‌شود. API/web healthy،
  worker running و restart count هر سه صفر است. دسترسی بدون ورود به فهرست و فایل
  نمونهٔ Import با 401 رد شد. مالک شخصاً وارد مدیریت شد و dashboard واقعی باز شد. مشاهدهٔ 05:55 UTC دوباره سلامت هفت سرویس، صفر restart، صفر job ناتمام و صفر خط error سطح برنامه را تأیید کرد؛ یک فایل عمومی S3 از مسیر سایت 200 و دانلود یک attachment خصوصی واقعی بدون ورود 401 بود.
- **Completed & Tested — ماندگاری و بازگشت:** checkout سرور روی branch
  `deploy/pr28-20261020` و merge commit بالا قرار گرفت؛ resolved Compose پیش/پس
  دقیقاً برابر بود. imageهای قبلی با tag مستقل محفوظ‌اند؛ tagهای عادی سه سرویس
  به candidate اشاره می‌کنند. wrapper ثابت `/opt/hedax-compose-current` همان طرح
  انتشار را اجرا می‌کند. restart policy موجود حفظ شد؛ سرویس‌های داده دست‌نخورده‌اند.
- **Completed & Tested — بازیابی:** بکاپ کامل
  `pr28-complete-20261020T050208Z`، رمزگشایی واقعی روی رایانهٔ مالک، restore ایزولهٔ
  ۹۹ جدول/۱۸ migration و تطبیق ۶۷ آبجکت موفق بودند؛ نسخهٔ رمزگذاری‌شدهٔ خارج از
  سرور نیز با hash برابر تأیید شد. جزئیات و شکست رفع‌شدهٔ harness در تاریخچه پایین‌اند.
- **Blocked External — پذیرش Import زنده:** در baseline هیچ manufacturer ثبت
  نشده بود (count=0). برند مشخصاً آزمایشی «آزمون انتشار PR28» از UI و با audit
  ساخته شد. هنگام انتخاب CSV مصنوعی دو ردیفی، مرورگر مجوز upload را با علت
  «user declined permission» رد کرد. فایل upload نشده، job ساخته نشده و Import/
  Undo هنوز آزموده نشده‌اند. مسیر جایگزین برای دورزدن منع upload استفاده نشد.
  مالک می‌تواند فایل مصنوعی آماده را شخصاً در فرم انتخاب/بارگذاری کند؛ سپس فقط
  همان job با publish=false پیش‌نمایش/اجرا/Undo و نتیجه ثبت شود. برند آزمون پس از
  پایان آزمون غیرفعال شود؛ سابقه/audit حفظ شود. دانلود مجاز فایل خصوصی واقعی
  هنوز جداگانه تأیید نشده و با موفقیت restore یا ورود مالک اشتباه گرفته نشود.
- **Deferred Later — عملیات دوره‌ای و سرویس‌ها:** بکاپ روزانهٔ موجود هنوز S3
  را پوشش نمی‌دهد و کلید قبلی آن پیدا نشده است؛ بکاپ کامل فعلی این شکاف دوره‌ای
  را حل نمی‌کند. payment/SMS provider هنوز none است؛ checkout/OTP واقعی آماده
  اعلام نمی‌شود. Preview عمومی مستقر نشده؛ این ریسک در تأیید مالک ارائه شد.
- **قدم بعدی:** تکمیل پذیرش مصنوعی از همان فرم پس از upload توسط مالک، سپس ثبت
  نتیجهٔ پذیرش در Git. کد مستقر همان 883df80 است؛ ثبت این checkpoint صرفاً مستنداتی است. baseline/XLS/TEST-02 یا ساخت imageها تکرار نشوند.
  rollback کد دادهٔ جدید را معکوس نمی‌کند؛ worker قدیمی تنها پس از reconciliation
  jobهای جدید مجاز است. restore مخرب نیازمند تصمیم جداگانه دربارهٔ داده‌های تازه است.

### تاریخچهٔ آمادگی انتشار مستقیم — 2026-10-20 (با انتشار بالا جایگزین شد)

- **Completed & Tested — Git/دامنهٔ کار:** کد PR #28 روی
  `3343dcbaaa1d520c817809317ac6a4ceed8f1d56` و مبنا `d205e37` است؛ PR باز، Draft
  و ادغام‌نشده است. CI همین SHA، run `39258053730`، موفق بود. فقط PROGRESS و
  گزارش readiness در آماده‌سازی حاضر تغییر کرده‌اند. baseline، تست‌های XLS/UI،
  TEST-02 و نمونهٔ تأمین‌کننده دوباره اجرا نشدند.
- **Requires Owner Decision — انتخاب مالک:** انتشار مستقیم Production ترجیح
  مالک است؛ ایجاد Preview قدم جاری نیست. مجوز بررسی/آماده‌سازی و ورود به آروان
  داده شده است؛ Merge و تغییر سرویس‌های زنده همچنان نیازمند توضیح تغییر/خطر و
  تأیید صریح نهایی هستند. برنامه‌های Preview پایین این بخش تاریخچه‌اند.
- **Completed & Tested — دسترسی/ثبت:** پس از ردهای سیاست مجوز قبلی، مالک Full
  access را فعال کرد و اتصال SSH موفق شد. patch آماده با مسیر مطلق روی فایل‌های
  اصلی اعمال و تغییر محلی قبلی حفظ شد؛ whitespace سالم است. نخستین check با مسیر
  نسبی اشتباه، پیش از هر تغییری شکست خورد و با مسیر درست رفع شد. رمز و OTP گرفته نشد.
- **Completed & Tested — هدف فعلی:** Git سرور تمیز و روی `232afae` است؛ tree آن
  با مبنای PR برابر است. هر ۱۸ migration نصب‌شده کامل و checksumها مطابق‌اند؛
  این PR تغییر Schema ندارد. API/worker در پیکربندی و دو ماژول با هش برابر
  هماهنگ‌اند. سرویس‌ها سالم و Import/صف event فعال در بررسی تازه صفر بودند؛
  quiesce/drain باید درست پیش از rollout مجاز دوباره تأیید شود.
- **Completed & Tested — بکاپ/بازیابی واقعی:** بکاپ کامل
  `pr28-complete-20261020T050208Z` تهیه شد. شمارش هر ۹۹ جدول و pg_dump از یک
  snapshot read-only مشترک گرفته شدند. هر ۱۸ فایل خصوصی و ۴۹ فایل عمومی S3 با
  مقایسهٔ دانلودی محتوا تأیید و موجودی پیش/پس بدون تغییر بود. فایل‌های محلی و
  پیکربندی نیز در آرشیو رمزگذاری‌شده قرار گرفتند؛ هیچ دادهٔ خصوصی وارد Git نشد.
- **Completed & Tested — رمزگشایی/restore:** کلید مستقلِ تازه در محل خصوصی مالک
  خارج از سرور با ACL محدود ساخته و کلیدهای قدیمی حفظ شدند. آرشیو از سرور به
  محل حفاظت‌شدهٔ مالک منتقل، واقعاً رمزگشایی و هر ۷۶ hash payload تطبیق داده شد.
  همان آرشیو رمزگشایی‌شده در PostgreSQL موقت با network=none، بدون پورت عمومی یا
  mount زنده، بازیابی شد: شمار هر ۹۹ جدول، migrationها و hash هر ۶۷ آبجکت برابر؛
  trigger append-only audit فعال؛ چهار ciphertext MFA با کلید برنامهٔ موجود در
  بکاپ قابل رمزگشایی بودند. کلیدهای لازمِ config نیز با runtime برابر بودند.
  این آزمون، ورود واقعی مالک یا تست API مجوزهای دانلود نبود.
- **تاریخچهٔ شکست restore، رفع‌شده:** تلاش اول پس از pg_isready زودتر از ساخته‌شدن
  دیتابیس مقصد به سرور موقت init وصل شد. شرط PID 1=postgres و SELECT 1 موفق
  اضافه شد؛ تلاش دوم تمام کنترل‌های بالا را گذراند. container موقت پاک شد و
  log شکست اول حفظ شد. این شکست، خرابی dump یا تغییر Production نبود.
- **Completed & Tested — نسخهٔ خارج از سرور:** فایل رمزگذاری‌شده در مقصد خصوصی
  بکاپ موجود کپی و دوباره خوانده شد؛ SHA-256 و اندازهٔ 4,250,824 بایت با نسخهٔ
  رمزگشایی/بازیابی‌شده برابر بود. کلید خصوصی جدید روی سرور یا داخل بکاپ/Git نیست.
- **Deferred Later — برنامهٔ روزانه:** بکاپ کامل این انتشار اثبات شد؛ اسکریپت
  روزانهٔ موجود هنوز S3 را پوشش نمی‌دهد و کلید پیشینِ آن پیدا نشده است. اصلاح
  schedule/retention یا جایگزینی کلید آن انجام نشده است. نسخه‌نگاری خصوصی در
  مشاهدهٔ 2026-10-19 و عمومی در 2026-10-20 غیرفعال بود؛ policy تغییر نکرد.
- **Implemented Pending Verification — بستهٔ انتشار:** قدم جاری ساخت imageهای
  API/worker/web از SHA مشخص PR، بررسی dependency/worker XLS در image بدون
  شبکه/دادهٔ زنده، ثبت شناسهٔ imageها و بررسی CI همان commit است. هنوز هیچ
  image جدیدی جای سرویس زنده را نگرفته است.
- **Requires Owner Decision — rollout/rollback:** پس از ساخت و کنترل نسخه،
  نتیجه و ریسک نبود Preview عمومی ارائه و تأیید نهایی Merge/انتشار همان نسخه
  گرفته شود. ورودی Import مهار، jobها تخلیه و API/worker/web هماهنگ جایگزین شوند؛
  imageهای قبلی با شناسهٔ ثابت حفظ شوند. rollback کد، دادهٔ Import را معکوس
  نمی‌کند و worker قدیمی نباید job جدید مصرف کند. restore مخرب تصمیم جداگانه لازم دارد.
- **Checkpoint ثبت/ارسال‌شده:** فقط دو سند PROGRESS/readiness در commit 883df80db8febd1eadf308967c3b079adbf9a3ab ثبت و روی feature ارسال شدند؛ کد برنامه تغییر نکرد. GitHub connector یک خطای transport داد؛ read از gh و ls-remote همان مبدأ/مقصد را تأیید کرد. candidate همین SHA در مسیر مستقل و با نام imageهای جدا در حال build است؛ container برنامه در برابر Production شروع نشده است. CI این SHA باید جدا از CI قبلی بررسی شود. این خط پس از commit تغییر محلی PROGRESS است.
- **Completed & Tested — CI آخرین feature:** run 39373413011 روی SHA 883df80db8febd1eadf308967c3b079adbf9a3ab کاملاً SUCCESS شد؛ PR Draft/OPEN/CLEAN است. نخستین build candidate پیش از ساخت با unknown flag --progress متوقف شد چون Buildx روی سرور نصب نبود. log حفظ شده؛ ابزار رسمی Docker Buildx با digest انتشار در tooling اختصاصی candidate آماده می‌شود، بدون تغییر daemon یا سرویس‌های Production. فقط ساخت بسته تکرار خواهد شد؛ restore و baseline تکرار نمی‌شوند.
- **Completed & Tested — بستهٔ نهایی:** هر سه image API/worker/web از
  `883df80db8febd1eadf308967c3b079adbf9a3ab` ساخته و با همین revision برچسب‌گذاری
  شدند. hash آرشیو source روی سرور و مبدأ محلی برابر است. imageها با نام جدا
  نگهداری می‌شوند؛ سرویس زنده همچنان نسخهٔ قبلی را اجرا می‌کند. ماژول‌های
  Import/reader در API و worker hash برابر دارند. ابزار رسمی Buildx فقط در
  tooling مستقل candidate قرار گرفت؛ daemon/config عمومی Docker تغییر نکرد.
- **Completed & Tested — smoke داخل بسته:** XLS واقعیِ کاملاً مصنوعی با دو ردیف
  در container بدون شبکه خوانده شد؛ dependency همان SheetJS 0.20.3 است و شمارهٔ
  000123 درست حفظ شد. تلاش اولِ smoke، --input-type=module را به worker eval
  ارث می‌داد و require در آن محیط تعریف نبود؛ همان ReferenceError با worker
  کوچک جدا بازتولید شد. اجرای آزمون از فایل با execArgv معمول Production موفق
  شد؛ کد برنامه و imageها تغییر/دوباره ساخته نشدند. log شکست اولیه محفوظ است.
- **Completed & Tested — طرح rollout/rollback:** Compose هر دو طرح فقط image سه
  سرویس و pull_policy=never را عوض می‌کند؛ environment، network و volumeها برابر
  baseline باقی می‌مانند. شناسه‌های image قدیمی موجود و rollback reviewable است.
  helper اجرا نشده و تنها syntax آن بررسی شده است. پیش از جایگزینی، API/web
  متوقف، تمام jobهای Import معمولی/برند و outbox تخلیه، سپس worker قدیمی متوقف
  می‌شود تا نسخه‌های worker مخلوط نشوند. هیچ migration یا restore زنده در طرح نیست.
- **Completed & Tested — وضعیت نهایی قبل از تأیید:** CI آخرین feature، run
  `39373413011`، SUCCESS و PR #28 همان SHA، OPEN/Draft/CLEAN است. سرویس‌های قدیمی
  healthy و scannerSignatures=fresh بود؛ صف event فعال/منتظر صفر بود. Importهای
  معمولی موجود FAILED/AWAITING_MAPPING/PREVIEW_READY/COMMITTED بودند و مورد فعال
  نداشتند؛ هیچ‌کدام دستی تغییر وضعیت داده نشدند.
- **Requires Owner Decision — تنها قدم اجرایی بعدی:** تأیید صریح نهایی مالک برای
  Merge PR #28 روی SHA دقیق 883df80 و انتشار همین سه image آماده لازم است. طرح
  شامل وقفهٔ کوتاه احتمالی، کنترل سلامت/صف‌ها، ورود کارکنان توسط خود مالک و تست
  فایل مصنوعی کوچک با Undo فقط همان job است؛ آرشیو تأمین‌کننده وارد نمی‌شود.
  نبود Preview عمومی و کار بعدی بکاپ دوره‌ای باید در تصمیم مالک دیده شوند.
  rollback کد دادهٔ تازه را معکوس نمی‌کند؛ بازگشت worker قدیمی تنها پس از بررسی
  jobهای جدید مجاز است. restore مخربِ دادهٔ زنده تأیید جداگانه می‌خواهد.
- **Completed & Tested — کنترل نهایی 2026-10-20 ساعت 09:14 Asia/Tehran:** هر ۱۸
  checksum migration با source candidate برابر، Import فعال معمولی/برند و outbox
  ناتمام صفر، صفحات عمومی و ورود HTTPS/200 بودند. readiness وابستگی‌ها سالم و
  امضاهای scanner تازه بود؛ سرویس‌ها همچنان imageهای قدیمی را اجرا می‌کردند.
  نخستین پرس‌وجوی آخر فقط به علت escaping کوتیشن در shell خطای syntax داشت و
  هیچ داده‌ای عوض نشد؛ با اجرای آرگومان‌های SQL از helper Python، همان کنترل
  هدفمند موفق شد. طرح دقیق تصمیم انتشار در خروجی RELEASE_NEXT_STEP همین گفتگو
  آماده است. اکنون فقط تأیید نهایی مالک برای Merge/rollout/تست مصنوعی منتظر است.
- **ثبت محلی پس از commit:** این نتایج ساخت/طرح در PROGRESS و readiness محلی
  ثبت می‌شوند؛ remote HEAD/کد/imageها همچنان 883df80 هستند. CI سبز همان SHA است.
  برای ثبت هر خط نتیجه commit/CI تکراری ساخته نشود. هیچ Merge یا rollout انجام نشده است.

### آماده‌سازی امن Preview مستقل — 2026-10-19

- **Completed & Tested — بازیابی checkpoint:** HEAD/remote برابر
  `6475e92460485662c069ece144f8d9a0f9828d8c`، شاخه
  `refactor/source-enterprise-upgrade` و PR #28 در حالت `OPEN`/Draft/
  `MERGEABLE` هستند. CI آخرین HEAD، run `39253616669`، موفق است. فقط همین
  فایل پس از ثبت این بررسی تغییر محلی دارد؛ هیچ test سبز قبلی تکرار نشد.
- **Completed & Tested — DNS فقط‌خواندنی:** NS دامنهٔ apex در Arvan (`r` و `j`
  زیر `ns.arvancdn.ir`) است و apex از HTTPS پاسخ 200 می‌دهد. اما
  `preview.sourcebyhedax.ir` در resolver محلی و دو resolver عمومی مستقل
  (`1.1.1.1` و `8.8.8.8`) برای A/CNAME، `NXDOMAIN` است. یک hostname تصادفی زیر
  همین دامنه نیز `NXDOMAIN` است؛ wildcard عمومی هم مشاهده نشد. بنابراین مانع
  فعلی نبودن رکورد عمومی Preview است، نه صرفاً cache محلی. هیچ DNS/سرور/Production
  تغییر نکرد.
- **Completed & Tested — بررسی read-only استقرار:** `infra/docker-compose.yml`
  stack کامل جدا (PostgreSQL، Redis/BullMQ، ClamAV، API، worker، web، Caddy و
  volumeهای داده) و `.env.example` متغیرهای staging/storage/provider را دارد.
  `APP_ENV=staging` در اعتبارسنجی برنامه production محسوب نمی‌شود؛ simulator
  پرداخت و `dev-log` پیامک برای دادهٔ آزمایشی مجازند، ولی در production ممنوع‌اند.
  actual `.env` یا هر secret خوانده/نمایش داده نشد.
- **Requires Owner Decision — topology Preview:** Compose فعلی نام پروژهٔ ثابت
  `hedax` و publish پورت‌های 80/443 دارد. اجرای آن کنار Production روی یک Docker
  host بدون project/port/reverse-proxy جدا تضاد دارد. امن‌ترین topology یک host یا
  Docker context مستقل Preview است؛ هم‌مکانی فقط با طراحی reviewشدهٔ proxy مرکزی،
  project/volumeهای preview و عدم publish پورت‌های رقیب قابل بررسی است.
- **Blocked External — storage/media isolation:** Caddyfile موجود profile
  Production است و `/media/*` را به bucket عمومی Production proxy می‌کند. این
  فایل نباید برای Preview بی‌تغییر استفاده شود. پیش از deploy باید profile/override
  جدا و reviewشده‌ای وجود داشته باشد که به local preview volume یا bucketهای
  preview مستقل اشاره کند؛ bucket، private prefix و credentialهای Production
  هرگز reuse نشوند.
- **Blocked External — موارد واقعاً مفقود:** مقصد Preview (host/context و روش
  دسترسی عملیاتی)، رکورد DNS و TTL، topology routing/TLS، فایل محیط حفاظت‌شده با
  رازهای تازه، DB/Redis/queue مستقل، storage namespace مستقل، و شواهد readiness
  سرور هنوز ارائه نشده‌اند. ابزار `cloud_environment.environment_status` نیز در
  این جلسه در دسترس نبود و در workspace ویندوز فایل policy مدیریت‌شده وجود نداشت؛
  نتیجهٔ DNS فقط مشاهدهٔ عمومی است، نه دسترسی زیرساخت.
- **برنامهٔ اجرایی پیشنهادی، بدون اجرای آن:**
  1. مالک/اپراتور مقصد مستقل Preview و اینکه آیا host از Production جداست را
     تعیین کند؛ اگر همان host است، طرح proxy/port و project `hedax-preview` باید
     پیش از تغییر review شود.
  2. یک رکورد DNS A/AAAA یا CNAME برای `preview.sourcebyhedax.ir` به مقصد Preview
     ثبت شود و propagation فقط‌خواندنی تأیید گردد. این کار تغییر DNS و نیازمند
     تأیید صریح مالک است.
  3. یک فایل محیط خارج از Git روی مقصد ساخته شود: `APP_ENV=staging`،
     `PUBLIC_BASE_URL=https://preview.sourcebyhedax.ir`، رازهای تازه و مجزا،
     providerهای آزمایشی (`PAYMENT_PROVIDER=simulator`، `SMS_PROVIDER=dev-log`،
     `MAIL_PROVIDER=none`) و بدون هر credential Production. مقادیر در chat یا
     PROGRESS ثبت نشوند.
  4. DB و Redis/BullMQ فقط در volume/context Preview ایجاد شوند؛ هیچ connection
     string، backup یا dump Production برای seed استفاده نشود. دادهٔ پایه فقط پس
     از بازبینی reference-only بودن آن و حساب/دادهٔ synthetic ساخته شود.
  5. قبل از start، profile رسانهٔ Preview آماده و review شود: bucketهای private/
     public جدا یا volume محلی Preview، و Caddy بدون proxy bucket Production.
  6. پس از تأیید صریح مالک برای عملیات Preview، SHA reviewشدهٔ PR با API/worker
     هم‌نسخه deploy، migrationهای reviewشده اجرا، سپس readiness داخلی، TLS،
     login synthetic، import preview/run/error/Undo و پاک‌بودن queue/storage
     بررسی شوند. نتیجهٔ غیرمحرمانه ثبت شود.
- **قدم بعدی:** تا دریافت اطلاعات عملیاتی غیرمحرمانه و تأیید مالک برای تغییر DNS/
  ساخت Preview، فقط می‌توان پیکربندی Preview را به‌شکل reviewable آماده کرد؛ هیچ
  deployment، migration، import یا تغییر Production/PR Merge مجاز نیست.

### پروفایل reviewable Preview — 2026-10-19

- **Completed & Tested — پیکربندی بدون تغییر خارجی:**
  `infra/docker-compose.preview.yml`، `infra/caddy/Caddyfile.preview` و
  `infra/preview.env.example` افزوده شدند و `docs/PREVIEW_ISOLATION_PROFILE.md`
  نحوه و مرز استفاده را ثبت می‌کند. overlay نام Compose را به `hedax-preview`
  تغییر می‌دهد؛ بنابراین network و volumeهای PostgreSQL، Redis/BullMQ، storage،
  ClamAV و Caddy با نام جدا ایجاد خواهند شد. اجرای آن فقط روی ingress/host مستقل
  مجاز است؛ عمداً برای hostی که Caddy Production پورت 80/443 را دارد طراحی نشده است.
- **Completed & Tested — ایزوله‌سازی رفتار:** API/worker/tools در profile جدید
  `APP_ENV=staging` و local storage دارند؛ payment، SMS، mail و Telegram/Bale
  صریحاً خاموش‌اند. Caddy Preview به API محلی برای `/media/` reverse-proxy می‌کند
  و هیچ endpoint/bucket تولیدی ندارد، کل host را با credential جدا حفاظت می‌کند،
  header `noindex` دارد و namespace webhook را 404 می‌کند. template محیط فقط نام
  متغیرها را دارد و secret ندارد.
- **Completed & Tested — اعتبارسنجی محلی:**
  `docker compose -f infra/docker-compose.yml -f infra/docker-compose.preview.yml
  --env-file infra/preview.env.example config` با مقادیر ساختگی غیرمحرمانه موفق
  شد؛ خروجی project `hedax-preview_default` و volumeهای
  `hedax-preview_{pgdata,redisdata,storage,...}` را نشان داد. سپس
  `caddy validate` در container موقت `--network none` با hash آزمایشی موفق شد؛
  هیچ stack/container ماندگار، پورت، DNS، سرور یا Production تغییر نکرد.
- **Incomplete / external:** مقصد مستقل Preview، هدف DNS و TTL، روش دسترسی
  اپراتوری، فایل محیط حفاظت‌شده با secretهای تازه، و مجوز صریح مالک برای ایجاد
  DNS/deploy هنوز موجود نیست. `seed-base` فقط metadata پایهٔ ایمن دارد؛
  `seed-dev` در staging رد می‌شود، پس روش ایجاد catalog/media کاملاً synthetic و
  برچسب‌دار هنوز پیش‌نیاز جداگانه است. archive خصوصی Hyundai/Kia، dump/backup و
  هر دادهٔ کاربر/سفارش/تأمین‌کنندهٔ Production برای Preview ممنوع‌اند.
- **فایل‌های تغییرکردهٔ محلی:** `PROGRESS.md`،
  `docs/PREVIEW_ISOLATION_PROFILE.md`، `infra/docker-compose.preview.yml`،
  `infra/caddy/Caddyfile.preview` و `infra/preview.env.example`. هنوز commit/push
  نشده‌اند و checkpoint بعدی باید همهٔ آن‌ها را همراه با این ثبت در Draft PR
  قرار دهد؛ هیچ CI یا وضعیت PR تا این لحظه تغییر نکرده است.
- **قدم بعدی دقیق:** مالک باید فقط اطلاعات غیرمحرمانهٔ زیر را مشخص کند: آیا
  Preview host/ingress مستقل است یا هم‌مکانی نیاز به طرح proxy دارد؛ target مورد
  تأیید DNS چیست؛ و آیا ایجاد record و deploy پس از review مجاز است. پس از آن
  ابتدا فقط همان topology/DNS review می‌شود؛ پیش از هر write عملیاتی تأیید صریح
  جداگانه لازم است.
- **Checkpoint ثبت‌شده:** همهٔ پنج فایل بالا در commit
  `3343dcb` (`docs: add isolated preview deployment profile`) ثبت و روی
  `origin/refactor/source-enterprise-upgrade` push شدند. هیچ Merge/deploy/DNS یا
  تغییر Production انجام نشد. CI همان SHA، run `39258053730`، در ۲m۳۸s کاملاً
  موفق شد (lint، typecheck، unit، catalog/import، CMS، backup/restore و build
  وب). تنها annotation غیرمسدودکننده، deprecation وابستگی Node 20 در
  `pnpm/action-setup` است؛ job روی Node 24 اجرا شد. این checkpoint پس از commit
  محلی به‌روزرسانی شده و تنها تغییرِ باقی‌مانده است.
- **وضعیت نهایی PR در این جلسه:** PR #28 روی SHA
  `3343dcbaaa1d520c817809317ac6a4ceed8f1d56` هنوز `OPEN` و Draft است؛
  `mergeStateStatus=CLEAN` و check CI همان SHA `SUCCESS` است. این فقط آمادگی
  بازبینی فنی را نشان می‌دهد، نه مجوز Merge یا انتشار. مانع انتشار همچنان نبود
  Preview مستقلِ مستقر و پذیرش‌شده و سپس تأیید صریح مالک است.

### ادامهٔ آمادگی انتشار — 2026-10-19

- شروع این جلسه: Git روی `d5b649f` با origin همگام، فقط ثبت نهایی PROGRESS محلی
  تغییر داشت. PR #28 باز، Draft، بدون conflict و CI همان HEAD موفق بود.
- TEST-02 و baseline تکرار نشدند. دامنه فقط پذیرش XLS قدیمی، UI چندمنبعی قدیمی
  و تأیید Preview است؛ هیچ Merge یا تغییر Production/Preview انجام نشده است.
- **Completed & Tested:** UI برای outlineهای قدیمی بدون
  `options.sources` نگاشت مستقل در حافظه ایجاد می‌کند و تا ذخیره داده‌ای نمی‌نویسد؛
  امکان حذف انتخابی منبع و توضیح نیاز به بارگذاری مجدد برای تغییر header فراهم شد.
  آزمون مرورگر payload ذخیره و آزمون API با JSON قدیمی اضافه شدند.
- **Completed & Tested:** آزمون XLS واقعی برای فایل بزرگ، تعداد
  شیت/ستون و لغو مصرف‌کننده، و fault injection برای timeout/خروج/خطای worker و
  توقف deadline هنگام مصرف کند اضافه شدند. fault injection معادل OOM واقعی نیست.
- **Blocked External — Preview:** DNS محلی `preview.sourcebyhedax.ir` خطای
  `DNS_ERROR_RCODE_NAME_ERROR` داد. پیکربندی جداسازی تأییدشده در شواهد فعلی نیست؛
  نشانی/راهنمای غیرمحرمانهٔ محیط از مالک درخواست شد. صرف دسترسی دامنه اثبات جدایی
  DB، Redis/صف‌ها، storage یا provider نیست؛ هیچ تست نوشتنی روی آن اجرا نشد.
- فایل‌های جدید/تغییریافتهٔ این مرحله: `legacy-xls.test.ts`،
  `legacy-xls-lifecycle.test.ts`، suite `94-brand-workbooks`،
  `apps/web/e2e/unified-parts.spec.ts` و `brand-imports.tsx` و همین فایل.
- گزارش پذیرش و حدود UI/worker:
  [docs/PR_28_RELEASE_READINESS.md](docs/PR_28_RELEASE_READINESS.md).
- قدم بعدی: ثبت/ارسال همین تغییرات روی feature، تطبیق CI آخرین HEAD و شرح PR؛
  سپس دریافت شواهد Preview مستقل و پذیرش همان نسخه. انتشار آماده نیست.
- تغییرات این مرحله در `e4aff78977c51527e2cccd809dca4d2fe9900920` ثبت و روی
  همان `origin/refactor/source-enterprise-upgrade` ارسال شدند. push موفق است؛
  اولین read فوری GitHub هنوز HEAD قبلی `d5b649f` را برگرداند، بنابراین CI قبلی
  به‌عنوان تأیید این commit معرفی نمی‌شود. منتظر تطبیق HEAD/CI جدید هستیم.
- **خطای CI روی e4aff78، در حال رفع:** run `39229762264` در مرحلهٔ Catalog/import
  شکست خورد، در حالی‌که build/lint/typecheck/unit موفق بودند. علت assertion قدیمی
  suite 94 بود: regression تازه دو قطعه را با همان manufacturer مشترک ایجاد می‌کرد
  و شمارش انتهایی test قدیمی از ۳ به ۵ رسید. هیچ کد برنامه یا دادهٔ واقعی درگیر
  نیست. اصلاح محلی regression را روی manufacturer اختصاصی می‌برد و suite کامل 94
  اکنون دوباره اجرا می‌شود. تا CI commit بعدی سبز نشود، PR آمادهٔ بررسی نهایی نیست.
- **Completed & Tested محلی — رفع CI:** suite کامل `94-brand-workbooks` پس از
  isolation، ۳ تست موفق، exit 0، 53.35 ثانیه؛ ESLint همان فایل و `git diff --check`
  نیز موفق. اصلاح و checkpoint در `c3f7fbe443a56a51e62bcc4d72d6b19df3633683`
  ثبت و روی feature ارسال شدند. CI تازه باید فقط همین SHA را تأیید کند؛ run شکست‌خورده
  `39229762264` متعلق به `e4aff78` است و جایگزین نمی‌شود.
- CI جدید `39253160464` دقیقاً روی `c3f7fbe` ایجاد شده و در زمان این checkpoint
  در حال اجراست؛ PR #28 همچنان Draft، OPEN و `MERGEABLE` است. فقط همین فایل
  پس از ثبت وضعیت CI در working tree تغییر دارد.
- **Completed & Tested — CI نهایی اصلاح:** run `39253160464` روی
  `c3f7fbe443a56a51e62bcc4d72d6b19df3633683` کاملاً موفق شد. build API/shared،
  lint، typecheck، unit، Catalog/Import (شامل suite 94)، CMS، backup/restore
  disposable و production web build همگی success هستند. run قبلی شکست‌خورده صرفاً
  تاریخچهٔ isolation test است و با این run رفع شده است. PR از نظر CI/review فنی
  آماده است، اما برای انتشار Production آماده/مجاز نیست تا Preview مستقل و
  acceptance مستقر و سپس تأیید صریح مالک تکمیل شود.
- checkpoint CI در `6475e92460485662c069ece144f8d9a0f9828d8c` commit/push شد؛
  هر run تازه‌ای که GitHub برای این commit صرفاً مستنداتی آغاز کند باید جدا از
  CI سبز کد `c3f7fbe` ثبت شود. Git پس از این ثبت محلی فقط همین فایل را تغییرشده
  نشان می‌دهد.
- **Completed & Tested — CI آخرین HEAD:** run `39253616669` روی
  `6475e92460485662c069ece144f8d9a0f9828d8c` نیز کاملاً success شد. بنابراین
  آخرین HEAD، CI سبز، Draft/OPEN و `MERGEABLE` است. این نتیجه پس از commit برای
  حفظ checkpoint محلی ثبت شده؛ فقط `PROGRESS.md` dirty است و عمداً commit تازه‌ای
  ایجاد نمی‌شود تا CI تکراری بی‌دلیل شروع نشود.
- **Blocked External — Preview، بررسی فقط‌خواندنی تکرار شد:** DNS همچنان
  `DNS_ERROR_RCODE_NAME_ERROR` و TCP/443 بدون RemoteAddress است. هیچ تغییر DNS/
  سرور/Production و هیچ درخواست نوشتنی Preview انجام نشد. برنامهٔ راه‌اندازی
  Preview در `docs/PR_28_RELEASE_READINESS.md` و runbook باقی است؛ برای اجرا به
  نشانی/زیرساخت مستقل و شواهد غیرمحرمانهٔ isolation نیاز است.
- نتیجهٔ میانی: هر ۱۰ تست XLS موفق؛ lint و typecheck کل workspace موفق شدند.
  تست جدید API ابتدا به علت assertion روی `product.nameEn` شکست خورد؛ نام انگلیسی
  در `translations` ذخیره می‌شود، assertion به همان مدل واقعی اصلاح شد. مرورگر
  دو تست قبلی را گذراند؛ تست جدید به علت نادیده‌گرفتن پیشنهاد موجود `description`
  در payload مورد انتظار شکست خورد و انتظار دقیق اصلاح شد. کد برنامه برای این
  دو شکست عوض نشد؛ فقط دو تست ناموفق دوباره اجرا می‌شوند.
- نتیجهٔ نهایی محلی: تست API قدیمی در suite 94 با `-t 'old inspections'` موفق،
  یک تست، دو مورد قبلی عمداً فیلتر، exit 0، کل 38.93 ثانیه. دو محصول و ترجمهٔ
  انگلیسی، نگاشت مستقل و کنارگذاشتن منبع سوم تأیید شدند. تست مرورگر جدید در
  تکرار هدفمند یک pass، exit 0، 22.6 ثانیه؛ دو مورد قبلی در اجرای اول موفق بودند.
  نتیجهٔ شکست اولیه پاک نشده است. هر ۱۰ unit XLS و typecheck API موفق؛ lint
  نهایی فایل‌های تغییرکرده و `git diff --check` موفق. هیچ تغییر کد backend لازم نشد.
- محدودیت‌های عملیاتی: انتخاب header فقط از ۲۰ ردیف نمونه؛ outline قدیمی بدون
  sample برای تغییر header نیازمند upload مجدد است؛ یک سازنده در هر job و بازبینی
  انسانی همچنان لازم‌اند. این‌ها محدودیت مستندند، نه خرابی حل‌نشدهٔ UI. تست واقعی
  OOM/RSS کل فرایند یا benchmark انجام نشده؛ خطای worker به روش fault injection
  آزموده شد و حذف spool/توقف worker با XLS واقعی بررسی شد.
- `next-env.d.ts` فقط با Next dev به مسیر typeهای dev تغییر کرد و پس از اتمام
  تست به همان دو import نسخهٔ HEAD برگشت؛ در تغییر محصولی وارد نمی‌شود.

- **Completed & Tested — TEST-02:** علت واقعی در Linux بازتولید و رفع شد. کپی
  PGDATA مجوز ریشه را از `0700` به `0755` تبدیل می‌کرد و PostgreSQL restore را رد
  می‌کرد. خطای خالی startup و انتظار stop برای child ازقبلخارج‌شده، علت را پنهان
  و timeout ثانویه ایجاد می‌کردند. گزارش کامل:
  [docs/TEST_02_BACKUP_REPORT.md](docs/TEST_02_BACKUP_REPORT.md).
- اصلاح محدود به fixture و CI موجود است: حفظ/بررسی مجوز ریشه در backup و restore،
  I/O ناهمگام، خطای startup قابل تشخیص، shutdown بدون پنهان‌کردن خطا، مسیر موقت
  یکتا و کنترل محدودهٔ copy/remove. هیچ ساختار اصلی، schema یا کد برنامه عوض نشد.
- **CI نهایی موفق** روی کد `767183ff7c7949855366f173f17e7b49390884f7`:
  [run 39225452667](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39225452667).
  ۲۲۸ تست واحد، ۳۳ Import/کاتالوگ، ۱۲ CMS و یک backup؛ lint/typecheck و web build
  همگی موفق. PGDATA اصلی/backup/restored در Linux همگی `0700` و startup سالم است.
- کنترل هدفمند ویندوز نیز موفق: `pnpm --filter @hedax/api exec vitest run --config
  vitest.integration.config.ts test/integration/60-backup-restore.test.ts`، یک تست،
  exit 0، کل اجرا 115.03 ثانیه با setup. timeout خود تست همان ۹۰ ثانیه باقی ماند.
- تاریخچهٔ شکست حفظ شده است: run تشخیصی `39216172835` روی `f24630e` علت permission
  و timeout cleanup را نشان داد؛ اصلاح permission در `00e9e98` روی Linux موفق شد.
  اجرای همگام ویندوز timeout داشت؛ نسخهٔ ناهمگام `767183f` روی هر دو محیط موفق شد.
  هیچ assertion حذف و هیچ timeout برای سبزکردن تست افزایش داده نشد.
- [PR #28](https://github.com/ali-hedax/source-auto-parts-platform/pull/28) هنوز Draft،
  باز و ادغام‌نشده است. TEST-02 دیگر مانع فنی نیست؛ تغییرات برای بررسی کد آماده‌اند.
  **انتشار Production آماده/مجاز اعلام نمی‌شود:** Preview مستقل هنوز تأیید نشده،
  پذیرش UI قدیمی و cleanup هدفمند XLS در ادامهٔ همین جلسه تکمیل شدند؛ بررسی مالک
  و تأیید صریح انتشار نیز لازم است. backup فعلی سرور هدف با این تست مصنوعی اثبات نشد.

### سابقهٔ Git در checkpoint بسته‌شدهٔ TEST-02؛ HEAD جاری بالاست

- شاخه: `refactor/source-enterprise-upgrade`؛ upstream:
  `origin/refactor/source-enterprise-upgrade`.
- آخرین HEAD کدِ تست‌شده: `767183ff7c7949855366f173f17e7b49390884f7`.
  commitهای TEST-02: `f24630e` (تشخیص)، `00e9e98` (permission/cleanup)،
  `767183f` (I/O ناهمگام). همگی روی feature ارسال شده‌اند؛ commit اسناد بعدی ممکن
  است HEAD را جلو ببرد و SHA آن باید با Git تطبیق داده شود.
- مبنای feature: `d205e373478b628f377feb4915dd19477d0f4eae`؛ پیاده‌سازی Import
  قبلی در `8c1869d` و اصلاح فرمان portable CI در `c8eb406` ثبت شده‌اند.
- main محلی اولیه `391513d` و worktree جداگانهٔ `deploy/card-fitment` دست‌نخورده‌اند.
  هیچ merge، deployment، migration یا نوشتن داده روی Production/Preview انجام نشد.
- این مرحله فقط TEST-02 بود. IMP-07، خواندن ZIP خصوصی و baseline تکرار نشدند؛
  CI طبق workflow خودش کنترل‌های لازم را اجرا کرد. نمونهٔ تأمین‌کننده وارد DB نشد.
- فایل‌های همین مرحله: `apps/api/test/integration/60-backup-restore.test.ts`،
  `.github/workflows/ci.yml`، `PROGRESS.md` و اسناد گزارش/backup/audit/runbook.
  گزارش نهایی اسناد ثبت شده است؛ هر تغییر باقی‌مانده را با Git بررسی کنید.
- گزارش نهایی در `d5b649f8dc23f023dc5830c9f21538a877e09f57` commit/push شد؛
  شرح PR نیز با بسته‌شدن TEST-02 و شروط باقی‌ماندهٔ انتشار هماهنگ شد. Git قبل از
  این ثبت نتیجه تمیز و با origin همگام بود. PR باز، Draft و بدون conflict است؛
  هیچ Merge انجام نشده. CI خودکار این commit صرفاً مستنداتی،
  [39226951115](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39226951115)،
  نیز **موفق شد**؛ HEAD واقعی PR/Git همان `d5b649f` است و کد fixture همان نسخهٔ
  تأییدشدهٔ `767183f`. پس از ثبت نتیجه، تنها تغییر محلی همین `PROGRESS.md` است؛
  کد، گزارش نهایی و شرح PR ثبت/ارسال شده‌اند. مرحلهٔ درخواستی TEST-02 تکمیل است.
- پوشهٔ قدیمی `apps/api/.local-pg/test-9400` و سرویس‌های نامرتبط پاک/متوقف نشدند.

### ادامهٔ بعدی

TEST-02 و کنترل‌های موفق بالا دوباره اجرا یا پیاده نشوند مگر تغییر/خرابی تازه‌ای باشد.
گزارش TEST-02 و پذیرش هدفمند UI/XLS ثبت شده‌اند؛ از تطبیق CI/HEAD همین اصلاح
و سپس تأیید جدایی و پذیرش Preview ادامه دهید. Merge و Production
فقط با تأیید صریح مالک؛ فعلاً PR در حالت Draft باقی بماند.

## وضعیت واقعی پروژه و کارهای موجود

- Monorepo شامل `apps/web` (Next.js/React)، `apps/api` (NestJS/Prisma)،
  `apps/worker`، و بسته‌های مشترک domain/contracts/config است.
- PostgreSQL، Redis/BullMQ، ذخیره‌سازی فایل و زیرساخت Docker/Caddy/ClamAV وجود دارند.
- کاتالوگ فنی یکپارچه با Product، قیمت/موجودی مستقل، Brand Import، جدول‌های
  نگاشت مهاجرت کاتالوگ، مرکز دانش، CMS با draft/publish/rollback و جریان تأمین
  از قبل در کد موجودند؛ نباید دوباره از صفر ساخته شوند.
- در بررسی اولیه ۱۸ پوشهٔ migration و ۹۰ فایل page/route وب شمارش شد.
- `IMPLEMENTATION_PROGRESS.md`، `IMPLEMENTATION_STATUS.md` و اسناد `docs/`
  سابقهٔ قبلی‌اند؛ ادعاهای استقرار/تست قدیمی، تأیید وضعیت فعلی Production نیستند.
- وابستگی‌های محلی پس از به‌روزرسانی شاخه با `pnpm install --frozen-lockfile`
  همگام شدند؛ manifest/lockfile تغییر نکرد. Prisma Client محلی تولید شد.
- تست‌های یکپارچه از PostgreSQL موقت و دادهٔ ساختگی استفاده می‌کنند؛ اتصال
  پرداخت/پیامک شبیه‌سازی شده است. محیط محلی موجود یا دادهٔ Production مصرف نشد.

## تکمیل‌شده و شواهد آزمون — Completed & Tested

این نتایج در همین کار اجرا شده‌اند؛ موفقیت تست‌های محلی معادل آماده‌بودن انتشار نیست.

| بررسی | نتیجه و محدوده |
| --- | --- |
| baseline واحد روی مبنای شاخه | ۲۱۷ تست: domain 125، contracts 12، API 80 موفق |
| baseline یکپارچه API | ۱۳۴ موفق؛ یک benchmark اختیاری اجرا نشده؛ ۲۸ فایل موفق، یک فایل skipped؛ exit 0 |
| بازیابی پشتیبان در baseline | تست بازیابی PostgreSQL موقت موفق؛ اثبات بازیابی backup واقعی Production نیست |
| واحد پس از اصلاحات | ۲۲۲ تست: domain 125، contracts 12، API 85 موفق |
| تست‌های هدفمند آرشیو/Excel/upload | ۷ تست موفق؛ زیرمجموعهٔ شمارش بالا هستند |
| `pnpm typecheck` | موفق در کل workspace؛ بررسی ترجمه‌ها/مجوزها/audit نیز موفق |
| `pnpm lint` پس از اصلاحات اولیه | موفق؛ این نتیجه پیش از تغییرات workbook است، نه تأیید نسخهٔ فعلی |
| کنترل تغییر harness | `pnpm --filter @hedax/api typecheck`، ESLint فایل `global-setup.ts` و `git diff --check` موفق |
| build بسته‌های مشترک و API در مرحلهٔ اولیه | موفق؛ build کامل در ادامهٔ 2026-10-19 تکمیل شد |
| `pnpm --filter @hedax/web e2e -- unified-parts.spec.ts` | ۹ از ۹ موفق، exit 0؛ مرورگر محلی با fixture ساختگی، نه backend واقعی |
| API integration: `85-vehicles`, `91-unified-parts`, `93-brand-import-integrity` | اجرای اولیه: ۲۴ assertion موفق، teardown ناموفق. پس از اصلاح harness: هر سه فایل و ۲۴ تست موفق، exit 0، مدت 61.58 ثانیه |
| بررسی اولیه ZIP واقعی | parser اولیه `ZIP_HAS_NO_CSV` می‌داد؛ این محدودیت با reader جدید رفع شده است |
| reader جدید روی نمونهٔ واقعی | ۴۴ فایل (۲۵ XLS، ۱۹ XLSX)، ۵۴ شیت و ۱۶٬۲۰۴ ردیف غیرخالی خوانده شد؛ بدون import دیتابیس؛ ۳۹ شیت نیازمند بررسی سرستون |
| آزمون‌های جدید header/archive | domain هشت تست و API نه تست موفق؛ مربوط به مرحلهٔ workbook و جدا از شمارش baseline |
| API integration پس از workbook | `91-unified-parts`، `93-brand-import-integrity`، `94-brand-workbooks`: سه فایل، ۱۸ تست موفق، exit 0، مدت 79.75 ثانیه |
| build/typecheck پس از workbook | API build و `pnpm typecheck` موفق؛ lint/مرورگر در آن جلسه اجرا نشده بودند و در ادامهٔ 2026-10-19 تکمیل شدند |
| بازبینی و مستندسازی 2026-10-19 | بررسی ایستای retry، نگاشت هر منبع، reader/حدود و سازگاری rollback؛ چهار سند جدید و دو راهنمای موجود تکمیل شدند. این بازبینی جایگزین تست اجرایی نیست |
| کنترل مستندات 2026-10-19 | هر ۱۹ پیوند محلی در هفت فایل معتبر؛ متن UTF-8 بدون نویسهٔ جایگزین؛ `git diff --check` بدون خطا؛ فهرست تغییرات با Git تطبیق داده شد |
| بازیابی Import پس از اصلاح IMP-07 | `pnpm --filter @hedax/api test:integration -- test/integration/91-unified-parts.test.ts test/integration/93-brand-import-integrity.test.ts test/integration/94-brand-workbooks.test.ts test/integration/95-brand-import-recovery.test.ts`: چهار فایل، ۲۵ تست موفق، exit 0، 125.29 ثانیه؛ شامل هفت تست جدید بازیابی |
| `pnpm typecheck` پس از IMP-07 | کل workspace موفق، exit 0؛ بررسی ترجمه/مجوز/audit موفق |
| `pnpm lint` پس از IMP-07 | اجرای اول سه خطای diagnostic خصوصی؛ پس از استثنای `.local-run/**` اجرای مجدد موفق، exit 0 |
| مرورگرِ مرحلهٔ workbook | با `CI=true` و فیلتر `brand database import\|workbook mapping`: دو تست موفق، exit 0، 1.3 دقیقه؛ تصویر موبایل بررسی شد؛ fixture، نه backend واقعی |
| `pnpm build` کل workspace | موفق، exit 0؛ shared/API، Next production build با ۱۶۷ صفحهٔ static و worker؛ فقط build محلی، نه انتشار |
| CI راه‌دور روی `96ac35a` | ناموفق، exit 1؛ lint/typecheck/unit موفق؛ اجرای ناخواستهٔ کل integration: ۱۴۹ موفق، یک failed و یک skipped، 621.07 ثانیه؛ شکست در `60-backup-restore`، همراه timeout afterAll 180 ثانیه. موفقیت ۱۴۹ assertion به معنی موفقیت job نیست |
| CI راه‌دور روی `c8eb406` | run `39208551626` موفق؛ ۲۲۸ unit، ۳۳ تست در پنج فایل Import/کاتالوگ (23.14 ثانیه)، ۱۲ تست در دو فایل CMS (9.00 ثانیه)؛ lint/typecheck و web build موفق. این اجرای هدفمند شامل suite `60` نیست و TEST-02 را رفع نمی‌کند |
| بازتولید TEST-02 روی Linux | run `39216172835`، `f24630e`: ناموفق؛ PGDATA اصلی `0700`، کپی و restore `0755`، خطای FATAL مجوزها و سپس timeout ثانویهٔ cleanup ۱۸۰ ثانیه. علت اصلی با لاگ اثبات شد |
| اصلاح اولیهٔ permission روی Linux | run `39223797071`، `00e9e98`: موفق؛ مجوز اصلی/backup/restore `0700` و مرحلهٔ صریح backup موفق |
| کنترل ویندوز نسخهٔ همگام | ناموفق، exit 1؛ تست timeout ۹۰ ثانیه و حدود ۴۰۰ ثانیه مدت body در I/O همگام. علت دقیق تأخیر OS اثبات نشده؛ نتیجهٔ ناموفق حفظ شده است |
| کنترل ویندوز نسخهٔ ناهمگام | فقط suite `60`، یک تست موفق، exit 0، 115.03 ثانیه کل اجرا شامل setup؛ timeoutها و assertionها حفظ شدند |
| CI نهایی TEST-02 روی `767183f` | run `39225452667` موفق: ۲۲۸ unit، ۳۳ Import/کاتالوگ، ۱۲ CMS و یک backup؛ lint/typecheck و production web build موفق. startup دیتابیس restored سالم و مجوز هر سه ریشه `0700` است |
| CI آخرین HEAD PR روی `d5b649f` | run `39226951115` نیز موفق؛ HEAD PR تطبیق داده شد، Draft و OPEN باقی است و conflict ندارد. build وب و تمام مراحل CI از جمله backup موفق‌اند؛ Merge/انتشار انجام نشده |

## پیاده‌سازی جاری — Implemented Pending Verification

اصلاحات زیر نوشته شده‌اند و تست‌های مرتبط بالا را دارند؛ تحلیل read-only نمونه و
مرحلهٔ مستندسازی، IMP-07، مرورگر/lint و build کامل محلی انجام شده‌اند؛ پذیرش‌های
تکمیلیِ مشخص‌شده و Preview باقی هستند؛ TEST-02 نیز روی Linux/Windows رفع و CI کاملِ
دارای مرحلهٔ backup موفق شده است:

- Undo با checkpoint نسخهٔ قطعه، حفظ ویرایش‌های بعدی و قطعات دارای استفادهٔ تجاری؛
  جلوگیری از حلقهٔ بی‌پایان Undo و حفظ محافظه‌کارانهٔ Importهای قدیمی بدون checkpoint.
- قفل تراکنشی عملیات هم‌زمان یک سازنده، ترتیب بر اساس شروع واقعی، ثبت FAILED
  برای اجرای ناقص، امکان Undo اجرای ناقص و پردازش قابل تکرار Undo.
- حفظ صفرهای اول شماره‌قطعه در قالب صریح Excel مانند `000000`؛ فرمول اجرا نمی‌شود.
- محدودیت و بررسی ساختار ZIP، حجم واقعی inflate، metadata XLSX و مسیر منبع فایل؛
  جلوگیری از تداخل دو فایل هم‌نام در پوشه‌های متفاوت.
- پاک‌سازی upload موقت با metadata نامعتبر و خنثی‌سازی formula injection در CSV خطا.
- فیلتر خودرو: مدل نامعتبر، غیرفعال یا بدون خودروی متناظر دیگر نتیجهٔ نامرتبط نمی‌دهد.
- توضیح دقیق Undo و آمار حفظ‌شده‌ها در پنل/راهنما، ترجمهٔ خطا و رویداد شکست،
  و افزودن suiteهای `85/91/93/94/95` به مسیر CI. CI راه‌دور روی `c8eb406` موفق است.
- XLS در worker، ZIP ترکیبی، حفظ قالب عددی، انتخاب سرستون/بدون سرستون و نگاشت
  مستقل هر منبع با حذف انتخابی شیت؛ دادهٔ قیمت/موجودی نمونه وارد جریان تجاری نمی‌شود.
- اسناد جدید: `docs/SOURCE_UPGRADE_AUDIT.md`، `docs/IMPORT_WORKBOOKS.md`،
  `docs/ADR_BRAND_WORKBOOK_IMPORT.md` و `docs/SOURCE_UPGRADE_RUNBOOK.md`.
  مرحلهٔ بازبینی/مستندسازی انجام شد؛ این اسناد وضعیت انتشار را «آماده» اعلام نمی‌کنند.
- TEST-02: کد fixture و CI تأیید شده‌اند؛ گزارش نهایی در
  `docs/TEST_02_BACKUP_REPORT.md` و وضعیت جاری در `docs/BACKUP_RESTORE.md` ثبت شد.

## خطاها و موارد ناتمام

1. **خطای teardown ویندوز، رفع‌شده در اجرای مجدد:** پس از موفقیت ۲۴ تست اولیه، حذف پوشهٔ موقت
   `apps/api/.local-pg/test-9400` در `global-setup.ts` با `EPERM` شکست خورد.
   بررسی کد dependency نشان داد `stop()` حذف بدون retry جداگانه‌ای دارد و harness
   خطای آن را پنهان می‌کرد؛ حذف sync نیز به callbackهای بستن فایل فرصت نمی‌داد.
   مالکیت cleanup به harness منتقل شد، مسیر هر اجرا با `mkdtemp` یکتا شد، خطای
   shutdown دیگر مخفی نمی‌شود و حذف async با retry و کنترل محدودهٔ مسیر انجام می‌شود.
   اجرای مجدد سه suite با ۲۴ تست و exit 0 موفق بود. علت دقیق قفل سیستم‌عامل در
   اجرای قبلی اثبات نشده؛ پوشهٔ قدیمی باقی است و فرایند/دیتابیس نامرتبط تغییر نکرد.
2. خطاهای اولیهٔ `spawn EPERM` ناشی از sandbox با اجرای مجاز محلی رفع شدند.
   نبود وابستگی‌های جدید در node_modules با نصب frozen lockfile رفع شد.
3. **شکاف اولیهٔ نمونه، رفع‌شده در parser و نیازمند نگاشت انسانی:** `Hyundai-Kia-Parts-List-sff8fl.zip` در Desktop
   بررسی شد: ۴٬۵۳۹٬۲۶۲ بایت فشرده، ۲۷٬۲۹۴٬۳۶۵ بایت مجموع فایل‌ها، ۴۴ فایل
   (۲۵ XLS، ۱۹ XLSX)، بدون مسیر traversal در فهرست آرشیو. اکنون کل آرشیو خوانده شده؛
   خروجی خصوصی تحلیل فقط در مسیر ignored `.local-run/supplier-analysis` است.
   نام‌های ZIP با encoding نامشخص، شناسهٔ پایدار مبتنی بر بایت‌های نام می‌گیرند؛
   نام فارسی حدس زده نمی‌شود. ۳۹ شیت به بررسی سرستون و همهٔ منابع به انتخاب درست
   سازنده نیاز دارند. نمونه فقط داده است؛ نباید commit یا به Production وارد شود.
4. **IMP-07، رفع‌شده در آزمون‌های محلی:** cursor/hash پیشوند و شمارنده‌ها/خطاها
   با دادهٔ batch در یک تراکنش ذخیره می‌شوند. هفت تست بازیابی، رقابت، rollback
   تراکنش، ویرایش شماره‌قطعه، تغییر/کوتاه‌شدن منبع و وضعیت قدیمی موفق‌اند. این مورد
   نباید دوباره از ابتدا پیاده شود. آزمون قطع برق واقعی یا chaos روی زیرساخت انجام نشده است.
5. مقایسهٔ عملکرد قبل/بعد این اصلاحات اندازه‌گیری نشده؛ اعداد قدیمی را نباید به
   عنوان benchmark فعلی یا ادعای بهبود سرعت معرفی کرد.
6. **مانع اجرای ابزار، رفع‌شده:** پس از تلاش‌های ناموفق قبلی به‌علت quota/capacity،
   درخواست جدید ادامه دریافت و همان مسیر مجوز موفق شد. lint، دو تست مرورگر، typecheck
   و build کامل اکنون انجام شده‌اند. اولین lint به اسکریپت خصوصی ایراد گرفت و با
   هماهنگ‌کردن ignore مسیر runtime رفع شد؛ CI هدفمند PR #28 روی `c8eb406` موفق است.
7. **Completed & Tested:** سازگاری UI ورودهای قدیمی چندمنبعی با adapter در editor
   رفع و با مرورگر/API بررسی شد؛ termination/cleanup هدفمند XLS ده تست موفق دارد.
   حدود آزمون و تاریخچهٔ دو assertion ناموفق در checkpoint بالاست؛ تست امنیتی جامع نیست.
8. **TEST-02، رفع‌شده و تأییدشده:** علت Linux حفظ‌نشدن مجوز PGDATA بود (`0700 →
   0755`)، نه خرابی دادهٔ مصنوعی. root mode در هر دو مرحله حفظ/بررسی شد و انتظار
   stop پس از startup شکست‌خورده حذف شد. I/O ناهمگام ویندوز نیز موفق است؛ CI نهایی
   `39225452667` شامل backup روی `767183f` موفق شد. شکست اولیه و timeout ویندوز
   در گزارش/تاریخچه حفظ شده‌اند؛ این موارد نباید دوباره به‌عنوان کار حل‌نشده پیاده شوند.

## فایل‌های تغییرکرده در این مرحله

فهرست زیر تغییرات نسبت به مبناست؛ هستهٔ feature در `8c1869d` و fixture نهایی TEST-02
در `767183f` ثبت شده‌اند. پیش از ادامه،
وضعیت فایل‌های ثبت‌نشده با `git status --short` تطبیق داده شود.

- پردازش Import:
  `apps/api/src/modules/brand-imports/brand-file.ts`،
  `apps/api/src/modules/brand-imports/brand-imports.controller.ts`،
  `apps/api/src/modules/brand-imports/brand-imports.service.ts`،
  `apps/api/src/modules/brand-imports/legacy-xls.ts` (جدید)،
  `apps/api/src/modules/imports/spreadsheet.ts`،
  `apps/api/src/modules/imports/number-format.ts` (جدید).
- کاتالوگ و قرارداد: `apps/api/src/modules/catalog/catalog.service.ts`،
  `packages/contracts/src/brand-imports.ts`، `packages/domain/src/brand-import.ts`.
- وابستگی XLS: `apps/api/package.json` و `pnpm-lock.yaml`؛ نسخهٔ ثابت رسمی
  SheetJS CE 0.20.3 و integrity ثبت‌شده در lockfile.
- تست‌ها: `apps/api/test/integration/85-vehicles.test.ts`،
  `apps/api/test/integration/global-setup.ts` (اصلاح cleanup موقت)،
  `apps/api/test/integration/93-brand-import-integrity.test.ts` (جدید)،
  `apps/api/test/integration/94-brand-workbooks.test.ts` (جدید)،
  `apps/api/test/integration/95-brand-import-recovery.test.ts` (جدید)،
  `apps/api/test/unit/spreadsheet-reader.test.ts`،
  `apps/api/test/unit/brand-archive.test.ts` (جدید)،
  `apps/api/test/unit/brand-upload-cleanup.test.ts` (جدید)،
  `packages/domain/test/brand-import.test.ts`، `apps/web/e2e/unified-parts.spec.ts`،
  `.github/workflows/ci.yml`.
- کنترل کیفیت: `eslint.config.mjs`، استثنای مسیر خصوصی `.local-run/**` مطابق Git ignore.
- همین مرحلهٔ TEST-02: `apps/api/test/integration/60-backup-restore.test.ts`، مرحلهٔ
  مستقل backup در `.github/workflows/ci.yml`، `docs/BACKUP_RESTORE.md` و
  `docs/TEST_02_BACKUP_REPORT.md` (جدید)، همراه به‌روزرسانی audit/runbook/PROGRESS.
- پنل و ترجمه: `apps/web/src/components/admin/brand-imports.tsx`،
  `apps/web/messages/fa.json`، `apps/web/messages/en.json`.
- راهنما: `docs/PARTS_UNIFIED_PHASE4.md`، `docs/STAFF_GUIDE_PARTS.md`.
- ممیزی و عملیات (جدید): `docs/SOURCE_UPGRADE_AUDIT.md`، `docs/IMPORT_WORKBOOKS.md`،
  `docs/ADR_BRAND_WORKBOOK_IMPORT.md`، `docs/SOURCE_UPGRADE_RUNBOOK.md`.
- استمرار کار: `AGENTS.md` و `PROGRESS.md` ریشه در `e45515d` ثبت شده‌اند؛
  این فایل پس از checkpoint به‌روز شده است.
- تغییرات جانبی تولیدشده توسط تست/dev، پاک‌سازی‌شده پیش از commit:
  `apps/web/next-env.d.ts`، `docs/import/hedax-products-template.xlsx`،
  `docs/import/sample-import-with-errors.xlsx`، `docs/import/sample-row-errors.xlsx`.
  سه XLSX با مقایسهٔ XML تأیید و restore شدند؛ `next-env.d.ts` با build به نسخهٔ
  HEAD برگشت. این فایل‌ها در commit تغییر محصولی ندارند؛ سایر تغییرات بازگردانده نشدند.

## وابستگی خارجی و تصمیم مالک

- **Blocked External:** محیط و روش استقرار مستقل `preview.sourcebyhedax.ir` و
  جدایی دیتابیس/فایل‌های آن هنوز تأیید نشده؛ Preview مستقر نشده است. عدم موفقیت
  ابزار وب در بازکردن دامنه، اثبات خاموش‌بودن سایت نیست.
- **Requires Owner Decision:** هر deploy یا migration روی Production؛ ادغام در
  مسیر انتشار Production؛ فعال‌سازی سرویس پولی یا ارسال پیام واقعی.
- **Blocked External:** داده/API دارای مجوز VIN/Microcat و اعتبارنامهٔ providerهای
  واقعی تأیید نشده‌اند؛ نباید سازگاری خودرو یا پاسخ واقعی سرویس جعل شود.
- **Deferred Later:** قابلیت‌های اختیاری AI/RAG تا تکمیل یکپارچگی داده و مشخص‌شدن
  منبع معتبر/سرویس؛ بازطراحی گستردهٔ بی‌دلیل در این مرحله انجام نشود.

## قدم بعدی دقیق

1. گزارش نهایی TEST-02 و وضعیت PR در `d5b649f` ثبت/ارسال شده‌اند؛ کد نهایی `767183f` روی Windows و
   Linux تأیید شده است. TEST-02، IMP-07، نمونه و baseline کامل تکرار نشوند مگر دلیل تازه‌ای باشد.
2. پذیرش UI قدیمی و termination/cleanup هدفمند XLS نیز تکمیل شد؛ از تطبیق CI
   commit جدید و گزارش `docs/PR_28_RELEASE_READINESS.md` ادامه دهید، نه تکرار تست‌های محلی.
3. جدایی database/storage/queue و روش استقرار Preview تأیید و سپس پذیرش واقعی آن
   انجام شود. هنوز Preview مستقل مستقر/تأیید نشده و Production آماده اعلام نمی‌شود.
4. قبل از ادامه، SHA واقعی Git و نتیجهٔ CI همان SHA خوانده شود. کد و fixture تست‌شده
   با commit صرفاً مستنداتی بعدی اشتباه گرفته نشوند؛ کنترل موفق بی‌دلیل تکرار نشود.
5. PR #28 در حالت Draft و بدون Merge بماند؛ Merge و هر تغییر Production نیازمند
   تأیید صریح مالک هستند. داده/کلید واقعی یا فایل نمونهٔ خصوصی وارد Git نشود.

## تاریخچهٔ مراحل

- 2026-10-19، پس از checkpoint TEST-02: UI ورود قدیمی چندمنبعی در editor موجود
  اصلاح شد؛ ده unit برای XLS و cleanup واقعی، یک API قدیمی و سه browser مرتبط
  موفق شدند. دو assertion اولیهٔ نادرست اصلاح و فقط همان دو تست تکرار شدند؛
  lint/typecheck و diff check موفق. گزارش آمادگی جدید و audit/workbook/runbook
  هماهنگ شدند. DNS محلی Preview نام را پیدا نکرد و جداسازی هنوز تأیید نشده است.
  تست‌های تکمیل‌شدهٔ TEST-02، baseline و خواندن نمونه دستی تکرار نشدند؛ هیچ Merge
  یا تغییر Production/Preview انجام نشد.

- 2026-10-18: بررسی repo/Git، به‌روزرسانی مبنا، ایجاد شاخهٔ feature و baseline موفق.
- 2026-10-18: اصلاحات Import/Undo/ZIP/Excel/fitment و تست‌های رگرسیون نوشته شدند؛
  واحد/typecheck/lint/مرورگر موفق؛ شکست teardown تست یکپارچه به‌عنوان مورد باز ثبت شد.
- 2026-10-18 18:25 +03:30: ایجاد `PROGRESS.md` و دستور دائمی در `AGENTS.md` طبق
  درخواست مالک؛ کار قبلی حفظ شده، Production تغییر نکرده است.
- 2026-10-18 18:29 +03:30: متن UTF-8 دو فایل، تطبیق فهرست تغییرات با Git و
  `git diff --check` بررسی شد؛ موفق. فقط دو فایل استمرار کار در `e45515d` commit شدند.
- 2026-10-18 18:30 +03:30: اصلاح harness پاک‌سازی PostgreSQL موقت؛ تکرار هدفمند
  سه suite با ۲۴ تست و exit 0 موفق. فرادادهٔ ZIP واقعی و شکست parser فعلی بررسی و
  شکاف پشتیبانی XLS/ZIP حاوی workbook به‌عنوان قدم بعدی ثبت شد.
- 2026-10-18: typecheck API، lint تغییر harness و بررسی whitespace موفق؛
  نقطهٔ ادامه به تحلیل محتوای workbookهای واقعی منتقل شد. هیچ تست یا سرور موقتی
  از اجرای مجدد این مرحله در حال اجرا نیست؛ محیط توسعهٔ موجود دست‌نخورده است.
- 2026-10-18: reader XLS/ZIP، نگاشت هر شیت و انتخاب سرستون پیاده شد؛ ۱۷ تست
  هدفمند، ۱۸ تست یکپارچه، API build و typecheck موفق؛ کل نمونه خوانده شد. اجرای
  lint و مرورگر جدید به‌علت عدم تکمیل بررسی خودکار مجوز (سقف مصرف) انجام نشد.
- 2026-10-19: شروع از همین نقطه؛ تطبیق Git و به‌روزکردن نتایج عقب‌افتادهٔ گزارش.
- 2026-10-19: دو فرمان lint/مرورگر دوباره پیش از اجرا با خطای ظرفیت مدلِ بررسی
  خودکار مجوز متوقف شدند. مالک ادامهٔ بازبینی/مستندسازی را انتخاب کرد؛ محدودیت دور زده نشد.
- 2026-10-19: IMP-07 از بازبینی کد ثبت شد؛ گزارش ممیزی، بررسی نمونه، ADR و runbook
  تهیه و راهنماهای قدیمی اصلاح شدند. هیچ رفتار اجرایی برنامه در این مرحله تغییر نکرد؛
  تست‌های موفق تکرار نشدند، commit/push/deploy جدید انجام نشد.
- 2026-10-19 08:35 +03:30: کنترل پیوندها و متن مستندات، whitespace و وضعیت Git
  موفق بود. نقطهٔ ادامه، اصلاح و آزمون IMP-07 پس از ازسرگیری پیاده‌سازی است؛
  محدودیت اجرای lint/مرورگر و انتخاب فعلی مالک برای کار مستنداتی همچنان ثبت شده‌اند.
- 2026-10-19: با درخواست جدید ادامه، مسیر مجوز دوباره پذیرفته شد. IMP-07 اصلاح و
  تست شد: اجرای اولیهٔ پنج سناریو موفق؛ پس از اضافه‌کردن دو حالت تغییر منبع، چهار
  suite با ۲۵ تست موفق و exit 0. خطای lint اسکریپت‌های خصوصی رفع شد؛ lint/typecheck،
  دو تست مرورگر و build کامل موفق. تصویر موبایل بررسی شد؛ هیچ انتشار یا نوشتن روی
  سایت اصلی انجام نشد. اصل نمونه دوباره خوانده یا وارد DB نشد.
- 2026-10-19 09:19 +03:30: پس از مقایسهٔ محتوای ZIP/XML، سه artifact تولیدشده
  بازگردانده و ۲۶ فایل پیاده‌سازی/تست در `8c1869d` commit شدند. GitHub دسترسی
  لازم را تأیید کرد؛ PR تکراری وجود ندارد. اسناد و checkpoint مرحلهٔ بعدِ ثبت هستند.
- 2026-10-19 09:21 +03:30: اسناد در `d125e31` ثبت؛ feature با مقصد صریح push و
  Draft PR #28 ایجاد شد. upstream feature اصلاح شد. workflow موجود فقط CI است؛
  اجرای راه‌دور شروع شد. main، Preview و Production ادغام/منتشر/تغییر داده نشدند.
- 2026-10-19 09:23 +03:30: لینک PR و وضعیت upstream در commit صرفاً مستنداتی
  `96ac35a` ثبت و push شد. Git پیش از ثبت این نتیجه تمیز و با origin هماهنگ بود؛
  بررسی CI باید به آخرین HEAD متصل باشد. Draft هنوز باز و ادغام‌نشده است.
- 2026-10-19 09:40 +03:30: CI روی `96ac35a` شکست خورد: literal `--` در Linux
  موجب اجرای کل suite و آشکارشدن timeout مستقل backup شد. فرمان هدفمند به exec
  Vitest تغییر کرد؛ شکست backup تحت TEST-02 باز و مانع انتشار ثبت شد. هیچ تستی
  skip یا timeoutی برای سبزکردن job افزایش داده نشد.
- 2026-10-19: فرمان portable با list تأیید و در `c8eb406` ثبت/ارسال شد؛ CI جدید
  `39208551626` شروع شد. توضیح Draft PR با failure واقعی و TEST-02 هماهنگ شد.
- 2026-10-19 09:46 +03:30: CI روی `c8eb406` کاملاً موفق شد: ۲۲۸ unit، ۳۳
  Import/کاتالوگ و ۱۲ CMS؛ lint/typecheck/web build موفق. شکست قبلی backup مستقل
  باقی است؛ انتشار آماده اعلام نشد. Git با origin همگام بود؛ فقط ثبت نهایی این
  فایل پس از commit محلی مانده است. Production و Preview تغییر نکرده‌اند.
- 2026-10-19: شروع از TEST-02؛ Git/PR تطبیق داده شد. در `f24630e` خطای PostgreSQL
  قابل مشاهده و آزمون backup وارد CI شد. run `39216172835` خطای مجوز `0755` را
  بازتولید کرد. در `00e9e98` مجوز کپی/restore و چرخهٔ cleanup اصلاح شد؛ Linux سبز شد.
- 2026-10-19: اجرای Windows با fixture همگام timeout داشت؛ I/O در `767183f`
  ناهمگام شد. تکرار هدفمند ویندوز موفق (exit 0، کل 115.03 ثانیه) و CI نهایی Linux
  `39225452667` موفق شد. TEST-02 بسته شد؛ تست‌ها حذف و timeoutها افزایش داده نشدند.
  یک read وضعیت CI به deadline بررسی خودکار مجوز خورد؛ retry همان مسیر موفق شد و
  این خطای ابزار با شکست آزمون اشتباه گرفته نشد.
- 2026-10-19 12:23 +03:30: گزارش نهایی و checkpoint فعلی فشرده/هماهنگ شدند؛
  شواهد شکست و تاریخچهٔ قبلی حفظ شدند. PR برای بررسی کد آماده، ولی تا پذیرش‌های
  باقی‌مانده، تأیید Preview و مجوز مالک برای Production آماده/مجاز اعلام نشد.
- 2026-10-19 12:35 +03:30: گزارش نهایی در `d5b649f` ثبت/ارسال، شرح Draft PR به‌روز
  و CI همان HEAD (`39226951115`) موفق شد. ۱۴ پیوند محلی و UTF-8/whitespace پنج سند
  بررسی شدند؛ موفق. همهٔ کد و گزارش‌ها در PR هستند؛ فقط این ثبت نهایی نتیجه در
  PROGRESS محلی باقی است. TEST-02 تکمیل شد؛ هیچ Merge یا تغییر Production انجام نشد.

- **Completed & Tested — final owner approval / merge 2026-10-20 09:18 Asia/Tehran:** مالک صریحاً انتشار و commit/push نهایی را تأیید کرد. PR #28 با guard روی SHA 883df80 ادغام شد؛ merge commit 0c6e94cc30a92065b563402f7b3415c876b8ab0b و tree آن دقیقاً برابر candidate است. تأیید شامل تست مصنوعی و Undo همان job است. rollout اکنون قدم جاری است؛ restore مخرب مجاز نشده است.
# Checkpoint — 2026-10-20 18:05 Asia/Tehran — assistant operational paths

**Branch / inspected HEAD:** `codex/assistant-phase-one` / `b16770c` (working tree intentionally uncommitted; no push, merge, deploy or Production change).

## Completed & Tested

- Added a server-side assistant module with `POST /assistant/messages`, an adapter boundary (`mock`/`openai`), server-only model configuration, fixed system prompt, at most 8 history entries, 3–30s timeout, output-token cap, daily request cap, per-IP/user rate limiting and generic provider errors that do not expose keys or upstream bodies.
- Free-form widget messages now use the server endpoint. The old deterministic free-form `assistantRespond` path is no longer called; the four explicit navigation shortcuts remain local by design.
- The message service calls the existing `CatalogService.list` for every query. Product cards are built directly from `ProductCard` fields (name/number, registered fitment, availability, price currency and sales unit). Model prose is not used as the source of those facts. No order/customer tool is exposed, so the assistant cannot read personal data; any future personal tool must require an authenticated actor and ownership check.
- Added `POST /assistant/transcribe` (5 MB in-memory limit; raw recording is not stored) and `POST /assistant/speech`. The browser requests microphone access only after the mic button, shows the returned transcript by placing it in the input, sends it through the same message endpoint, plays speech, exposes stop-through-mute and mute controls, and drives `data-speaking` from actual audio play/end events. Permission/provider failure leaves text available.
- Admin now reads `GET /admin/assistant/status` and shows provider, model, configured/live state, timeout, output cap and daily cap. Secrets are never returned.
- Safe placeholder names were added to `.env.example`: `ASSISTANT_AI_PROVIDER`, `ASSISTANT_LIVE_CALLS_ENABLED`, `OPENAI_API_KEY`, text/STT/TTS models and voice, timeout/output/daily limits. The key stays server-side and is never a `NEXT_PUBLIC_*` value.
- Isolated verification passed: `pnpm --filter @hedax/api test -- test/unit/assistant.service.test.ts` → 2/2; API and web typechecks passed; API build passed; web production build passed after the running dev server released/recreated its generated `.next/dev` state. The first sandbox test attempt failed only with Windows `spawn EPERM`; the first build attempt failed on the SWC cache permission and a locked stale generated route file, then passed outside that restriction.
- Live local HTTP evidence against the disposable stack: message returned provider `mock`, model `synthetic-test-provider`, 4 CatalogService-backed products for «لنت ترمز»; speech returned `audio/wav`, 4044 bytes. Browser accessibility confirms the HEDAX guide is visible on `http://localhost:3191/fa`. Admin is open at `/fa/admin/assistant`.

## Implemented Pending Verification / Blocked External

- **Text AI:** code complete and mock-tested; a real OpenAI response has not been called. Required: set `OPENAI_API_KEY` in the server secret environment, choose/confirm model values, set `ASSISTANT_AI_PROVIDER=openai`, and explicitly approve the paid-call budget before setting `ASSISTANT_LIVE_CALLS_ENABLED=true`.
- **Catalog:** implemented and locally exercised with synthetic seeded catalog data. Production catalog data was not accessed. Exact fitment is shown only when registered; no VIN/Microcat source exists.
- **Voice:** browser capture/control and server STT/TTS paths are implemented; mock transcription and a synthetic WAV were tested. Real Persian/English recognition, audible TTS quality and the full user-voice → text → real model → real speech chain remain blocked on the same credential and paid-call approval. A physical microphone permission/recording was not automated.
- The daily live-call counter is process-local. It is a hard local safeguard, not a shared multi-instance monetary ledger; production enablement needs an owner-approved provider budget and, for multiple API replicas, a shared Redis usage counter.

## Local review state and exact next action

- Launcher session is running and must remain open: web `http://localhost:3191`, API `127.0.0.1:4191`, disposable PostgreSQL `127.0.0.1:55439`, inline queue, temporary storage, provider `mock`, live calls false. It loads no repository `.env` and uses no Production database/Redis/storage. The local assistant is enabled only in the disposable database.
- Local account: `owner@hedax.test`; use the already supplied local-only password and enroll local MFA. Do not record that password here.
- Next owner decision: approve a maximum paid-call budget/request allowance and place `OPENAI_API_KEY` in the local server environment/secret manager (never chat/Git). Then run exactly one bounded real text call and one bounded STT/TTS round trip, record provider request IDs/status without content or secrets, and keep Production disabled.

# Checkpoint — 2026-10-20 18:32 Asia/Tehran — Arvan text release in progress

**Authorization:** Owner explicitly authorized assistant-only commit/push/PR/merge/Production deployment. DNS changes, destructive data operations, credit purchase and uncapped paid use remain unauthorized.

- **Completed & Tested:** Official Arvan AIaaS documentation confirms `POST [Endpoint]/chat/completions`, `Authorization: apikey …`, OpenAI Chat Completions-shaped messages, stateless requests and endpoint rate limits. Responses API compatibility is not assumed.
- **Account evidence:** authenticated read-only panel inspection shows no existing AI gateway (`اولین درگاه AI خود را بسازید`). No duplicate was created. Marketplace confirms `GPT-5.6-Luna` (Beta), 1M context, input 624,000 IRR/1M tokens and output 3,744,000 IRR/1M tokens. Account balance was observed but is intentionally not copied here.
- **Completed & Tested:** provider implementation now has a distinct `arvan` adapter using the exact endpoint and `apikey` header. Controlled server-side CatalogService grounding remains in place; no SQL/arbitrary HTTP/write tool is exposed. Mock contract tests cover CatalogService facts and the Arvan request/response shape: 2/2 passed. Contracts/API/web typechecks passed.
- **Completed & Tested:** customer microphone, mute and speech controls were removed from the widget for this text-only release. Voice endpoints were removed from the assistant controller/service. Voice is Deferred Later.
- **Implemented Pending Verification:** persisted settings now contain bounded bilingual System Prompt, max output tokens and daily request limit with safe defaults; the public settings projection removes the private AI block. Assistant messages fail closed when the saved assistant switch is off. Admin UI editing controls for the new AI fields and shared/multi-instance cost reservation are not yet complete.
- **Blocked External / owner action required once:** create the first free AI gateway named `source-hedax-assistant` in Arvan, attach exact model `GPT-5.6-Luna`, use the free Arvan domain and set endpoint rate limit; create a least-privilege machine-user/API key for this gateway. Put the key only in the Production server secret environment as `ARVAN_AI_API_KEY`; put the exact non-secret gateway base URL ending in `/v1` as `ARVAN_AI_ENDPOINT`. Do not paste the key in chat. Suggested approval: test cap 50,000 IRR total; public daily cap 300,000 IRR and 100 requests/day initially. No gateway, key, credit purchase or paid request has been made yet.
- **Deployment state:** not committed, pushed, merged or deployed. Production assistant remains unchanged/off. A real Arvan response and post-deploy domain test have not occurred, so release must not be claimed.
- **Exact next step after owner action:** finish admin AI controls and shared budget reservation tests; run one bounded real Arvan call with synthetic/non-sensitive data; run targeted integration/browser/build; review diff; commit/push/PR/CI/merge; verify backup/rollback and deploy via the existing production method; enable via admin and execute post-deploy checks on both locales.

# Checkpoint — 2026-10-20 18:50 Asia/Tehran — hard AI budgets

**Branch / HEAD:** `codex/assistant-phase-one` / `b16770c`; working tree remains uncommitted. No Production, DNS, merge, push or paid provider call occurred.

- **Owner authorization:** hard isolated-test allowance 50,000 IRR; hard public allowance 300,000 IRR per UTC day and 100 requests per UTC day. Assistant-only publication authorization remains active.
- **Completed & Tested:** replaced process-local request/concurrency checks with one atomic Redis reservation before every Arvan call. It gates cost, daily requests and concurrent calls together. Production fails closed when Redis is unavailable. Failed provider calls release concurrency but retain the conservative cost reservation; reported token usage refunds only unused reservation.
- **Evidence:** API typecheck passed. Targeted isolated unit suites passed outside the Windows sandbox after the sandbox-only `spawn EPERM`: 2 files, 5 tests. Tests separately cover cost rejection, request rejection, concurrency rejection, usage settlement, CatalogService grounding and Arvan URL/header contract. No paid request was made.
- **Completed:** public settings integration expectation now verifies that the AI prompt/config block is absent. Provider failure UI now supplies an honest contact path. Secure Arvan server-only setup and current text architecture are documented in `docs/HEDAX_ASSISTANT_PHASE1.md`; `.env.example` contains approved numeric caps and secret placeholders only.
- **Implemented Pending Verification:** run the changed integration and browser suites, lint/typechecks/build, inspect generated changes, then commit/push and obtain green CI.
- **Blocked External:** authenticated Arvan account still had no gateway at last read-only check. Owner must create `source-hedax-assistant`, attach `GPT-5.6-Luna`, create a least-privilege gateway credential, and enter `ARVAN_AI_ENDPOINT` plus `ARVAN_AI_API_KEY` only in the server's mode-600 `.env`. Never send the key in chat. A real test and Production deploy cannot be truthfully completed before that secure setup.

# Checkpoint — 2026-10-21 Asia/Tehran — local release candidate verified

**Branch / HEAD before commit:** `codex/assistant-phase-one` / `b16770c`. No Production, DNS, merge, push or paid provider call occurred in this checkpoint.

- **Completed & Tested:** API integration for persisted settings/public projection passed after rebuilding the compiled API: 1 file, 4 tests. The public endpoint omits the private AI prompt/config block.
- **Completed & Tested:** assistant browser suite completed with 6/7 on the first run; the sole failure was an over-broad test selector that also matched the English fixture word `grounded`. The selector was limited to the exact part number and the failed scenario passed on targeted retry. Effective result: all 7 scenarios passed, including grounded product cards, no voice controls, bilingual flow, admin save behavior and responsive/accessible launcher checks.
- **Completed & Tested:** workspace lint, web typecheck and Next.js production build passed. After removing unused deferred-voice env/schema/client helpers and correcting the admin description, API and web typechecks plus targeted lint passed again. Voice remains Deferred Later and has no customer control or active endpoint/config surface.
- **Completed & Tested:** `git diff --check` passed and no real Arvan key was found. Only empty placeholders and an explicit fake test value exist. Generated `apps/web/next-env.d.ts` is no longer dirty.
- **Implemented Pending Verification:** commit/push this assistant release candidate, create or update its PR, wait for CI, then run exactly one real bounded Arvan call after the secure gateway credential is installed.
- **Blocked External:** Arvan gateway/credential setup is still required. Create `source-hedax-assistant`, attach exact model `GPT-5.6-Luna`, and enter `ARVAN_AI_ENDPOINT` and `ARVAN_AI_API_KEY` only in the server mode-600 `.env`; do not send or print the key. Until then, a real provider response, deployment and live-domain validation cannot be claimed.
- **Commit:** local release candidate committed as `aa74097` (`feat: add grounded Arvan text assistant`) after normalizing the two new contracts files to LF and passing the staged whitespace check. Push/PR/CI remain the next step.
- **Completed & Tested — remote:** checkpoint commit `452108f` and feature commit were pushed to `origin/codex/assistant-phase-one`. Draft PR #29 (`feat: add grounded Arvan text assistant`) was created against `main`; its head matched `452108f`, GitHub reported it mergeable, and CI run `39545727533` / job `119043353089` passed in 2m43s. The PR intentionally remains Draft and unmerged until the real bounded Arvan test succeeds.
- **Completed & Tested — current PR head:** after pushing the CI checkpoint, PR #29 head is `ae89b0c`; final CI run `39546036491` / job `119044308029` passed in 2m25s. Local Git differs from the remote only by this new PROGRESS result so the next session can continue without repeating checks. Do not create another documentation-only CI loop before the real-provider milestone.

# Checkpoint — 2026-10-21 Asia/Tehran — Arvan credential setup in progress

- **Completed & Tested — panel read:** authenticated Arvan AIaaS gateway list was opened at the real account. It contains no gateway and explicitly shows “اولین درگاه AI خود را بسازید”; therefore `source-hedax-assistant` does not exist and no duplicate was created. Account balance and server identifiers were observed only to operate the owner-authorized account and are not copied here.
- **Implemented Pending Owner UI Step:** the panel exposes “ساخت درگاه AI”, but Windows accessibility returned no clickable geometry and screenshot capture timed out. No create form was submitted. The owner must click that visible button once; automation can resume on the resulting form and fill only non-sensitive values before the final create action.
- **Completed & Tested — server preparation:** the first SSH probe used default identities and was rejected; retry with the existing dedicated `source_arvan_ed25519` identity succeeded. Production is `/opt/sourcebyhedax` on branch `deploy/pr28-20261020` at `0c6e94c`; its existing `.env` is a regular root-owned mode-600 file. No content was printed. A root-owned mode-700 helper was installed at `/root/set-hedax-assistant-env.sh` and passed remote `bash -n`. It prompts for the endpoint and a hidden API key, atomically replaces only assistant-related variables, preserves all unrelated `.env` lines, enforces the approved 50,000/300,000 IRR and 100-request limits, and does not restart services.
- **Security boundary:** creation of a persistent API key requires action-time confirmation. Stop immediately before the final key-creation button, then let the owner confirm and copy the one-time secret directly into a hidden server prompt. Never expose it through chat, command arguments, logs, Git, browser storage or API responses.

# Checkpoint — 2026-10-21 Asia/Tehran — Arvan form handoff

- **Completed — gateway:** the owner created the first free/default Arvan AI gateway. Its current panel identifier/name is `gateway-4cjht`; the non-secret API base endpoint is `https://api.arvancloudai.ir/v1`. The exact `GPT-5.6-Luna` model is active and showed zero input/output usage when inspected. The gateway still needs renaming to `source-hedax-assistant`; no duplicate gateway should be created.
- **Pending owner-assisted UI:** the owner reports that the next Arvan form is open, but the active authenticated Chrome tab is not exposed to the current computer-control session (only internal localhost tabs are visible, and opening Chrome programmatically is unavailable). The next safe step is to share/mention that exact Arvan tab so its form and least-privilege permission choices can be inspected. Do not guess scopes.
- **Security / deployment state:** no API key has been created or disclosed, no paid provider request has run, the Production `.env` remains unchanged, PR #29 remains Draft/unmerged, and Production has not been redeployed.

# Checkpoint — 2026-10-21 Asia/Tehran — manual Arvan handoff and server readiness

- **Owner decision:** this environment has no Chrome/tab-sharing control. Arvan panel steps are therefore owner-operated; future work must not assume browser automation. Provide exact manual instructions and require the owner to report the visible permission labels instead of guessing IAM scopes.
- **Completed & Tested — config path:** `infra/docker-compose.yml` passes all assistant variables from the root `.env` into API/worker. The API schema requires HTTPS, a key, explicit live-call enablement and a positive hard daily budget for Arvan. Production budget reservation uses Redis and fails closed if Redis is unavailable.
- **Completed & Tested — secure helper/server:** local and installed `/root/set-hedax-assistant-env.sh` SHA-256 values match; installed ownership/mode is `root:root`/`700`. Production remains at `0c6e94c`. Existing API, web, PostgreSQL, Redis and ClamAV containers are healthy; worker and Caddy are running. No `.env` value was read or printed and no service was restarted.
- **Completed & Tested — PR:** PR #29 remains Draft, mergeable, unmerged at `ae89b0c`; CI `39546036491` is successful. No repeat CI run is needed before the real-provider milestone.
- **Blocked External — exact next handoff:** owner must rename the existing gateway to `source-hedax-assistant`, create or reuse one dedicated machine user, and inspect the permission selector. Select only an AI/AIaaS gateway invocation/use permission scoped to the existing gateway if the panel offers that resource scope; do not grant account/billing/IAM/DNS/compute/storage administration. If the exact labels differ or only broad roles are offered, stop and report the visible labels. Do not create the key until action-time confirmation is recorded. After creation, copy the one-time key directly into the hidden server helper prompt; never place it in chat.

### VS Code redesign handoff — 2026-10-22 08:25 Asia/Tehran
- Completed & Tested: owner accepted the continuous v2 film direction (آره بهتر شد) and requested consolidated VS Code implementation instructions. Supersedes the previous pending-film decision and rejected v1 montage; homepage design approval and explicit release approval remain required.
- Completed & Tested: created Desktop/SOURCE-VSCODE-HANDOFF-2026-10-22 with revised comprehensive master prompt, Persian context/status, START_HERE, v2 MP4, official logo, review sheet, v2 EDL and SHA256 manifest; ZIP is 4,651,924 bytes. Video copy exactly matches original SHA256 ff813139a6b06f5a4c1f81d597ca0b939ce1bb06e0a93d06b0eb76a9f5ed59b2. Eight required files present.
- Completed & Tested: read accessible relevant material from 11 related chats, original local builder/assistant/enterprise brief attachments, both PROGRESS files and local audit/assistant/preview documentation. Historical unavailable content and unverified remote deployment facts explicitly distinguished. No secrets or private datasets copied.
- Local state: primary codex/assistant-live-copy HEAD 60d72e359cdb755872941eb685114edeff2d8984; premium feature/source-premium-experience HEAD bac3865010dbf876cf99cff7e0a92bae3dadbe76, recorded base 6b1c9dd. Existing primary modifications preserved. This turn changes continuity documentation and creates the external handoff only; no code change, commit, push, server action or deployment.
- Next: VS Code Agent reads MASTER_PROMPT_SOURCE.md and CONTEXT_AND_STATUS.fa.md; reconcile current main/PR30 and both checkouts, reuse premium worktree, implement real cinematic homepage/builder preview with v2, then obtain homepage design approval before broad storefront changes. Opening handoff files is not evidence the target Agent has received or started the task.
