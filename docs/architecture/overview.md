# Architecture Overview
Start as a modular monorepo, not a microservice fleet.
```mermaid
flowchart LR
 Guest[Guest devices] --> Web[Next.js web]
 Admin[Admin] --> Web
 Web --> API[Platform API]
 API --> DB[(PostgreSQL)]
 API --> Media[(Object storage)]
 Speech[Venue audio] --> Translate[Python translation]
 Translate --> API
 API --> Display[Event display]
 API --> Printer[Local printer daemon]
```
Public/cacheable surfaces may run at the edge. Authoritative private data and event services may remain on the homelab behind an authenticated HTTPS API/tunnel.
Database, object storage, inference and printer services are never directly internet-facing.
