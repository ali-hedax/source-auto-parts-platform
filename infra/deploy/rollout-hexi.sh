#!/usr/bin/env bash
# Production rollout of release 5d18d21 (PR #51 Hexi messages + PR #50/#52 navy storefront).
# Run as root on the Production server:   bash rollout-hexi.sh
#
# What it does, in order (stops at the first problem; nothing is deleted):
#   1. finds the current compose wrapper (hedax-compose-current) and its image overlay
#   2. checks free disk space (needs >= 6 GB on /)
#   3. saves the current wrapper/overlay and a PostgreSQL backup for rollback
#   4. pulls the 4 new images from GHCR, one at a time
#   5. writes a new overlay + wrapper next to the old ones (old ones untouched)
#   6. runs the additive migration 20261027150000_assistant_conversations (tools image)
#   7. switches api / worker / web, waits for health, and checks the public site
#   8. on any failure after step 7 started: switches back to the previous images automatically
set -euo pipefail

TAG="5d18d21cde04-production"
REG="ghcr.io/ali-hedax"
STAMP="$(date +%Y%m%d-%H%M%S)"
DIR="/opt/hedax-release-candidates/release-5d18d21-${STAMP}"
SITE="https://sourcebyhedax.ir"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\n!!! %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run as root"

say "1/8 current wrapper"
W="$(command -v hedax-compose-current || true)"
[ -n "$W" ] && [ -f "$W" ] || die "hedax-compose-current not found in PATH; nothing changed"
echo "wrapper: $W"
mapfile -t OVERLAYS < <(grep -oE '/[^ "'\'']*images[^ "'\'']*\.ya?ml' "$W" | sort -u)
[ "${#OVERLAYS[@]}" = 1 ] || { cat "$W"; die "expected exactly one image overlay in the wrapper, found ${#OVERLAYS[@]}; nothing changed"; }
OLD_IMAGES="${OVERLAYS[0]}"
[ -f "$OLD_IMAGES" ] || die "overlay $OLD_IMAGES missing; nothing changed"
echo "current overlay: $OLD_IMAGES"
cat "$OLD_IMAGES"

say "2/8 disk space"
df -h /
FREE_KB="$(df --output=avail / | tail -1 | tr -d ' ')"
[ "$FREE_KB" -ge $((6 * 1024 * 1024)) ] || die "less than 6 GB free on /; nothing changed (free some space first)"

say "3/8 rollback copies and database backup -> $DIR"
mkdir -p "$DIR/rollback"
chmod 700 "$DIR"
cp -a "$W" "$DIR/rollback/wrapper"
cp -a "$OLD_IMAGES" "$DIR/rollback/images.before.yml"
"$W" exec -T postgres pg_dump -U hedax -Fc hedax > "$DIR/rollback/database-before.dump"
[ -s "$DIR/rollback/database-before.dump" ] || die "database backup is empty; nothing changed"
echo "backup tables: $("$W" exec -T postgres pg_restore --list < "$DIR/rollback/database-before.dump" | grep -c 'TABLE DATA')"
ls -lh "$DIR/rollback/database-before.dump"

say "4/8 pulling images ${TAG}"
for t in api worker tools web; do
  nice -n 10 ionice -c3 docker pull "${REG}/source-${t}:${TAG}"
  rev="$(docker image inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${REG}/source-${t}:${TAG}" 2>/dev/null || true)"
  echo "  ${t}: revision ${rev:-unknown}"
done

say "5/8 new overlay and wrapper"
{
  echo "services:"
  for t in api worker web tools; do
    printf '  %s:\n    image: %s/source-%s:%s\n    pull_policy: never\n' "$t" "$REG" "$t" "$TAG"
  done
} > "$DIR/images.yml"
sed "s#${OLD_IMAGES}#${DIR}/images.yml#g" "$W" > "$DIR/wrapper"
chmod 755 "$DIR/wrapper"
grep -q "$DIR/images.yml" "$DIR/wrapper" || die "new wrapper does not reference the new overlay; nothing switched"
"$DIR/wrapper" config --images | sort -u

# The API readiness endpoint is internal (not routed by Caddy), so ask it from inside the container.
ready() { "$DIR/wrapper" exec -T api node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; }

rollback() {
  printf '\n!!! problem detected - switching back to the previous images\n' >&2
  cp -a "$DIR/rollback/wrapper" "$W"
  "$W" up -d --no-deps api worker web || true
  printf '!!! rolled back. Database backup: %s/rollback/database-before.dump\n' "$DIR" >&2
  exit 1
}

say "6/8 database migration (additive: two new tables)"
"$DIR/wrapper" --profile tools run --rm tools

say "7/8 switching api, worker, web"
trap rollback ERR
"$DIR/wrapper" up -d --no-deps api worker web
ok=0
for i in $(seq 1 30); do
  sleep 5
  if ready && curl -fsS -o /dev/null --max-time 15 "${SITE}/fa"; then ok=1; break; fi
  echo "  waiting for health ($i/30)..."
done
[ "$ok" = 1 ] || false
cp -a "$DIR/wrapper" "$W"
trap - ERR

say "8/8 done"
"$W" ps api worker web
"$W" exec -T api node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>r.text()).then(console.log)"
echo "Release ${TAG} is live. Rollback files: ${DIR}/rollback"
