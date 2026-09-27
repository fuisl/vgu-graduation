# ADR-003: Browser-direct traffic for uploads and streams
Status: Accepted
Date: 2026-09-27
## Context
Photo uploads, live translation on phones and the event display feed are large or long-lived. Routing them through Vercel adds a hop and hits its body and duration limits.
## Decision
Small reads and writes go browser to Vercel to API. Uploads and live streams go from the browser straight to the API hostname over Cloudflare. The invitation cookie is scoped to `.grad26.fuisloy.dev` so both hosts receive it, and the API authenticates every request itself; Vercel is a client like any other.
## Alternatives considered
- Proxy everything through Vercel: one origin, but breaks on large bodies and long streams.
- Presigned uploads directly to object storage: offloads bytes, but exposes storage to the internet, which the project forbids.
## Consequences
- The API needs its own CORS, rate limits and WAF rules at Cloudflare.
- Cookie scope is a security boundary and must not widen beyond the two hostnames.
- Which feature uses which path is fixed in section 3.4 of the target architecture.
