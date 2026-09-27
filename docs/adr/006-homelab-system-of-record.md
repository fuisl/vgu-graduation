# ADR-006: The homelab is the system of record
Status: Accepted
Date: 2026-09-27
## Context
The invitation and RSVP flow is the most critical function, and it would depend for months on a residential power feed, ISP and one machine, with no service level. The alternative is to pay for a hosted core.
## Decision
The homelab remains the system of record. The risk is accepted and documented in section 9 of the target architecture, with mitigations: UPS, failover WAN, two tunnel replicas, stale reads from Vercel, nightly and offsite backups, and an external uptime monitor. A second node at the venue is planned for the event day, machine to be chosen (#81).
## Alternatives considered
- Move the core (API, database) to a VPS: higher uptime, but ongoing cost, and it splits data from the GPU and originals.
- Fully hosted backend: removes the risk, adds cost and lock-in.
## Consequences
- An outage lasts as long as a power or ISP failure plus about two minutes.
- The current node is a laptop, so power, thermals and lid behaviour are event-day risks.
- If measured uptime proves poor, the core can be relocated to a VPS; this is out of scope until then.
