# Architecture Decision Records
Use an ADR for material changes to architecture, infrastructure, security boundaries, core libraries, protocols or persistent data.
```md
# ADR-NNN: Decision
Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD
## Context
## Decision
## Alternatives considered
## Consequences
```

## Index
- [ADR-001: Hosting split](001-hosting-split.md)
- [ADR-002: The API is its own application](002-api-application.md)
- [ADR-003: Browser-direct traffic for uploads and streams](003-browser-direct-traffic.md)
- [ADR-004: GitOps with Flux, Kustomize and SOPS](004-gitops-flux.md)
- [ADR-005: Garage object storage and CloudNativePG](005-storage.md)
- [ADR-006: The homelab is the system of record](006-homelab-system-of-record.md)
- [ADR-007: Venue audio enters through the API](007-venue-audio-ingest.md)
- [ADR-008: Separate infrastructure repository](008-infrastructure-repository.md)
- [ADR-009: Direct home network exposure, no Cloudflare Tunnel](009-direct-home-network-exposure.md)
- [ADR-010: Site languages without locale URLs](010-site-languages.md)
- [ADR-011: No service worker for guest pages in v1](011-no-service-worker.md)
- [ADR-012: Guest email through the owner's Gmail over SMTP](012-guest-email.md)
- [ADR-013: Branded HTML email and RSVP from the guest's calendar](013-calendar-rsvp-email.md)
- [ADR-014: Live gallery feed, with Postgres NOTIFY as a wake-up hint](014-live-gallery-feed.md)
