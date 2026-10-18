#!/usr/bin/env bash
# Restores a GRAD '26 archive made by archive-export.sh (#77) into a database and
# buckets, then verifies it: checksums of the archive, row counts per table, every
# object re-read and compared by SHA-256, every photo's original present.
# Procedure (re-hosting on a spare machine): docs/operations/archive.md.
#
# usage: scripts/archive-restore.sh --db NAME [--bucket-prefix PREFIX] [--migrate] ARCHIVE
#
#   ARCHIVE               an export directory, or a .tar.age file (needs ARCHIVE_AGE_IDENTITY)
#   --db NAME             target database; created if missing. Refused if it already
#                         has tables, so an existing database (e.g. the dev grad26 with
#                         data) is never overwritten. A fresh compose database is empty.
#   --bucket-prefix P     restore <bucket> into P<bucket> (scratch tests). Target buckets
#                         are created with the Garage CLI when missing, and refused when
#                         not empty.
#   --migrate             afterwards apply this checkout's newer migrations (pnpm db:migrate)
#
# Exit status is non-zero if anything does not match.
# shellcheck source=scripts/archive-lib.sh
. "$(dirname "$0")/archive-lib.sh"

db=""
prefix=""
migrate=false
archive=""
while [ $# -gt 0 ]; do
  case "$1" in
    --db) db="$2"; shift 2 ;;
    --bucket-prefix) prefix="$2"; shift 2 ;;
    --migrate) migrate=true; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    -*) die "unknown argument: $1" ;;
    *) archive="$1"; shift ;;
  esac
done
[ -n "$db" ] || die "--db is required (the target database)"
[ -n "$archive" ] || die "give the archive directory or .tar.age file"
valid_db_name "$db" || die "not a plain database name: $db"

umask 077
work=""
cleanup() { [ -z "$work" ] || rm -rf "$work"; }
trap cleanup EXIT

if [ -f "$archive" ] && [[ "$archive" == *.tar.age ]]; then
  [ -n "${ARCHIVE_AGE_IDENTITY:-}" ] || die "set ARCHIVE_AGE_IDENTITY to the age identity file to decrypt $archive"
  work="$(mktemp -d)"
  age -d -i "$ARCHIVE_AGE_IDENTITY" "$archive" | tar -C "$work" -xf -
  archive="$(find "$work" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi
[ -f "$archive/ARCHIVE.txt" ] && [ -f "$archive/db.dump" ] || die "$archive is not an archive directory"
grep -q '^format: grad26-archive/1$' "$archive/ARCHIVE.txt" || die "unknown archive format"

failures=0
fail() { printf '[archive] MISMATCH: %s\n' "$*" >&2; failures=$((failures + 1)); }

# 1. The archive itself is intact.
log "checking archive checksums"
while IFS= read -r line; do
  sum="${line%%  *}"; f="${line#*  }"
  [ "$(sha256_of "$archive/$f")" = "$sum" ] || fail "archive file $f is corrupt"
done < "$archive/SHA256SUMS"
[ "$failures" -eq 0 ] || die "the archive is damaged; not restoring"

# 2. Database: into a new or empty database only.
exists="$(psql_at postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")"
if [ "$exists" = "1" ]; then
  tables="$(psql_at "$db" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle')")"
  [ "$tables" = "0" ] || die "database '$db' already has tables; restore into a new or empty database"
else
  psql_at postgres -c "CREATE DATABASE \"$db\"" >/dev/null
  log "created database '$db'"
fi
log "restoring database into '$db'"
pg pg_restore -U "$PG_USER" --no-owner --no-privileges --exit-on-error -d "$db" < "$archive/db.dump"

restored_counts="$(pg_counts "$db")"
if [ "$restored_counts" = "$(cat "$archive/db-counts.tsv")" ]; then
  log "database: row counts match for $(wc -l < "$archive/db-counts.tsv" | tr -d ' ') tables"
else
  fail "row counts differ from the export"
  diff <(cat "$archive/db-counts.tsv") <(printf '%s\n' "$restored_counts") >&2 || true
fi

# 3. Buckets: create (Garage CLI) when missing, refuse non-empty ones, upload, re-read.
buckets="$(cut -f1 "$archive/objects.tsv" | sort -u)"
for bucket in $ARCHIVE_BUCKETS; do
  target="$prefix$bucket"
  valid_bucket_name "$target" || die "not a bucket name: $target"
  if ! s3_bucket_exists "$target"; then
    [ -n "$GARAGE_CONTAINER" ] || die "bucket $target does not exist; create it first (no ARCHIVE_GARAGE_CONTAINER)"
    garage bucket create "$target" >/dev/null
    garage bucket allow --read --write "$target" --key "$S3_KEY_ID" >/dev/null
    log "created bucket $target"
  fi
  [ -z "$(s3_list "$target" | head -1)" ] || die "bucket $target is not empty; restore into empty buckets"
done

for bucket in $buckets; do
  target="$prefix$bucket"
  count=0
  while IFS=$'\t' read -r b key size sum type; do
    [ "$b" = "$bucket" ] || continue
    url="$S3_ENDPOINT/$target/$(urlencode_path "$key")"
    s3 -o /dev/null -X PUT -H "content-type: $type" -T "$archive/buckets/$bucket/$key" "$url"
    check="$(mktemp)"
    s3 -o "$check" "$url"
    [ "$(sha256_of "$check")" = "$sum" ] && [ "$(size_of "$check")" = "$size" ] || fail "object in $target differs after upload"
    rm -f "$check"
    count=$((count + 1))
  done < "$archive/objects.tsv"
  log "bucket $target: $count objects uploaded and verified"
done

# 4. Cross-check: every photo row's original is in the archive's originals.
missing=0
while IFS= read -r key; do
  [ -n "$key" ] || continue
  grep -q "^grad-originals"$'\t'"$key"$'\t' "$archive/objects.tsv" || missing=$((missing + 1))
done < <(psql_at "$db" -c "SELECT original_key FROM photos")
if [ "$missing" -eq 0 ]; then
  log "every photo's original is present"
else
  fail "$missing photo rows have no original in the archive"
fi

if $migrate; then
  log "applying this checkout's migrations to '$db'"
  # The target database on the same server as DATABASE_URL (.env): swap the last path segment.
  # ARCHIVE_RESTORE_DATABASE_URL overrides it.
  base_url="${DATABASE_URL:?set DATABASE_URL (or ARCHIVE_RESTORE_DATABASE_URL) for --migrate}"
  restored_url="${ARCHIVE_RESTORE_DATABASE_URL:-${base_url%/*}/$db}"
  (cd "$repo_root" && DATABASE_URL="$restored_url" pnpm --silent --filter @grad/api db:migrate) || fail "migrations failed"
fi

if [ "$failures" -gt 0 ]; then
  die "restore finished with $failures mismatch(es)"
fi
log "restore verified: database '$db', buckets with prefix '${prefix}'"
