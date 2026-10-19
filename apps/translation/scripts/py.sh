#!/usr/bin/env sh
# Runs the Python checks for turbo (`pnpm lint|typecheck|test|build`).
#
# usage: scripts/py.sh lint|typecheck|test|build|serve
#
# Needs uv (https://docs.astral.sh/uv/). Without it the task is skipped with a
# message instead of failing, so `pnpm lint`/`test`/`build` still pass on
# machines that only have Node. The dedicated `translation` CI job installs uv
# and sets REQUIRE_UV=1, so there a missing uv is an error, never a silent skip.
set -eu

task="${1:?usage: scripts/py.sh lint|typecheck|test|build}"
cd "$(dirname "$0")/.."

if ! command -v uv >/dev/null 2>&1; then
  if [ "${REQUIRE_UV:-}" = "1" ]; then
    echo "translation: uv is required for '$task' but was not found" >&2
    exit 1
  fi
  echo "translation: uv not found, skipping '$task' (install uv: https://docs.astral.sh/uv/; CI runs it in the translation job)"
  exit 0
fi

case "$task" in
  lint)
    uv run --frozen ruff check .
    uv run --frozen ruff format --check .
    ;;
  typecheck)
    uv run --frozen mypy
    ;;
  test)
    uv run --frozen pytest
    ;;
  serve)
    # Local dev: the mock pipeline on the port apps/api's .env.example points at.
    PORT="${PORT:-8100}" exec uv run --frozen grad-translation
    ;;
  build)
    uv build --wheel --out-dir dist
    ;;
  *)
    echo "unknown task: $task" >&2
    exit 2
    ;;
esac
