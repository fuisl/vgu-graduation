# Local development

## Everything lives here; the infra repo only distributes it

`apps/web`, `apps/api`, `apps/docs` and `packages/*` are all developed and reviewed in this repository. `fuisl/vgu-graduation-deployment` (ADR-008) holds no application source — only the Flux/Kustomize manifests that reference a built image tag. If you're writing web or API code, you're always in this repo; you never need to touch the infra repo to do that.

## Running everything at once

`pnpm dev` runs `turbo dev`, which starts `apps/web`, `apps/api` and `apps/docs` together. Turborepo's terminal UI (`"ui": "tui"` in `turbo.json`) splits this into one pane per app inside a single terminal window: switch panes with the arrow keys, `m` opens the task list, and each pane scrolls its own logs independently. If you'd rather see plain interleaved output (e.g. in a CI-like shell), pass `--ui=stream`.

To run just one app, `pnpm dev:web`, `pnpm dev:api` or `pnpm dev:docs`. Node 24 is required (see `.nvmrc` and `package.json`'s `engines` field); Node 22 is Maintenance LTS and Node 26 isn't LTS yet.

`apps/api` needs Postgres and S3-compatible storage. `pnpm services:up` starts both (Postgres and Garage) and creates the buckets; `pnpm services:down` stops them and `pnpm services:reset` wipes their volumes and starts fresh. For Postgres alone: `pnpm db:up` starts it via `docker-compose.yml`, `pnpm db:down` stops it, `pnpm db:logs` tails it. Copy `.env.example` to `.env` first, then run `pnpm db:migrate` to create the schema (see below).

`apps/web` calls the API through a thin BFF layer (`apps/web/lib/api`, §4.1): a `fetch` wrapper with the caching policy from that section's table, and API responses validated against `packages/contract` before use. Copy `apps/web/.env.example` to `apps/web/.env.local` (Next.js reads env files from the app directory, not the repo root) and point `API_ORIGIN` at a running `apps/api`.

## Database schema and migrations

The schema is defined in `apps/api/src/db/schema.ts` with Drizzle (ADR-002); versioned SQL migrations live in `apps/api/drizzle/` and are committed.

- `pnpm db:migrate` applies pending migrations to `DATABASE_URL`. It is idempotent, and a Postgres advisory lock serializes concurrent runs, so it is safe as the API Deployment's init container (`node dist/migrate.js`, which the image ships with the `drizzle/` folder).
- After changing `schema.ts`, run `pnpm db:generate --name=<what-changed>` and commit the new SQL file. Never edit a migration that has been merged; add a new one.
- `pnpm db:reset` wipes the local database volume and starts a fresh Postgres; run `pnpm db:migrate` afterwards. Use it once if your volume predates the migrations (it was previously seeded by an init script that no longer exists).
- Migration tests need Postgres: `pnpm db:up` first. They create and drop their own scratch databases, never touching `grad26`.

## Background jobs: the worker

The worker is the API image started as `node dist/worker.js` (§4.3); locally, `pnpm --filter @grad/api worker`. It polls the `jobs` table, one job at a time per process, so scale it with replicas. Code lives in `apps/api/src/worker/`.

- **Enqueue** with `JobQueue.enqueue(type, payload)`. Payloads carry ids only, never tokens or guest PII.
- **Handlers** are registered by job type in `apps/api/src/worker.ts`. They must be idempotent: a job whose worker dies mid-run is re-claimed once its 10-minute lease expires.
- **Claims** use `FOR UPDATE SKIP LOCKED`, so concurrent workers never take the same job.
- **Failures** retry with exponential backoff (10s, doubling, capped at 10 minutes) until `max_attempts` (default 5), then stay `failed` with `last_error` set. An unregistered type fails like any other error. To see what's stuck: `SELECT id, type, attempts, last_error FROM jobs WHERE status = 'failed'`; to retry one, set it back to `status = 'queued', attempts = 0, run_at = now()`.
- On SIGTERM the worker stops claiming, finishes the job in progress and exits.

## Object storage: Garage

`pnpm services:up` runs Garage v2.4.1, the same object store as the homelab (ADR-005), as a single node from `docker-compose.yml` and `docker/garage/garage.toml`. `scripts/dev-garage-init.sh` then creates the three buckets (`grad-originals`, `grad-derivatives`, `grad-backups`), grants the dev key read/write on the first two, and proves it works with a signed upload, download and delete. It is idempotent, so re-running `services:up` is safe.

The API reads it through the `S3_*` variables in `.env.example`: endpoint `http://localhost:3900`, region `garage`, path-style addressing. The dev credentials are throwaway constants, safe to commit only because they exist nowhere but your laptop. To poke at it: `docker compose exec garage /garage status` or `/garage bucket list`. Data lives in the `garage_meta` and `garage_data` volumes until `services:reset`.

**How this relates to the deployed Garage.** The API only ever sees an S3 endpoint, a region, credentials and bucket names, all from environment variables, so the same code runs against both. What differs is who provisions it:

| | Local (this repo) | Homelab (infrastructure repository, #49) |
| --- | --- | --- |
| Runs as | one Docker Compose container | StatefulSet from the vendored Helm chart on k3s |
| Layout | assigned automatically (`--single-node`) | assigned automatically (`--single-node`) |
| Keys | fixed dev key from `.env` | `api-key` and `backup-key` imported from SOPS-encrypted secrets by `scripts/garage-bootstrap.sh` |
| Backups | none | nightly offsite mirror (ADR-005) |
| Exposure | `localhost:3900` | ClusterIP only, never public |

Nothing here is deployed and the infrastructure repository never reads this compose file. Keep the Garage version in `docker-compose.yml` the same as the chart vendored in the cluster (`charts/garage`, v2.4.1).

## API authentication

Three credential types, all checked by the API itself (`apps/api/src/auth/`):

- **Invitation token** (guests): 128-bit random, only its SHA-256 hash is stored, compared in constant time. Sent as `Authorization: Bearer` (from Vercel) or the `inv` cookie. `GET /invitations/me` answers `404` for unknown, revoked and not-yet-valid tokens (indistinguishable on purpose), and `410 Gone` once `valid_until` has passed, so the web app can show an "expired" page instead of "not found". `GET /pass` takes the same credential and answers with the same status codes.
- **Admin session** (`/admin/*`): HS256 token signed with `ADMIN_SESSION_SECRET`, minted by the web app after GitHub sign-in.
- **Event display** (`WS /live/display`, `GET /live/display/feed`): the invitation credential, like any guest route. The kiosk has its own invitation and sends the `inv` cookie on the WebSocket handshake. A browser `Origin` other than `PUBLIC_ORIGIN` is refused. To watch it locally: `npx wscat -c ws://localhost:4000/live/display -H "Authorization: Bearer $TOKEN"`, then hide or add a wish; messages arrive within about 2 seconds (details in `use-cases.md` §6.2).
- **Service token** (`/internal/*`): a static bearer token per service, guarded by `requireService("translation" | "printer")`. Each token only opens its own scope, and a scope with no configured token rejects everything.

Request and response bodies are validated with the `@grad/contract` Zod schemas, and every error leaves as `{ error, message }`.

## Photo uploads (media module)

`POST /media` (guest credential, `multipart/form-data` with one file part) streams the file straight from the browser into `grad-originals` through `apps/api/src/storage/object-store.ts`, the one S3 client the modules share. The browser uses `PUBLIC_API_ORIGIN` with `credentials: include`; `apps/web/next.config.mjs` exposes that public origin to the camera bundle. Nothing buffers the whole file: parts of 5 MB go up one at a time.

- **Format** is sniffed from the first bytes (JPEG, PNG or WebP); the declared content type and file name are ignored and never logged. Anything else is `415`.
- **Size** is capped at 25 MB by the API while streaming (`413`), not by Traefik.
- **Roll of 36**: each invitation can upload 36 photos in total (decided 2026-09-29, #58). The count includes hidden and removed photos, is checked before any bytes are read and again, under a row lock on the invitation, when the photo is recorded. A finished roll is `409`. The `201` body carries `shotsRemaining` for the camera UI.
- **Garage down** (or `S3_*` unset locally) is `503` with `Retry-After: 30` and the contract's `{ error, message }`; nothing else in the API is affected.
- The original's key is the photo's row id, never its public id, and the photo row plus its `media.derive` job (payload `{ photoId }`) are inserted in one transaction.

**Derivatives** (`apps/api/src/modules/media/derivatives.ts`, run by the worker): the `media.derive` job reads the original, applies its EXIF orientation, and writes two sRGB JPEGs to `grad-derivatives` as `{publicId}-{variant}.jpg`: `thumb` (fits 640 px) and `display` (fits 2048 px), never upscaled, transparency flattened onto white. All metadata (EXIF including GPS, XMP, IPTC, ICC) is dropped. The photo then becomes `ready` and stays `visible` (no pre-review). If every attempt fails (a corrupt file that only looked like an image), the photo is marked `failed` and never listed; the original is kept. Locally, run `pnpm --filter @grad/api worker` next to the API to process uploads.

**Gallery, serving and moderation** (#60):

- `GET /gallery` is public and lists only `visible` + `ready` photos, newest first, cursor-paginated (`nextCursor` is the last item's `publicId`). `Cache-Control: public, s-maxage=60`, matching the Vercel layer's one-minute window.
- `GET /media/{publicId}/{thumb|display}` needs no credential (the random id is the capability, so the display and printer can load it too) and streams the derivative from Garage with `Cache-Control: public, max-age=31536000, immutable`. Anything not `visible` + `ready`, an unknown variant, or a row id instead of a public id is `404` with `no-store`; there is no route to an original. Garage down is `503` with `Retry-After`.
- `POST /admin/media/{publicId}/moderate` (`requireAdmin`, body `{ status: "visible" | "hidden" | "removed" }`) changes what is listed and served on the next request and writes a `photo.moderate` audit row (`{ from, to }`). It does not delete objects: takedown deletion of the original and derivatives stays a manual admin action (principles §8).
- A browser that already loaded a derivative keeps it in its own cache after the photo is hidden; the immutable header can't recall it. Hiding stops every new load.

Images are processed with [sharp](https://sharp.pixelplumbing.com) (libvips). It ships prebuilt binaries for macOS and for Linux musl (`node:24-alpine`, x64 and arm64) as optional dependencies, so it needs no build step: `pnpm` reporting "Ignored build scripts: sharp" is expected, and the Dockerfile's `--ignore-scripts` install works unchanged.

## API configuration

`apps/api` reads configuration from the environment only (`apps/api/src/config.ts`, validated with Zod; variables listed in `applications-and-repository.md` §4.3). Locally every variable has a safe default, so `.env` only needs overriding for what you change. With `NODE_ENV=production` the API refuses to start unless the S3, service-token, `PASS_SIGNING_KEY` and `ADMIN_SESSION_SECRET` variables are set, and the error names the missing variables, never their values. Locally, leaving `PASS_SIGNING_KEY` unset makes the API sign passes with an ephemeral key and log a warning (signature scheme: `use-cases.md` §6.1).

CORS allows `PUBLIC_ORIGIN` and nothing else, so a web app on any other origin (for example a Vercel preview) must be listed there. `GET /metrics` serves Prometheus metrics; it is unauthenticated, so the Ingress must not route it publicly.

## Trying the API by hand with Bruno

[Bruno](https://www.usebruno.com) is a git-native API client — requests are plain-text `.bru` files, no cloud account. The collection lives in `dev/bruno/` (never runs in production, same spirit as `dev/Caddyfile`): open that folder in the Bruno app and select the "Local" environment.

It currently covers the three implemented invitations endpoints plus creating and listing wishes, the photo upload and the gallery listing. Set the `invitationToken` variable (a Bruno *secret* var, never committed) after running "Create Invitation" — never paste a real token into a request body or a non-secret var, since invitation tokens are bearer credentials (AGENTS.md). As more `apps/api` modules land, extend this collection to match; once routes are wired through `@grad/contract` with OpenAPI generation, prefer importing that spec over hand-writing requests, so the collection can't drift from the contract.

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

- **`.github/workflows/ci.yml`** — every PR and push to `main`: install, lint, typecheck, test, build, all via Turborepo with its own cache. To save compute it runs only what the change needs (#104): `scripts/ci-scope.sh` picks `turbo --affected` (changed packages and their dependents) or a full run when the change touches the workflow, `turbo.json`, root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc` or a tsconfig, or when no base commit is usable. A change under `docs/` also builds `apps/docs`, which renders those files at build time. The single `checks` job always runs and reports, so it stays the required status check. `apps/web`'s `asciify` dependency is optional (`docs/development/private-dependencies.md`), so this needs no secret and is safe on PRs from forks.
- **`.github/workflows/docker-api.yml`** — on push to `main` (and only when the API, `packages/`, the lockfile or Turborepo config changed), or by hand from the Actions tab ("Run workflow", to rebuild without a code change): builds `apps/api/Dockerfile` and pushes to Docker Hub as `fuisl/grad26-api:latest`, `fuisl/grad26-api:sha-<short>` and `fuisl/grad26-api:main-<YYYYMMDDHHmmss>-<short>` (UTC build time, 7-char sha, e.g. `main-20260930134501-7c646bf`). Only the `main-*` tag is deployed: the Flux ImagePolicy in `fuisl/vgu-graduation-deployment` filters `^main-(?P<ts>[0-9]{14})-[a-f0-9]{7}$`, extracts `$ts` and picks the numerically highest, so don't change that format without changing the policy too. PRs do not build the image, to save compute (there is no staging deploy), so a broken Dockerfile is only caught after merge: when you change it, run `docker build -f apps/api/Dockerfile .` locally first. Because PRs never run this workflow, a fork PR can't reach the `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` secrets.
- **The infra repo never runs this repo's CI.** Flux's image automation there (ADR-004, #47) watches `fuisl/grad26-api` on Docker Hub and commits the new tag to the infra repo's `main` on its own, so a merged API change is live within about 10 minutes with no further step. This repo's job ends at "pushed a tagged image."

`apps/api/Dockerfile` builds from the repo root (`docker build -f apps/api/Dockerfile .`) using `turbo prune @grad/api --docker` to isolate just that app's subgraph, then `pnpm deploy --prod --legacy` for a production-only `node_modules`, so the final image never carries `apps/web`, `apps/docs`, dev dependencies, or unrelated workspace packages.
