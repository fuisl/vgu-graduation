# Local development

## Everything lives here; the infra repo only distributes it

`apps/web`, `apps/api`, `apps/docs` and `packages/*` are all developed and reviewed in this repository. `fuisl/vgu-graduation-deployment` (ADR-008) holds no application source — only the Flux/Kustomize manifests that reference a built image tag. If you're writing web or API code, you're always in this repo; you never need to touch the infra repo to do that.

## Running everything at once

`pnpm dev` runs `turbo dev`, which starts `apps/web`, `apps/api` and `apps/docs` together. Turborepo's terminal UI (`"ui": "tui"` in `turbo.json`) splits this into one pane per app inside a single terminal window: switch panes with the arrow keys, `m` opens the task list, and each pane scrolls its own logs independently. If you'd rather see plain interleaved output (e.g. in a CI-like shell), pass `--ui=stream`.

To run just one app, `pnpm dev:web`, `pnpm dev:api` or `pnpm dev:docs`. Node 24 is required (see `.nvmrc` and `package.json`'s `engines` field); Node 22 is Maintenance LTS and Node 26 isn't LTS yet.

`apps/api` needs Postgres: `pnpm db:up` starts it via `docker-compose.yml` (seeded from `docker/postgres/init/`), `pnpm db:down` stops it, `pnpm db:logs` tails it. Copy `.env.example` to `.env` first.

`apps/web` calls the API through a thin BFF layer (`apps/web/lib/api`, §4.1): a `fetch` wrapper with the caching policy from that section's table, and API responses validated against `packages/contract` before use. Copy `apps/web/.env.example` to `apps/web/.env.local` (Next.js reads env files from the app directory, not the repo root) and point `API_ORIGIN` at a running `apps/api`.

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
- **`.github/workflows/docker-api.yml`** — only on push to `main` (and only when the API, `packages/`, the lockfile or Turborepo config changed): builds `apps/api/Dockerfile` and pushes to Docker Hub as `fuisl/grad26-api:latest` and `fuisl/grad26-api:sha-<short>`. PRs do not build the image, to save compute (there is no staging deploy), so a broken Dockerfile is only caught after merge: when you change it, run `docker build -f apps/api/Dockerfile .` locally first. Because PRs never run this workflow, a fork PR can't reach the `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` secrets.
- **The infra repo never runs this repo's CI.** Flux's image automation there (ADR-004, #47) watches `fuisl/grad26-api` on Docker Hub and bumps the deployed tag on its own; this repo's job ends at "pushed a tagged image."

`apps/api/Dockerfile` builds from the repo root (`docker build -f apps/api/Dockerfile .`) using `turbo prune @grad/api --docker` to isolate just that app's subgraph, then `pnpm deploy --prod --legacy` for a production-only `node_modules`, so the final image never carries `apps/web`, `apps/docs`, dev dependencies, or unrelated workspace packages.
