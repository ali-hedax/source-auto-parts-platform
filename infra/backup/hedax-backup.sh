#!/usr/bin/env bash
# HEDAX scheduled, encrypted backups (docs/BACKUP_RESTORE.md §2).
#
#   hedax-backup schedule   back up every BACKUP_INTERVAL_MINUTES (default 1440 = daily)
#   hedax-backup once       one backup, then exit (manual run or a host cron job)
#   hedax-backup check      exit 0 when the last successful backup is recent (health check)
#
# Each run writes BACKUP_DIR/<UTC stamp>/:
#   hedax.dump.age    pg_dump (custom format) of the database, encrypted with age
#   storage.tgz.age   the uploaded files of the local storage driver, encrypted the same way
#   manifest.txt      what was backed up: sizes, SHA-256 of the encrypted files, tool versions
# Only age PUBLIC keys (BACKUP_AGE_RECIPIENTS) are on the server: it can write backups
# but cannot read them. The private key stays with the owner, off the server.
# A run is written to a hidden ".<stamp>.partial" folder and renamed only when complete,
# so a folder named by its stamp is always a whole backup.
set -euo pipefail
umask 077

BACKUP_DIR=${BACKUP_DIR:-/backups}
STORAGE_DIR=${STORAGE_DIR:-/data/storage}
KEEP=${BACKUP_KEEP:-14}
INTERVAL_MINUTES=${BACKUP_INTERVAL_MINUTES:-1440}
MAX_AGE_MINUTES=${BACKUP_MAX_AGE_MINUTES:-$((INTERVAL_MINUTES + 120))}
LAST_SUCCESS=$BACKUP_DIR/last-success
export PGHOST=${PGHOST:-postgres} PGUSER=${PGUSER:-hedax} PGDATABASE=${PGDATABASE:-hedax}

log() { printf '%s hedax-backup: %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

positive_int() { [[ $2 =~ ^[1-9][0-9]*$ ]] || fail "$1 must be a positive whole number"; }
positive_int BACKUP_KEEP "$KEEP"
positive_int BACKUP_INTERVAL_MINUTES "$INTERVAL_MINUTES"
positive_int BACKUP_MAX_AGE_MINUTES "$MAX_AGE_MINUTES"

age_args() {
  AGE_ARGS=()
  local key
  RECIPIENTS=${BACKUP_AGE_RECIPIENTS:-}
  for key in ${RECIPIENTS//,/ }; do
    [[ $key =~ ^age1[02-9ac-hj-np-z]{58}$ ]] || fail "BACKUP_AGE_RECIPIENTS: not an age public key (age1…)"
    AGE_ARGS+=(-r "$key")
  done
  ((${#AGE_ARGS[@]})) || fail "BACKUP_AGE_RECIPIENTS is empty: set the owner's age public key"
}

once() {
  age_args
  mkdir -p "$BACKUP_DIR"
  # Leftovers of an interrupted run (container stopped mid-backup).
  find "$BACKUP_DIR" -maxdepth 1 -name '.*.partial' -type d -mmin +60 -exec rm -rf {} +

  # Globals on purpose: the EXIT trap removes the unfinished folder when any step fails.
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  # Two manual runs within one second would share a name: wait for a fresh one.
  while [[ -e $BACKUP_DIR/$stamp || -e $BACKUP_DIR/.$stamp.partial ]]; do
    sleep 1
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
  done
  tmp=$BACKUP_DIR/.$stamp.partial
  mkdir "$tmp"
  trap 'rm -rf "$tmp"' EXIT
  log "backup $stamp started"

  # Database: consistent snapshot without stopping the site, streamed straight into age.
  pg_dump --format=custom --no-owner | age "${AGE_ARGS[@]}" -o "$tmp/hedax.dump.age"
  [[ -s $tmp/hedax.dump.age ]] || fail "empty database backup"

  # Files: GNU tar exits 1 when a file changed while it was read (an upload at that moment);
  # that is still a usable archive. 2 or more is a real failure.
  local storage_note="not mounted (S3 storage: use the bucket's versioning)"
  if [[ -d $STORAGE_DIR ]]; then
    set +e
    tar --create --gzip --file=- --directory="$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" | age "${AGE_ARGS[@]}" -o "$tmp/storage.tgz.age"
    local status=("${PIPESTATUS[@]}")
    set -e
    ((status[0] <= 1 && status[1] == 0)) || fail "file archive failed (tar ${status[0]}, age ${status[1]})"
    storage_note="$(find "$STORAGE_DIR" -type f | wc -l) files"
  fi

  {
    echo "stamp: $stamp"
    echo "database: $PGDATABASE on $PGHOST ($(pg_dump --version))"
    echo "storage: $storage_note"
    echo "encrypted with: age $(age --version) for $((${#AGE_ARGS[@]} / 2)) public key(s): ${RECIPIENTS//,/ }"
    echo "sha256 and bytes:"
    (cd "$tmp" && for f in *.age; do printf '  %s  %s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$(stat -c %s "$f")" "$f"; done)
  } > "$tmp/manifest.txt"

  mv -T "$tmp" "$BACKUP_DIR/$stamp"
  trap - EXIT
  printf '%s\n' "$stamp" > "$LAST_SUCCESS"
  log "backup $stamp done: $(du -sh "$BACKUP_DIR/$stamp" | cut -f1)"

  # Keep the newest BACKUP_KEEP complete backups here; the off-server copy has its own retention.
  local old
  while IFS= read -r old; do
    rm -rf -- "$old"
    log "removed old backup $(basename "$old")"
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}Z' | sort | head -n -"$KEEP")
}

check() {
  [[ -f $LAST_SUCCESS ]] || { echo "no successful backup yet"; exit 1; }
  local age_min=$((($(date +%s) - $(stat -c %Y "$LAST_SUCCESS")) / 60))
  ((age_min <= MAX_AGE_MINUTES)) || { echo "last successful backup $(cat "$LAST_SUCCESS") is $age_min minutes old"; exit 1; }
  echo "last successful backup $(cat "$LAST_SUCCESS"), $age_min minutes ago"
}

# Sleeps in the background so a stop request (SIGTERM) ends the container at once.
pause() { sleep "$1" & wait $!; }

schedule() {
  trap 'log "stopping"; exit 0' TERM INT
  age_args
  mkdir -p "$BACKUP_DIR"
  log "every $INTERVAL_MINUTES minutes, keeping $KEEP backups in $BACKUP_DIR"
  # After a restart, wait for the rest of the interval instead of backing up again at once.
  if [[ -f $LAST_SUCCESS ]]; then
    local since=$(($(date +%s) - $(stat -c %Y "$LAST_SUCCESS")))
    ((since < INTERVAL_MINUTES * 60)) && pause $((INTERVAL_MINUTES * 60 - since))
  else
    pause "${BACKUP_FIRST_DELAY_SECONDS:-60}"
  fi
  while true; do
    # A separate process, so that `set -e` stops a failing run without stopping the schedule.
    if "$0" once; then
      pause $((INTERVAL_MINUTES * 60))
    else
      log "backup FAILED; next try in 60 minutes"
      pause 3600
    fi
  done
}

case "${1:-schedule}" in
  schedule) schedule ;;
  once) once ;;
  check) check ;;
  *) echo "usage: hedax-backup [schedule|once|check]" >&2; exit 2 ;;
esac
