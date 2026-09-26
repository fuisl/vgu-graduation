# 4. Applications and repository layout

## 4.1 apps/web (Vercel)

Unchanged in role. It gains:

- Guest routes: `/invite/[token]` performs the cookie exchange and redirects to `/invite`; `/invite`, `/rsvp`, `/pass`, `/gallery`, `/wishes`, `/live`, `/display` render from API data.
- Admin routes under `/admin`, protected by an application session. The exact identity provider is deferred; the default is a GitHub sign-in with an allowlist of handles.
- A thin BFF layer: route handlers and server actions that call the API with the forwarded invitation credential, use `fetch` caching with revalidation on reads, and map API failures to explicit page states. No domain logic lives here.
- Function region pinned to Singapore (`sin1`) so the hop to a homelab in Ho Chi Minh City stays short.

Caching policy for the Vercel layer:

| Data | Cache | Reason |
| --- | --- | --- |
| Event configuration, venue info | Revalidate every 5 minutes | Rarely changes, must survive outages |
| Invitation and RSVP state | Revalidate every 60 seconds, tagged per invitation | Stale pass beats no pass; RSVP write revalidates the tag |
| Gallery listing | Revalidate every 60 seconds | Moderator changes appear within a minute |
| Wishes | Revalidate every 30 seconds | Same |
| Admin views | No cache | Must be current |

## 4.2 apps/docs (Vercel)

Unchanged. Served under `/docs` by rewrite from the web project as documented in `operations/deployment.md`.

## 4.3 apps/api (new, k3s)

One Node 22 process built with a small HTTP framework that supports WebSockets natively. Modules are directories with their own routes, services and repositories; they share one database connection pool and one storage client.

| Module | Responsibilities | Endpoints (illustrative) |
| --- | --- | --- |
| invitations | Token issue, hash lookup, rotate, revoke, joint inviters | `GET /invitations/me`, `POST /admin/invitations`, `POST /admin/invitations/{id}/rotate` |
| rsvp | Attendance state per invitation, plus-ones | `PUT /rsvp`, `GET /admin/rsvp` |
| event | Public event configuration, venue, calendar payload | `GET /event`, `GET /event/calendar.ics` |
| pass | Signed pass payload for QR | `GET /pass` |
| media | Upload originals, list gallery, serve derivatives, moderation | `POST /media`, `GET /gallery`, `GET /media/{id}/{variant}`, `POST /admin/media/{id}/moderate` |
| wishes | Submit and list wishes with moderation | `POST /wishes`, `GET /wishes`, `POST /admin/wishes/{id}/moderate` |
| live | WebSocket fan-out for translation and display | `WS /live/translation`, `WS /live/display` |
| translation | Ingest segments from the GPU service | `POST /internal/translation/segments` |
| print | Print job queue | `POST /print/jobs`, `GET /internal/print/jobs/next`, `POST /internal/print/jobs/{id}/done` |
| admin | Cross-cutting admin queries | `GET /admin/overview` |
| system | Health and metrics | `GET /healthz`, `GET /readyz`, `GET /metrics` |

Runtime behavior:

- Migrations run in an init container of the API Deployment using an advisory lock, so a rollout never races itself.
- The worker is the same image started with a worker entrypoint. It polls a `jobs` table in Postgres for derivative generation, moderation notifications and print job dispatch. No message broker.
- Authentication: invitation tokens arrive as `Authorization: Bearer` from Vercel or as an `HttpOnly` cookie scoped to `.grad26.example` from browsers on path B. Tokens are 128-bit random values; only a SHA-256 hash is stored; comparison is constant-time. Service calls on path C use static bearer tokens from Secrets. Admin calls carry a session token signed by the web app.
- Logging: structured JSON; `Authorization`, `Cookie` and any field named `token` are redacted at the logger. Request paths never contain tokens.
- CORS: allows `https://grad26.example` with credentials, nothing else.
- Uploads: multipart streaming straight to Garage, size-capped at 25 MB per file, content-type sniffed, EXIF stripped by the worker when generating derivatives.

Configuration is environment-only:

| Variable | Source |
| --- | --- |
| `DATABASE_URL` | CloudNativePG generated Secret `grad-db-app`, key `uri` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | SOPS-encrypted Secret `api-s3` |
| `S3_BUCKET_ORIGINALS`, `S3_BUCKET_DERIVATIVES` | ConfigMap |
| `PUBLIC_ORIGIN`, `API_ORIGIN`, `COOKIE_DOMAIN` | ConfigMap |
| `SERVICE_TOKEN_TRANSLATION`, `SERVICE_TOKEN_PRINTER` | SOPS-encrypted Secret `api-service-tokens` |
| `ADMIN_SESSION_SECRET` | SOPS-encrypted Secret, shared with the web app on Vercel |
| `LOG_LEVEL` | ConfigMap |

## 4.4 apps/translation (k3s, GPU)

Python service. It exposes one WebSocket ingest endpoint for audio and pushes finished segments to the API over the cluster network with its service token. It never touches the database or storage and can be absent without the API noticing. Audio reaches it from a small capture client running on the AV laptop at the mixer. Where the GPU machine physically sits on ceremony day is an open item (section 11).

## 4.5 packages/contract (new)

Request and response schemas shared by apps/web and apps/api, written once as runtime validators with inferred TypeScript types. A change to an endpoint fails the web app's typecheck instead of failing at the venue.

## 4.6 deploy/ (new): everything Flux reconciles

```
deploy/
  clusters/
    home/
      flux-system/            generated by flux bootstrap
      infra-controllers.yaml  Flux Kustomization
      infra-configs.yaml      Flux Kustomization, dependsOn infra-controllers
      apps.yaml               Flux Kustomization, dependsOn infra-configs
    venue/                    open item, same shape with the venue overlay
  infra/
    controllers/              cert-manager, cloudnative-pg, plugin-barman-cloud, nvidia-device-plugin
    configs/                  namespaces, ClusterIssuer, RuntimeClass, Traefik middlewares, NetworkPolicies
  apps/
    base/                     api, worker, postgres, garage, cloudflared, translation, printer, fallback, web-mirror
    home/                     kustomization.yaml + patches: translation on, printer off, web-mirror off
    venue/                    open item: printer on, web-mirror on
  charts/
    garage/                   vendored copy of the upstream chart, pinned to the Garage release
```

Secrets are committed only as SOPS-encrypted files named `*.sops.yaml`. The `.sops.yaml` rules file at the repository root restricts encryption to those paths.

## 4.7 Images and registry

| Image | Built from | Registry | Notes |
| --- | --- | --- | --- |
| `ghcr.io/<owner>/grad-api` | `apps/api`, pruned workspace | GHCR, private | Contains no secrets; no private dependencies |
| `ghcr.io/<owner>/grad-translation` | `apps/translation` | GHCR, private | CUDA runtime base |
| `ghcr.io/<owner>/grad-web` | `apps/web`, standalone output | GHCR, private | Bundles the private ASCII dependency, so it must stay private; only used by the venue overlay |
| `ghcr.io/<owner>/grad-printer` | `apps/printer` or a subfolder of api | GHCR, private | CUPS plus a job poller |

GitHub Actions builds on push to `main` with tags of the form `main-<sha>-<unix-timestamp>`. The web image build receives the GitHub read token as a BuildKit secret mount, never as a build argument or layer. Flux image automation watches GHCR, picks the newest timestamp, and commits the tag bump to a bot branch that is merged under review. Actions minutes are conserved by building on a self-hosted runner on the homelab if the free quota runs short.
