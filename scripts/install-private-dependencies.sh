#!/usr/bin/env bash
set -euo pipefail

# Local development uses the developer's existing GitHub SSH access. Vercel
# rewrites GitHub SSH clone URLs to HTTPS for this install only, keeping the
# read-only token out of package.json and pnpm-lock.yaml.
if [[ -n "${GITHUB_READ_TOKEN:-}" ]]; then
  auth_base="https://x-access-token:${GITHUB_READ_TOKEN}@github.com/"

  cleanup_git_auth() {
    git config --global --unset-all "url.${auth_base}.insteadOf" >/dev/null 2>&1 || true
  }

  trap cleanup_git_auth EXIT
  git config --global --add "url.${auth_base}.insteadOf" "git@github.com:"
  git config --global --add "url.${auth_base}.insteadOf" "ssh://git@github.com/"
  git config --global --add "url.${auth_base}.insteadOf" "https://github.com/"
  git config --global --add "url.${auth_base}.insteadOf" "https://git@github.com/"
elif [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "GITHUB_READ_TOKEN is required to install the private asciify dependency for a Production deployment." >&2
  exit 1
fi

# asciify is an optionalDependency (github:semicolons-dev/asciify): without a
# token (Preview, or local installs without GitHub access) pnpm skips it and
# the build falls back to the stub in apps/web/vendor/asciify-stub, per
# docs/development/private-dependencies.md.
pnpm install --filter @grad/web... --frozen-lockfile
