# ADR-007: Venue audio enters through the API
Status: Accepted
Date: 2026-09-27
## Context
The workload catalogue implied an ingress to the translation service, which contradicted the rule that inference services are never internet-facing.
## Decision
The capture client connects to `WS /live/ingest` on `apps/api`. The API authenticates it and proxies audio to the translation service over the cluster network. The translation service has no Ingress. Decided 2026-09-27.
## Alternatives considered
- Expose the translation service through the tunnel: fewer hops, but breaks the security rule and its own auth.
## Consequences
- The API carries the audio stream, so it must stay responsive under that load.
- Translation can be suspended without affecting any public endpoint.
- Scope for live translation is deferred until after M1.
