# 11. Open items and decisions to record

Open items:

1. **Venue node machine.** Decided 2026-09-27: a second node runs at the venue, bootstrapped from `clusters/venue` with a rehearsed data handoff. Which machine it is remains open; it depends on hardware inventory (#81). Default posture, decided 2026-09-27: the homelab laptop stays home and the venue connects back to it remotely; the laptop can travel as a fallback if a remote link isn't viable, but that isn't the plan. Affects sections 4.6, 7.5, 8.7.
2. **Translation scope.** Deferred until after M1: languages, model size and latency budget. The homelab GPU has 6 GB of VRAM, so plan for small or int8 models. Affects GPU sizing in 7.8.
3. **Ceremony date and time.** Not yet confirmed (#83). Working placeholder: November 2026, time to be confirmed, time zone Asia/Ho_Chi_Minh (UTC+7). Build against the placeholder and replace it in the event configuration once the official time is announced; nothing else should hard-code it. The venue is Ceremony Hall at VGU. Map link updated 2026-09-27: <https://maps.app.goo.gl/meCAgQyakBbWh8LDA> (supersedes the earlier link recorded in #83).

Recorded as ADRs in `adr/README.md` (all accepted 2026-09-27):

- ADR-001: Hosting split. Vercel for the edge, homelab k3s for state and venue services. (The Cloudflare Tunnel detail is superseded by ADR-009 — direct port forwarding instead.)
- ADR-002: The API is its own application, `apps/api`, a modular monolith that also runs the worker. Fastify for HTTP and WebSockets, Drizzle for database access with SQL migrations, Zod for the shared contract.
- ADR-003: Browser-direct traffic. Uploads and live streams bypass Vercel and authenticate at the API.
- ADR-004: GitOps with Flux and Kustomize on k3s; upstream Helm charts where they exist; SOPS with age for secrets.
- ADR-005: Object storage is Garage; PostgreSQL is run by CloudNativePG with Barman Cloud backups to Garage.
- ADR-006: The homelab is the system of record despite the availability risk documented in section 9.
- ADR-007: Venue audio enters through the API. The capture client connects to `WS /live/ingest` on apps/api, which proxies audio to the translation service over the cluster network; the translation service has no Ingress.
- ADR-008: Infrastructure manifests and SOPS-encrypted secrets live in a separate infrastructure repository, `fuisl/vgu-graduation-deployment`. Both repositories are public; secrets are committed only as SOPS/age ciphertext, never as plaintext.
- ADR-009: Direct home network exposure. The router forwards ports 80/443 to Traefik; there is no Cloudflare Tunnel, proxy, WAF, or cache. DNS stays at Spaceship; `api.grad26.fuisloy.dev` is a plain `A` record kept current by a Dynamic DNS updater. Traefik terminates TLS itself via a `cert-manager` HTTP-01 `ClusterIssuer`.

Decided 2026-09-27:

- The API uses Fastify, Drizzle and Zod (ADR-002).
- The domain is `fuisloy.dev`, registered at Spaceship. The web app is at `grad26.fuisloy.dev`, the API at `api.grad26.fuisloy.dev`, and the invitation cookie is scoped to `.grad26.fuisloy.dev` so other subdomains never receive it. Superseded 2026-09-27 (ADR-009): the zone's nameservers stay at Spaceship; they do not move to Cloudflare. The homelab router forwards ports 80/443 directly to Traefik instead of using a Cloudflare Tunnel.
- Venue audio is proxied through the API (ADR-007), resolving the earlier conflict between the workload catalogue and the rule that inference services are never internet-facing.
- Infrastructure manifests and SOPS-encrypted secrets live in `fuisl/vgu-graduation-deployment` (ADR-008). The repository is public by decision; only ciphertext is committed. The age private key is held offline by nhientruong04, with an escrowed backup held by fuisl, and never appears in git or chat.
- Derivative image URLs use a random unguessable identifier and are cached at the edge; only approved photos get URLs.
- The door scanner and offline pass verification tool are deferred until after the invitation MVP; the pass payload is still signed.
- Only a few allowlisted admins create invitations, on behalf of graduates; graduates do not sign in.
- The offsite backup is a disk on nhientruong04's always-on server, reached over Tailscale. The copy must have a long-term custodian beyond the event, because the archive is meant to last four years.
- Admins sign in with GitHub and an allowlist.
- There is no staging namespace. Vercel previews use a dev API and never touch production data.
- Guest photos are covered by a visible notice, not per-guest opt-in. Photos are not reviewed before display; admins can hide a photo quickly and remove one on request. The gallery and wishes are reachable by public link, using unguessable photo identifiers.
- The homelab node is a laptop with an RTX 3060 Mobile (6 GB VRAM), see section 7.8.
- SSH access to the homelab node, decided 2026-09-27: `fuisl` (owner) and `nhientruong04` (backend), for the people who need to operate `apps/api` and its workload directly.
- Guest data consent, retention and takedown, decided 2026-09-27: see `docs/product/principles.md` (§8) and the runbook's takedown procedure.
- Code review routing, decided 2026-09-27: a single top-level `.github/CODEOWNERS` entry for `fuisl` across all areas, auto-requested as a reviewer but not required by the branch protection ruleset (#86). Split by area once the team grows into their areas.
