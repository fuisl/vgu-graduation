# GRAD '26 — Agent Instructions
## Mission
Build a digital companion for the VGU graduation ceremony and a durable four-year memory archive.
## Read before changing code
- Product: `docs/product/vision.md`, `docs/product/principles.md`
- UI: `docs/design/philosophy.md`, `docs/design/llm-reference.md`, `docs/design/anti-patterns.md`
- Architecture: `docs/architecture/overview.md` and relevant ADRs
- Workflow: `docs/development/workflow.md`
## Priorities
1. Invitation, RSVP, calendar and venue information.
2. Gallery, guest camera, wishes and event display.
3. Experimental: 3D, printing and live translation.
Experimental features must never compromise event-critical flows.
## Engineering rules
- TypeScript for web/platform; Python for ML/inference.
- pnpm + Turborepo. Prefer a modular monolith.
- Reuse `packages/ui` and `packages/design-tokens`.
- Never expose PostgreSQL, object storage, printer or inference services directly to the internet.
- Treat invitation URLs as bearer credentials. Never log tokens or guest PII.
- Mobile-first and resilient to poor venue networks.
- Small PRs tied to issues; update docs when behavior changes.
## Design authority
AI agents implement the established visual language; they do not independently expand it. Inspect existing UI and docs first. Surface genuinely new design decisions for human review.
## Definition of done
Run relevant lint, typecheck, tests and build. Check mobile, loading/error/empty states, accessibility and documentation impact.
