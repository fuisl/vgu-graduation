# 11. Open items and decisions to record

Open items:

1. **Venue node.** Whether the GPU machine travels to the venue as the single cluster, or a second node bootstraps from `deploy/clusters/venue` with a rehearsed data handoff. Depends on whether the homelab GPU machine is movable and on the venue network. Affects sections 4.6, 7.5, 8.7.
2. **Offsite target.** A disk at a second household over Tailscale, or a paid bucket. Affects 5.3.
3. **Admin identity provider.** Default is GitHub sign-in with an allowlist. Affects 4.1 and 6.4 only.
4. **Staging.** Whether Vercel previews get a staging namespace and hostname. Affects 8.3.
5. **Translation scope.** Languages, model size, latency budget. Affects GPU sizing in 7.8.

Decisions to be recorded as ADRs, following `adr/README.md`:

- ADR-001: Hosting split. Vercel for the edge, homelab k3s for state and venue services, joined by Cloudflare Tunnel.
- ADR-002: The API is its own application, `apps/api`, a modular monolith that also runs the worker.
- ADR-003: Browser-direct traffic. Uploads and live streams bypass Vercel and authenticate at the API.
- ADR-004: GitOps with Flux and Kustomize on k3s; upstream Helm charts where they exist; SOPS with age for secrets.
- ADR-005: Object storage is Garage; PostgreSQL is run by CloudNativePG with Barman Cloud backups to Garage.
- ADR-006: The homelab is the system of record despite the availability risk documented in section 9.
