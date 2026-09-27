# ADR-002: The API is its own application
Status: Accepted
Date: 2026-09-27
## Context
Uploads, live streams, background jobs and admin actions do not fit inside Next.js route handlers. Vercel functions cap request bodies at 4.5 MB and bound stream duration, and the API must run in the cluster next to the database and storage.
## Decision
The API is a separate application, `apps/api`, written as a modular monolith that also runs the worker. It uses Fastify for HTTP and WebSockets, Drizzle for database access with plain SQL migrations, and Zod for the request and response contract shared with the web app through `packages/contract`. Decided in #21.
## Alternatives considered
- Next.js route handlers as the API: fewer deployables, but hits the Vercel limits above and couples the backend to the edge host.
- Separate microservices: independent scaling nobody needs at this size, and far more to operate.
- NestJS or Express: workable, but Fastify gives typed schemas and WebSockets with less framework.
## Consequences
- The web app's typecheck fails when an endpoint changes, because both sides import the same schemas.
- One process image to build and deploy; worker and API scale together.
- Module boundaries are enforced by convention, so they need review attention.
