# ADR-001: Hosting split
Status: Accepted
Date: 2026-09-27
## Context
The ceremony product needs public, cacheable pages that survive outages, plus private state (guests, photos, invitations), GPU inference and a printer that only make sense on hardware we control. No single host does both well within the budget.
## Decision
Vercel serves the public web app at the edge. The homelab k3s cluster holds the API, PostgreSQL, object storage, the worker and the experimental venue services. Cloudflare Tunnel joins them: the homelab opens no inbound port and the API is reached at `api.grad26.fuisloy.dev`.

**Amended 2026-09-27 (ADR-009):** the Cloudflare Tunnel detail is superseded. The homelab router forwards ports 80/443 directly to Traefik instead; DNS stays at Spaceship. The Vercel/homelab split itself, and everything else in this ADR, still stands.
## Alternatives considered
- Everything on a VPS: simpler network, but no GPU and a monthly cost for compute we already own.
- Everything on the homelab: no edge caching, and an outage takes the invitation pages down with it.
- Managed backend (for example a hosted database and functions): less operation, but per-use cost for photos and streams, and no path to GPU or printer.
## Consequences
- Invitations can be served stale from Vercel's cache while the homelab is down.
- Two deployment targets to operate and to keep in sync.
- The router's port forward and DNS at Spaceship become required infrastructure instead (ADR-009; see also ADR-003 and ADR-006).
