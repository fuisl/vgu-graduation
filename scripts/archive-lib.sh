# shellcheck shell=bash
# Shared helpers for archive-export.sh and archive-restore.sh (#77). Sourced, not run.
# Procedure and privacy rules: docs/operations/archive.md.
#
# Postgres: every tool runs through ARCHIVE_PG_EXEC, a command prefix. The default
# reaches the docker-compose container by its fixed name, so it works from any
# checkout or worktree. Examples:
#   ARCHIVE_PG_EXEC="docker exec -i vgu-grad-postgres"                    (default)
#   ARCHIVE_PG_EXEC="kubectl -n grad exec -i grad-db-1 -c postgres --"   (the cluster; ARCHIVE_PG_USER=postgres)
#   ARCHIVE_PG_EXEC=""   pg_dump/psql on PATH, connection from PGHOST/PGPORT/PGPASSWORD
# Object storage: plain S3 over curl --aws-sigv4 (curl 7.75+), from the S3_* variables
# in .env. Bucket creation, when needed, uses the Garage CLI in ARCHIVE_GARAGE_CONTAINER.
#
# Output never includes object keys, row contents or credentials: only names of
# buckets and tables and counts.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$repo_root/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$repo_root/.env"
  set +a
fi

PG_USER="${ARCHIVE_PG_USER:-${POSTGRES_USER:-grad}}"
read -r -a PG_EXEC <<< "${ARCHIVE_PG_EXEC-docker exec -i vgu-grad-postgres}"
GARAGE_CONTAINER="${ARCHIVE_GARAGE_CONTAINER-vgu-grad-garage}"

S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:${GARAGE_S3_PORT:-3900}}"
S3_REGION="${S3_REGION:-garage}"
S3_KEY_ID="${S3_ACCESS_KEY_ID:-GK000000000000000000000001}"
S3_SECRET="${S3_SECRET_ACCESS_KEY:-0000000000000000000000000000000000000000000000000000000000000002}"

# The archive's two media buckets (data-and-storage.md §5.2). grad-backups is not
# archived: it holds Postgres backups, which the pg_dump in the archive replaces.
ARCHIVE_BUCKETS="${ARCHIVE_BUCKETS:-grad-originals grad-derivatives}"

log() { printf '[archive] %s\n' "$*" >&2; }
die() { printf '[archive] error: %s\n' "$*" >&2; exit 1; }

pg() { "${PG_EXEC[@]}" "$@"; }
psql_at() { local db="$1"; shift; pg psql -X -v ON_ERROR_STOP=1 -At -U "$PG_USER" -d "$db" "$@"; }

valid_db_name() { [[ "$1" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; }
valid_bucket_name() { [[ "$1" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; }

# Row count per table in the application schemas, "schema.table<TAB>count", sorted.
pg_counts() {
  psql_at "$1" -F $'\t' -c "
    SELECT table_schema || '.' || table_name,
           (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE' AND table_schema IN ('public', 'drizzle')
    ORDER BY 1"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

size_of() { wc -c < "$1" | tr -d ' '; }

# Percent-encodes an object key for the URL path; "/" stays a separator.
urlencode_path() {
  local LC_ALL=C s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_/-]) out+="$c" ;;
      *) out+="$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s' "$out"
}

xml_unescape() { sed -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&quot;/"/g' -e "s/&apos;/'/g" -e 's/&amp;/\&/g'; }

s3() {
  curl --silent --show-error --fail --user "$S3_KEY_ID:$S3_SECRET" --aws-sigv4 "aws:amz:$S3_REGION:s3" "$@"
}

# Every key in a bucket, one per line (ListObjectsV2, following continuation tokens).
s3_list() {
  local bucket="$1" token="" page
  while :; do
    if [ -n "$token" ]; then
      page="$(s3 -G --data-urlencode "list-type=2" --data-urlencode "continuation-token=$token" "$S3_ENDPOINT/$bucket")"
    else
      page="$(s3 -G --data-urlencode "list-type=2" "$S3_ENDPOINT/$bucket")"
    fi
    printf '%s' "$page" | grep -o '<Key>[^<]*</Key>' | sed -e 's/^<Key>//' -e 's#</Key>$##' | xml_unescape || true
    printf '%s' "$page" | grep -q '<IsTruncated>true</IsTruncated>' || break
    token="$(printf '%s' "$page" | grep -o '<NextContinuationToken>[^<]*</NextContinuationToken>' \
      | sed -e 's/^<NextContinuationToken>//' -e 's#</NextContinuationToken>$##' | xml_unescape)"
    [ -n "$token" ] || die "listing $bucket: truncated page without a continuation token"
  done
}

s3_bucket_exists() { s3 -o /dev/null -I "$S3_ENDPOINT/$1" 2>/dev/null; }

garage() { docker exec -e RUST_LOG=warn "$GARAGE_CONTAINER" /garage "$@"; }
