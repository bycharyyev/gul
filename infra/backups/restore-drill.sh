#!/usr/bin/env bash
# Restore drill for encrypted database backups. Run on the PC that holds the private key:
#   bash infra/backups/restore-drill.sh            # check the newest backup, then delete the plain copy
#   bash infra/backups/restore-drill.sh --keep     # same, but keep the decrypted dump for a real restore
#
# Fetches the newest encrypted dump through the "Fetch latest backup" workflow, decrypts it with
# the private key, and checks it is a complete PostgreSQL dump with real data in it. The
# decrypted file holds every customer's phone number and order history, so without --keep it is
# deleted as soon as the check ends.
set -euo pipefail

REPO="bycharyyev/gul"
KEY_DIR="${BACKUP_KEY_DIR:-$HOME/.gulyaly/backup-encryption}"
PRIVATE="$KEY_DIR/backup-private-key.pem"
CERT="$KEY_DIR/backup-recipient.pem"
KEEP=0; [ "${1:-}" = "--keep" ] && KEEP=1

[ -r "$PRIVATE" ] && [ -r "$CERT" ] || { echo "private key or certificate not found in $KEY_DIR" >&2; exit 1; }

WORK=$(mktemp -d)
cleanup() { [ "$KEEP" = 1 ] || rm -rf "$WORK"; }
trap cleanup EXIT

before=$(gh run list --repo "$REPO" --workflow fetch-latest-backup.yml --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
gh workflow run fetch-latest-backup.yml --repo "$REPO"
run=""
for _ in $(seq 1 30); do
  sleep 4
  run=$(gh run list --repo "$REPO" --workflow fetch-latest-backup.yml --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
  [ -n "$run" ] && [ "$run" != "$before" ] && break
done
[ -n "$run" ] && [ "$run" != "$before" ] || { echo "the fetch run did not start" >&2; exit 1; }
gh run watch "$run" --repo "$REPO" --exit-status >/dev/null
gh run download "$run" --repo "$REPO" -n latest-backup -D "$WORK"

ENC=$(ls "$WORK"/*.cms | head -1)
echo "backup: $(basename "$ENC") ($(wc -c < "$ENC") bytes encrypted)"

openssl cms -decrypt -binary -inform DER -in "$ENC" -inkey "$PRIVATE" -recip "$CERT" -out "$WORK/dump.sql.gz" \
  || { echo "DECRYPTION FAILED -- wrong key or damaged file" >&2; exit 1; }
gunzip -t "$WORK/dump.sql.gz" || { echo "decrypted, but the gzip inside is damaged" >&2; exit 1; }
gunzip -c "$WORK/dump.sql.gz" > "$WORK/dump.sql"

head -5 "$WORK/dump.sql" | grep -q 'PostgreSQL database dump' || { echo "not a pg_dump file" >&2; exit 1; }
tail -5 "$WORK/dump.sql" | grep -q 'PostgreSQL database dump complete' || { echo "dump is cut off before its end" >&2; exit 1; }

rows() { # rows <table>: data lines between the table's COPY header and its terminating \.
  # The end marker travels through ENVIRON and the header is matched with index(), because awk
  # implementations disagree about backslashes in -v values, strings and dynamic regexes.
  END_MARK='\.' awk -v t="$1" '
    index($0, "COPY public.\"" t "\" ") == 1 { on = 1; next }
    on && $0 == ENVIRON["END_MARK"] { on = 0; next }
    on { n++ }
    END { print n + 0 }' "$WORK/dump.sql"
}
echo "decrypted: $(wc -c < "$WORK/dump.sql") bytes of SQL, dump complete"
for t in User Order Service ContentPage; do
  printf '  %-12s %s rows\n' "$t" "$(rows "$t")"
done
[ "$(rows User)" -gt 0 ] || { echo "the dump has no users -- this is not the production database" >&2; exit 1; }

echo
echo "restore drill passed: the newest backup decrypts and is a complete database dump"
if [ "$KEEP" = 1 ]; then
  echo "decrypted dump kept at: $WORK/dump.sql   (contains customer data -- delete it when done)"
fi
