#!/usr/bin/env bash
# Decides how much CI has to run for a change, to save compute.
#
# usage: scripts/ci-scope.sh <base-sha>     (prints key=value lines)
#
#   mode=full      the change touches something Turborepo can't attribute to a
#                  package (workflow, turbo/pnpm/node config, root package.json),
#                  or there is no usable base: run every task.
#   mode=affected  run only packages changed since <base-sha>, plus dependents
#                  (`turbo --affected`).
#   docs=true      files under docs/ changed. apps/docs renders them at build time
#                  (Markdoc, Mermaid), so its build must run even though turbo sees
#                  no package change.
set -euo pipefail

base="${1:-}"
if [ -z "$base" ] || [ "$base" = "0000000000000000000000000000000000000000" ] \
  || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "mode=full"
  echo "docs=true"
  exit 0
fi

changed="$(git diff --name-only "${base}...HEAD" 2>/dev/null || git diff --name-only "$base" HEAD)"

mode=affected
if echo "$changed" | grep -qE '^(\.github/workflows/ci\.yml|scripts/ci-scope\.sh|turbo\.json|package\.json|pnpm-workspace\.yaml|\.npmrc|\.nvmrc|tsconfig[^/]*\.json)$'; then
  mode=full
fi

docs=false
if echo "$changed" | grep -qE '^docs/'; then
  docs=true
fi

echo "mode=$mode"
echo "docs=$docs"
