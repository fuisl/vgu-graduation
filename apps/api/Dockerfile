# apps/api container image, built from the monorepo root.
# Build from the repo root: docker build -f apps/api/Dockerfile .
#
# Uses `turbo prune` to isolate only what @grad/api actually needs (its own
# source plus any workspace packages it depends on, e.g. a future
# packages/contract), so this image never depends on apps/web, apps/docs, or
# the private asciify dependency. Confirmed by inspecting `turbo prune`'s
# own output: out/full only ever contains apps/api. The homelab (this image)
# hosts the API/data/worker only, per ADR-001/ADR-006; apps/web stays on
# Vercel and is never part of this build.

FROM node:24-alpine AS base
# Installed once here (not `npx turbo` per build), so it's a cached layer:
# no network fetch of the turbo CLI on every build, only when this version
# changes. Keep in sync with the root package.json's turbo devDependency.
RUN corepack enable && npm install -g turbo@2.11.2
WORKDIR /app

# 1. Prune the monorepo down to @grad/api's own subgraph.
FROM base AS pruner
COPY . .
RUN turbo prune @grad/api --docker && \
  # `turbo prune` always keeps the root package.json as-is, including
  # devDependencies (turbo, husky, secretlint) that exist only for
  # repo-local tooling (pre-commit hooks, `turbo dev`) and are never used
  # at build or run time here. Left in, they roughly doubled the package
  # count `pnpm install` had to resolve and download below. Strip them,
  # and the "prepare" script that would try to run husky without them.
  node -e " \
    const fs = require('node:fs'); \
    const p = JSON.parse(fs.readFileSync('out/json/package.json')); \
    p.devDependencies = {}; \
    delete p.scripts.prepare; \
    fs.writeFileSync('out/json/package.json', JSON.stringify(p)); \
  "

# 2. Install pruned deps, then build.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
# Cache mount: the downloaded package store persists across builds even
# when the layers above it are invalidated (e.g. by an unrelated source
# change), so a lockfile-only change is the only thing that pays for a
# full re-download.
#
# --no-frozen-lockfile, not --frozen-lockfile: the pruner step above just
# stripped root devDependencies from package.json, so it no longer matches
# the (untouched) lockfile. The lockfile itself still pins exact versions
# for everything that's left, so this can't drift or re-resolve anything —
# it only skips installing the packages that were removed.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --no-frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
# `...` also builds workspace dependencies (@grad/contract compiles to dist/).
RUN pnpm --filter @grad/api... build
RUN pnpm --filter=@grad/api deploy --prod --legacy --ignore-scripts /app/deploy/api

# 3. Minimal runtime image.
FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 grad && adduser --system --uid 1001 grad

COPY --from=installer --chown=grad:grad /app/deploy/api/node_modules ./node_modules
COPY --from=installer --chown=grad:grad /app/deploy/api/package.json ./package.json
COPY --from=installer --chown=grad:grad /app/apps/api/dist ./dist
# SQL migrations applied by `node dist/migrate.js` (the API Deployment's init container).
COPY --from=installer --chown=grad:grad /app/apps/api/drizzle ./drizzle

USER grad
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
