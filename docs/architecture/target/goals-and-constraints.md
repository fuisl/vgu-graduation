# 1. Goals and constraints

**Product goals** (from `product/vision.md` and `product/principles.md`):

- Invitation first. The invitation, RSVP, calendar and venue information must ship first and survive every other failure.
- One experience, not many apps. The invitation is the identity that unlocks every utility.
- Physical and digital reinforce one event: phones, event display, camera, prints.
- Local ownership. Private and event data stay under project control.
- Graceful failure. 3D, printing and translation may fail without touching critical flows.
- Archive quality. Originals are preserved privately; optimized derivatives are served.

**Engineering constraints** (from `AGENTS.md`):

- TypeScript for web and platform, Python for ML inference.
- pnpm and Turborepo, one repository, a modular monolith rather than microservices.
- PostgreSQL, object storage, printer and inference are never directly internet-facing.
- Invitation URLs are bearer credentials. Tokens and guest PII are never logged.
- Mobile-first and resilient to poor venue networks.

**Operational constraints** (decided in discussion):

- Zero recurring cost beyond the domain. Vercel Hobby, Cloudflare Free, self-hosted everything else.
- The stateful core runs on a homelab. This is mandatory; its risks are documented in section 9 rather than designed away.
- The homelab runs k3s, managed by Flux from this repository with Kustomize overlays. Upstream Helm charts are used wherever a service ships one.
- Object storage is Garage.

**Non-goals**: high availability, multi-region, autoscaling, and any managed cloud data service.
