# Local development

## Everything lives here; the infra repo only distributes it

`apps/web`, `apps/api`, `apps/docs` and `packages/*` are all developed and reviewed in this repository. `fuisl/vgu-graduation-deployment` (ADR-008) holds no application source — only the Flux/Kustomize manifests that reference a built image tag. If you're writing web or API code, you're always in this repo; you never need to touch the infra repo to do that.

## Running everything at once

`pnpm dev` runs `turbo dev`, which starts `apps/web`, `apps/api` and `apps/docs` together. Turborepo's terminal UI (`"ui": "tui"` in `turbo.json`) splits this into one pane per app inside a single terminal window: switch panes with the arrow keys, `m` opens the task list, and each pane scrolls its own logs independently. If you'd rather see plain interleaved output (e.g. in a CI-like shell), pass `--ui=stream`.

To run just one app, `pnpm dev:web`, `pnpm dev:api` or `pnpm dev:docs`. Node 24 is required (see `.nvmrc` and `package.json`'s `engines` field); Node 22 is Maintenance LTS and Node 26 isn't LTS yet.

`apps/api` needs Postgres and S3-compatible storage. `pnpm services:up` starts both (Postgres and Garage) and creates the buckets; `pnpm services:down` stops them and `pnpm services:reset` wipes their volumes and starts fresh. For Postgres alone: `pnpm db:up` starts it via `docker-compose.yml` (seeded from `docker/postgres/init/`), `pnpm db:down` stops it, `pnpm db:logs` tails it. Copy `.env.example` to `.env` first.

`apps/web` calls the API through a thin BFF layer (`apps/web/lib/api`, §4.1): a `fetch` wrapper with the caching policy from that section's table, and API responses validated against `packages/contract` before use. Copy `apps/web/.env.example` to `apps/web/.env.local` (Next.js reads env files from the app directory, not the repo root) and point `API_ORIGIN` at a running `apps/api`.

## Object storage: Garage

`pnpm services:up` runs Garage v2.4.1, the same object store as the homelab (ADR-005), as a single node from `docker-compose.yml` and `docker/garage/garage.toml`. `scripts/dev-garage-init.sh` then creates the three buckets (`grad-originals`, `grad-derivatives`, `grad-backups`), grants the dev key read/write on the first two, and proves it works with a signed upload, download and delete. It is idempotent, so re-running `services:up` is safe.

The API reads it through the `S3_*` variables in `.env.example`: endpoint `http://localhost:3900`, region `garage`, path-style addressing. The dev credentials are throwaway constants, safe to commit only because they exist nowhere but your laptop. To poke at it: `docker compose exec garage /garage status` or `/garage bucket list`. Data lives in the `garage_meta` and `garage_data` volumes until `services:reset`.

**How this relates to the deployed Garage.** The API only ever sees an S3 endpoint, a region, credentials and bucket names, all from environment variables, so the same code runs against both. What differs is who provisions it:

| | Local (this repo) | Homelab (infrastructure repository, #49) |
| --- | --- | --- |
| Runs as | one Docker Compose container | StatefulSet from the vendored Helm chart on k3s |
| Layout | assigned automatically (`--single-node`) | assigned once by hand during bootstrap |
| Keys | fixed dev key from `.env` | `api-key` and `backup-key` imported from SOPS-encrypted secrets |
| Backups | none | nightly offsite mirror (ADR-005) |
| Exposure | `localhost:3900` | ClusterIP only, never public |

Nothing here is deployed and the infrastructure repository never reads this compose file. Keep the Garage version in `docker-compose.yml` the same as the one pinned in the cluster: `kubernetes-workloads.md` §7.6 still says v2.3.0 and should be bumped to v2.4.1 when #49 vendors the chart.

## API configuration

`apps/api` reads configuration from the environment only (`apps/api/src/config.ts`, validated with Zod; variables listed in `applications-and-repository.md` §4.3). Locally every variable has a safe default, so `.env` only needs overriding for what you change. With `NODE_ENV=production` the API refuses to start unless the S3, service-token and `ADMIN_SESSION_SECRET` variables are set, and the error names the missing variables, never their values.

CORS allows `PUBLIC_ORIGIN` and nothing else, so a web app on any other origin (for example a Vercel preview) must be listed there. `GET /metrics` serves Prometheus metrics; it is unauthenticated, so the Ingress must not route it publicly.

## Trying the API by hand with Bruno

[Bruno](https://www.usebruno.com) is a git-native API client — requests are plain-text `.bru` files, no cloud account. The collection lives in `dev/bruno/` (never runs in production, same spirit as `dev/Caddyfile`): open that folder in the Bruno app and select the "Local" environment.

It currently covers the three implemented invitations endpoints. Set the `invitationToken` variable (a Bruno *secret* var, never committed) after running "Create Invitation" — never paste a real token into a request body or a non-secret var, since invitation tokens are bearer credentials (AGENTS.md). As more `apps/api` modules land, extend this collection to match; once routes are wired through `@grad/contract` with OpenAPI generation, prefer importing that spec over hand-writing requests, so the collection can't drift from the contract.

## Testing cookie scoping locally (optional)

Production scopes the invitation cookie to `.grad26.fuisloy.dev` (ADR-003) so it reaches the API host but nothing else. `localhost:3000`/`localhost:4000` can't reproduce that, because they aren't the same site. `dev/Caddyfile` sets up a local-only stand-in:

```sh
brew install caddy   # once
caddy run --config dev/Caddyfile
```

This proxies `http://grad26.localhost` → `:3000` and `http://api.grad26.localhost` → `:4000`. `*.localhost` always resolves to `127.0.0.1` (RFC 6761) in every modern browser, so no `/etc/hosts` edit and no real DNS is involved — this never touches the `fuisloy.dev` zone. Set `PUBLIC_ORIGIN=http://grad26.localhost` and `COOKIE_DOMAIN=grad26.localhost` in `.env` to exercise the same scoping the real cookie will use once issued (#29). Skip this entirely if you don't need to test cookie behavior; the API and web app work fine talking to each other on plain `localhost`.

This is unrelated to Traefik, the actual cluster ingress (ADR-004, `docs/architecture/target/networking-and-setup.md`) — Caddy here never runs in production and has no equivalent in the infra repo.

## Pre-commit: secret scanning

`git commit` runs `secretlint` (via husky, `.husky/pre-commit`) over staged files, checking for AWS/GCP keys, private keys, GitHub/Slack/Stripe/npm tokens and similar (`.secretlintrc.json`, `@secretlint/secretlint-rule-preset-recommend`). It only scans what's staged and only blocks the commit if it finds something; it doesn't run lint or typecheck (those run in CI, see below). Installed automatically by `pnpm install` via the `prepare` script.

## CI and the API image

- **`.github/workflows/ci.yml`** — every PR and push to `main`: install, lint, typecheck, test, build, all via Turborepo with its own cache. `apps/web`'s `asciify` dependency is optional (`docs/development/private-dependencies.md`), so this needs no secret and is safe on PRs from forks.
- **`.github/workflows/docker-api.yml`** — builds `apps/api/Dockerfile` on every PR (build-only, catches a broken image early) and, on push to `main`, also pushes to Docker Hub as `fuisl/grad26-api:latest` and `fuisl/grad26-api:sha-<short>`. Only the push step (main only) uses the `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` repo secrets, so a fork PR never sees them.
- **The infra repo never runs this repo's CI.** Flux's image automation there (ADR-004, #47) watches `fuisl/grad26-api` on Docker Hub and bumps the deployed tag on its own; this repo's job ends at "pushed a tagged image."

`apps/api/Dockerfile` builds from the repo root (`docker build -f apps/api/Dockerfile .`) using `turbo prune @grad/api --docker` to isolate just that app's subgraph, then `pnpm deploy --prod --legacy` for a production-only `node_modules`, so the final image never carries `apps/web`, `apps/docs`, dev dependencies, or unrelated workspace packages.
