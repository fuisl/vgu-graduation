#!/usr/bin/env bash
# Archive restore drill (#77) against the local docker-compose stack, without
# touching the dev data: builds a scratch source (a migrated scratch database with
# seeded rows, scratch buckets with objects), exports it with archive-export.sh,
# restores it with archive-restore.sh --migrate into a second scratch database
# and bucket prefix, compares the row contents, checks the restore refuses a
# non-empty target, then removes every scratch database, bucket and file.
#
# usage: scripts/archive-drill.sh        (KEEP=1 keeps the scratch data for a look)
# Needs `pnpm services:up` running and `pnpm install` done.
# shellcheck source=scripts/archive-lib.sh
. "$(dirname "$0")/archive-lib.sh"

stamp="$(date -u +%Y%m%d%H%M%S)"
src_db="grad26_drill_src_$stamp"
dst_db="grad26_drill_dst_$stamp"
src_prefix="drill-src-$stamp-"
dst_prefix="drill-dst-$stamp-"
out="$(mktemp -d)"
db_url_base="${DATABASE_URL:?DATABASE_URL must be set (.env)}"
db_url_base="${db_url_base%/*}"

drop_buckets() {
  local prefix="$1" bucket key
  for bucket in $ARCHIVE_BUCKETS; do
    s3_bucket_exists "$prefix$bucket" || continue
    while IFS= read -r key; do
      [ -n "$key" ] && s3 -o /dev/null -X DELETE "$S3_ENDPOINT/$prefix$bucket/$(urlencode_path "$key")"
    done < <(s3_list "$prefix$bucket")
    garage bucket delete --yes "$prefix$bucket" >/dev/null
  done
}

cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    log "KEEP=1: left $src_db, $dst_db, buckets ${src_prefix}*, ${dst_prefix}* and $out"
    return
  fi
  log "cleaning up scratch databases, buckets and files"
  for d in "$src_db" "$dst_db"; do psql_at postgres -c "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE)" >/dev/null || true; done
  drop_buckets "$src_prefix" || true
  drop_buckets "$dst_prefix" || true
  rm -rf "$out"
}
trap cleanup EXIT

# 1. Scratch source: migrated schema, seeded rows.
log "creating scratch source database $src_db"
psql_at postgres -c "CREATE DATABASE \"$src_db\"" >/dev/null
(cd "$repo_root" && DATABASE_URL="$db_url_base/$src_db" pnpm --silent --filter @grad/api db:migrate) >/dev/null
psql_at "$src_db" >/dev/null <<'SQL'
INSERT INTO guests (id, name, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Drill Guest A', 'a@drill.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'Drill Guest B', NULL);
INSERT INTO invitations (id, guest_id, token_hash, max_plus_ones) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', repeat('a', 64), 2),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', repeat('b', 64), 0);
INSERT INTO rsvp (invitation_id, attending, plus_ones_count, notes) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, 1, 'Drill note with ünïcödé and a tab	inside');
INSERT INTO photos (public_id, invitation_id, original_key, content_type, size_bytes, width, height, processing_status, moderation_status) VALUES
  ('drillpub0001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c0000000-0000-4000-8000-000000000001', 'image/jpeg', 2048, 640, 480, 'ready', 'visible'),
  ('drillpub0002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c0000000-0000-4000-8000-000000000002', 'image/png', 4096, 800, 600, 'ready', 'hidden'),
  ('drillpub0003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c0000000-0000-4000-8000-000000000003', 'image/webp', 1024, NULL, NULL, 'pending', 'visible');
INSERT INTO wishes (invitation_id, author_name, body) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Drill A', 'Congratulations!'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Drill B', 'Chúc mừng tốt nghiệp');
INSERT INTO audit (actor, action, target_type, target_id) VALUES ('drill', 'photo.hide', 'photo', 'drillpub0002');
SQL

# 2. Scratch source buckets: originals for every photo, derivatives for the ready ones.
for bucket in $ARCHIVE_BUCKETS; do
  garage bucket create "$src_prefix$bucket" >/dev/null
  garage bucket allow --read --write "$src_prefix$bucket" --key "$S3_KEY_ID" >/dev/null
done
put() { # bucket key size content-type
  local f; f="$(mktemp)"
  head -c "$3" /dev/urandom > "$f"
  s3 -o /dev/null -X PUT -H "content-type: $4" -T "$f" "$S3_ENDPOINT/$1/$2"
  rm -f "$f"
}
put "${src_prefix}grad-originals" c0000000-0000-4000-8000-000000000001 2048 image/jpeg
put "${src_prefix}grad-originals" c0000000-0000-4000-8000-000000000002 4096 image/png
put "${src_prefix}grad-originals" c0000000-0000-4000-8000-000000000003 1024 image/webp
for p in drillpub0001 drillpub0002; do
  put "${src_prefix}grad-derivatives" "$p-thumb.jpg" 300 image/jpeg
  put "${src_prefix}grad-derivatives" "$p-display.jpg" 900 image/jpeg
done
log "scratch source ready: 3 photos, 2 wishes, 7 objects"

# 3. Export, then restore into the second scratch database and prefix.
archive="$("$repo_root/scripts/archive-export.sh" --db "$src_db" --bucket-prefix "$src_prefix" --out "$out")"
"$repo_root/scripts/archive-restore.sh" --db "$dst_db" --bucket-prefix "$dst_prefix" --migrate "$archive"

# 4. Row contents, not just counts, match for the tables that hold guest content.
for table in guests invitations rsvp photos wishes audit event_config; do
  q="SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) FROM $table t"
  [ "$(psql_at "$src_db" -c "$q")" = "$(psql_at "$dst_db" -c "$q")" ] || die "table $table differs after restore"
done
log "row contents match for guests, invitations, rsvp, photos, wishes, audit, event_config"

# 5. The guard: a second restore into the now non-empty target must be refused.
if "$repo_root/scripts/archive-restore.sh" --db "$dst_db" --bucket-prefix "${dst_prefix}again-" "$archive" 2>/dev/null; then
  die "restore into a non-empty database was not refused"
fi
log "a restore into a non-empty database is refused"
log "drill passed"
