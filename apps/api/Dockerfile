# apps/api container image, built from the monorepo root.
# Build from the repo root: docker build -f apps/api/Dockerfile .
#
# Uses `turbo prune` to isolate only what @grad/api actually needs (its own
# source plus any workspace packages it depends on, e.g. a future
# packages/contract), so this image never depends on apps/web, docs, or the
# private asciify dependency.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# 1. Prune the monorepo down to @grad/api's own subgraph.
FROM base AS pruner
COPY . .
RUN npx turbo prune @grad/api --docker

# 2. Install pruned production + dev deps, then build.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @grad/api build
RUN pnpm --filter=@grad/api deploy --prod --legacy /app/deploy/api

# 3. Minimal runtime image.
FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 grad && adduser --system --uid 1001 grad

COPY --from=installer --chown=grad:grad /app/deploy/api/node_modules ./node_modules
COPY --from=installer --chown=grad:grad /app/deploy/api/package.json ./package.json
COPY --from=installer --chown=grad:grad /app/apps/api/dist ./dist

USER grad
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
