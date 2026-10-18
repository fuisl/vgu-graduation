# apps/printer container image (grad-printer), built from the monorepo root:
#   docker build -f apps/printer/Dockerfile .
#
# Same shape as apps/api/Dockerfile: `turbo prune` keeps only @grad/printer and
# the workspace packages it uses (@grad/contract). The runtime adds the CUPS
# *client* only (`lp`); cupsd and the printer driver run on the venue host, and
# the venue overlay mounts the host's CUPS socket (CUPS_SERVER).

FROM node:24-alpine AS base
# Keep in sync with the root package.json's turbo devDependency.
RUN corepack enable && npm install -g turbo@2.11.2
WORKDIR /app

# 1. Prune the monorepo down to @grad/printer's own subgraph.
FROM base AS pruner
COPY . .
RUN turbo prune @grad/printer --docker && \
  # Root devDependencies (turbo, husky, secretlint) are repo-local tooling; strip
  # them and the husky "prepare" script, as apps/api/Dockerfile does.
  node -e " \
    const fs = require('node:fs'); \
    const p = JSON.parse(fs.readFileSync('out/json/package.json')); \
    p.devDependencies = {}; \
    delete p.scripts.prepare; \
    fs.writeFileSync('out/json/package.json', JSON.stringify(p)); \
  "

# 2. Install pruned deps, then build. --no-frozen-lockfile only because the step
# above edited package.json; the lockfile still pins every remaining version.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --no-frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @grad/printer... build
RUN pnpm --filter=@grad/printer deploy --prod --legacy --ignore-scripts /app/deploy/printer

# 3. Minimal runtime image with the CUPS client.
FROM node:24-alpine AS runner
ENV NODE_ENV=production \
  STATE_DIR=/var/lib/grad-printer
RUN apk add --no-cache cups-client && \
  addgroup --system --gid 1001 grad && adduser --system --uid 1001 --ingroup grad grad && \
  mkdir -p /var/lib/grad-printer && chown grad:grad /var/lib/grad-printer
WORKDIR /app

COPY --from=installer --chown=grad:grad /app/deploy/printer/node_modules ./node_modules
COPY --from=installer --chown=grad:grad /app/deploy/printer/package.json ./package.json
COPY --from=installer --chown=grad:grad /app/apps/printer/dist ./dist

USER grad
# Journal and spool (at-most-once printing across restarts); mount a volume here.
VOLUME ["/var/lib/grad-printer"]
CMD ["node", "dist/index.js"]
