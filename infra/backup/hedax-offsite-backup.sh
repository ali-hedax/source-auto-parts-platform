#!/bin/bash
# Encrypted off-server backup (2026-11-15): database, uploaded files and the settings needed to bring
# the site back, encrypted with the owner's age PUBLIC key (the private key is not on this server),
# copied to the private Arvan bucket and checked there. Uses only images already on the host
# (--pull never): an image pull has frozen this host before.
set -euo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ts=$(date -u +%Y%m%dT%H%M%SZ)
dir=/root/hedax-backups/offsite
mkdir -p "$dir"
work=$(mktemp -d /root/hedax-backups/.work-XXXXXX)
trap 'rm -rf "$work"' EXIT

docker exec hedax-postgres-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$work/db.dump"
docker exec -i hedax-postgres-1 pg_restore --list < "$work/db.dump" > "$work/db.list"
grep -q 'TABLE DATA' "$work/db.list"
pg_image=$(docker inspect hedax-postgres-1 --format '{{.Image}}')
docker run --rm --pull never --network none -v hedax_storage:/data:ro -v "$work":/out "$pg_image" tar -C /data -czf /out/storage.tar.gz .
# Settings: secrets (.env), the compose command with its image pins, and the edge (Caddy) config.
tar --ignore-failed-read -C / -czf "$work/config.tar.gz" \
  opt/sourcebyhedax/.env opt/hedax-compose-current \
  opt/hedax-preview-edge.yml opt/hedax-preview-edge.Caddyfile \
  $(grep -o '/opt/hedax-release-candidates/[^ ]*' /opt/hedax-compose-current | sed 's#^/##')
(cd "$work" && sha256sum db.dump storage.tar.gz config.tar.gz > SHA256SUMS)
out="$dir/source-offsite-$ts.tar.age"
tar -C "$work" -cf - db.dump storage.tar.gz config.tar.gz SHA256SUMS | age -r "$(cat /root/hedax-backups/age-recipient.txt)" -o "$out.partial"
mv "$out.partial" "$out"
rclone copy "$out" arvan:sourcebyhedax-backups/source/offsite/
rclone check "$dir" arvan:sourcebyhedax-backups/source/offsite/ --one-way --include "$(basename "$out")"
echo "RESULT out=$out bytes=$(stat -c %s "$out") sha256=$(sha256sum "$out" | cut -d' ' -f1) db_sha256=$(sha256sum "$work/db.dump" | cut -d' ' -f1) tables=$(grep -c 'TABLE DATA' "$work/db.list")"
cat "$work/SHA256SUMS"
