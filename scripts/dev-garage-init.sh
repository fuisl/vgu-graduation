#!/usr/bin/env bash
# Creates the three buckets the API expects in the local Garage and grants the dev
# key access, then proves S3 works with a signed round trip. Idempotent: safe to
# run on every `pnpm services:up`. Local development only; the homelab cluster is
# bootstrapped from the infrastructure repository (ADR-008).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a
KEY_ID="${S3_ACCESS_KEY_ID:-GK000000000000000000000001}"
SECRET="${S3_SECRET_ACCESS_KEY:-0000000000000000000000000000000000000000000000000000000000000002}"
ENDPOINT="${S3_ENDPOINT:-http://localhost:${GARAGE_S3_PORT:-3900}}"
REGION="${S3_REGION:-garage}"

garage() { docker compose exec -T -e RUST_LOG=warn garage /garage "$@"; }

# name -> whether the API key may use it (grad-backups is for Postgres backups only,
# with its own key in production, so the API key is deliberately not granted there).
for bucket in grad-originals grad-derivatives grad-backups; do
  if ! garage bucket info "$bucket" >/dev/null 2>&1; then
    garage bucket create "$bucket" >/dev/null
    echo "created bucket $bucket"
  fi
done
for bucket in grad-originals grad-derivatives; do
  garage bucket allow --read --write "$bucket" --key "$KEY_ID" >/dev/null
done

# Signed round trip through the S3 API, the same path the API will use.
sign=(--silent --show-error --fail --user "$KEY_ID:$SECRET" --aws-sigv4 "aws:amz:$REGION:s3")
probe="dev-init-probe-$$"
echo "ok" | curl "${sign[@]}" -X PUT --data-binary @- "$ENDPOINT/grad-originals/$probe" >/dev/null
[ "$(curl "${sign[@]}" "$ENDPOINT/grad-originals/$probe")" = "ok" ]
curl "${sign[@]}" -X DELETE "$ENDPOINT/grad-originals/$probe" >/dev/null
echo "Garage ready: $ENDPOINT (region $REGION, buckets grad-originals, grad-derivatives, grad-backups)"
