#!/usr/bin/env bash
# Exports the GRAD '26 archive (#77): a pg_dump of the database plus every object
# in the media buckets, with checksums and row counts so a restore can be verified.
# Read-only against the source. Procedure: docs/operations/archive.md.
#
# usage: scripts/archive-export.sh [--db NAME] [--out DIR] [--bucket-prefix PREFIX]
#
#   --db NAME             source database (default: POSTGRES_DB from .env, grad26)
#   --out DIR             parent directory (default: ARCHIVE_OUT or ~/grad26-archives);
#                         keep it outside the repository: the archive holds guest data
#   --bucket-prefix P     read buckets P<bucket> instead of <bucket> (scratch tests)
#
# ARCHIVE_AGE_RECIPIENT=age1...  also packs the result into <name>.tar.age with age
# and deletes the plaintext directory. Do this for anything that leaves the machine.
# Other settings (ARCHIVE_PG_EXEC, ARCHIVE_BUCKETS, S3_*): see scripts/archive-lib.sh.
#
# Result: <out>/grad26-archive-<UTC timestamp>/
#   ARCHIVE.txt     format version, source, app commit, latest migration
#   db.dump         pg_dump custom format (pg_restore)
#   db-counts.tsv   rows per table at export time
#   objects.tsv     bucket, key, size, sha256, content type for every object
#   buckets/<bucket>/<key>
#   SHA256SUMS      of every file above
# shellcheck source=scripts/archive-lib.sh
. "$(dirname "$0")/archive-lib.sh"

db="${POSTGRES_DB:-grad26}"
out="${ARCHIVE_OUT:-$HOME/grad26-archives}"
prefix=""
while [ $# -gt 0 ]; do
  case "$1" in
    --db) db="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --bucket-prefix) prefix="$2"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
valid_db_name "$db" || die "not a plain database name: $db"

umask 077
mkdir -p "$out"
out="$(cd "$out" && pwd)"
case "$out/" in
  "$repo_root"/*) die "--out is inside the repository; the archive holds guest data, put it elsewhere" ;;
esac

name="grad26-archive-$(date -u +%Y%m%dT%H%M%SZ)"
dir="$out/$name"
mkdir -p "$dir/buckets"
log "exporting database '$db' and buckets [${ARCHIVE_BUCKETS}] (prefix '${prefix}') to $dir"

# 1. Database. A custom-format dump restores into any database name with pg_restore.
pg pg_dump -U "$PG_USER" --format=custom --no-owner --no-privileges "$db" > "$dir/db.dump"
pg_counts "$db" > "$dir/db-counts.tsv"
[ -s "$dir/db-counts.tsv" ] || die "database '$db' has no application tables; wrong --db?"
log "database: $(wc -l < "$dir/db-counts.tsv" | tr -d ' ') tables, $(size_of "$dir/db.dump") bytes dumped"

# 2. Objects, with size, checksum and content type for verification and re-upload.
: > "$dir/objects.tsv"
for bucket in $ARCHIVE_BUCKETS; do
  source_bucket="$prefix$bucket"
  valid_bucket_name "$source_bucket" || die "not a bucket name: $source_bucket"
  s3_bucket_exists "$source_bucket" || die "bucket $source_bucket is not reachable at $S3_ENDPOINT"
  mkdir -p "$dir/buckets/$bucket"
  count=0
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    case "$key" in *$'\t'*|../*|*/../*|/*) die "refusing an unsafe object key in $source_bucket" ;; esac
    file="$dir/buckets/$bucket/$key"
    mkdir -p "$(dirname "$file")"
    headers="$(mktemp)"
    s3 -D "$headers" -o "$file" "$S3_ENDPOINT/$source_bucket/$(urlencode_path "$key")"
    type="$(tr -d '\r' < "$headers" | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tail -1)"
    rm -f "$headers"
    printf '%s\t%s\t%s\t%s\t%s\n' "$bucket" "$key" "$(size_of "$file")" "$(sha256_of "$file")" "${type:-application/octet-stream}" >> "$dir/objects.tsv"
    count=$((count + 1))
  done < <(s3_list "$source_bucket")
  log "bucket $bucket: $count objects"
done

# 3. Provenance: which code can read this dump (its migrations must be a superset).
latest_migration="$(grep -o '"tag": *"[^"]*"' "$repo_root/apps/api/drizzle/meta/_journal.json" | tail -1 | sed 's/.*"\([^"]*\)"$/\1/')"
{
  echo "format: grad26-archive/1"
  echo "created_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source_database: $db"
  echo "source_bucket_prefix: ${prefix}"
  echo "buckets: ${ARCHIVE_BUCKETS}"
  echo "app_commit: $(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "latest_migration_in_checkout: ${latest_migration:-unknown}"
  echo "postgres: $(psql_at "$db" -c 'SHOW server_version')"
  echo "contains_personal_data: yes (guests, RSVPs, photos, wishes); see docs/operations/archive.md"
} > "$dir/ARCHIVE.txt"

sums="$(mktemp)"
(cd "$dir" && find . -type f | LC_ALL=C sort | while IFS= read -r f; do
  printf '%s  %s\n' "$(sha256_of "$f")" "${f#./}"
done) > "$sums"
mv "$sums" "$dir/SHA256SUMS"

if [ -n "${ARCHIVE_AGE_RECIPIENT:-}" ]; then
  command -v age >/dev/null 2>&1 || die "ARCHIVE_AGE_RECIPIENT is set but age is not installed"
  tar -C "$out" -cf - "$name" | age -r "$ARCHIVE_AGE_RECIPIENT" > "$out/$name.tar.age"
  rm -rf "$dir"
  log "encrypted archive: $out/$name.tar.age"
  echo "$out/$name.tar.age"
else
  log "WARNING: plaintext archive with guest data; encrypt it (ARCHIVE_AGE_RECIPIENT) before it leaves this machine"
  echo "$dir"
fi
