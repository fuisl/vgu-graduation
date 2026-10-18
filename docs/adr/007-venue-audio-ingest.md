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
- Implemented in #68 (2026-10-19). The capture client has its own service token (`SERVICE_TOKEN_INGEST`); the API dials `TRANSLATION_INGEST_URL` with the translation service's token. Audio is raw PCM, 16 kHz mono s16le, in binary frames of 20 to 200 ms, plus optional JSON control messages, relayed verbatim. One capture client at a time: the newest connection takes over and the old one is closed with `4001`. Audio is dropped, never queued, while the service is absent or more than about 8 s behind, so the API's memory stays bounded and nothing else slows down. Full protocol: `packages/contract/src/translation.ts` and `docs/architecture/target/use-cases.md` §6.2.
