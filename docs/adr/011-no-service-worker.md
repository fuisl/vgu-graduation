# ADR-011: No service worker for guest pages in v1
Status: Accepted
Date: 2026-10-19
## Context
Venue networks are poor, so an offline shell was considered (QA #78, P2-11): a service worker that caches the app shell and the pages a guest has opened, so `/invite`, `/me` or `/venue` still open with no signal. The personal pages are rendered per request from the `HttpOnly` invitation cookie (ADR-003, ADR-010), which is a bearer credential, and they show the guest's name, party, RSVP, pass and accessibility needs. A cached copy is stale by design, and the P0 fixed before this decision was exactly that: revoked, rotated and expired invitations kept rendering from a cache (personal reads are now `no-store`). Phones at a graduation are also passed around and shared within families.

What already degrades well without one: pages are server-rendered with no client fetch on the critical path, a failed API call degrades one section and not the page, the BFF serves the last good copy of public data (event, guide-book) when the API is unreachable, the guide-book filters client-side once loaded, and `/live` and `/display` reconnect and catch up. A page already open in a tab keeps what it shows.
## Decision
- No service worker in v1, for guest or admin pages. Nothing caches personal HTML or BFF responses in the browser beyond what HTTP headers already allow (`private, no-store` on personal reads).
- Offline and slow-network resilience stays in the pages themselves: server rendering, per-section fallbacks, retry buttons, the BFF's stale public data and the live surfaces' reconnect logic.
- The pass stays something a guest can screenshot or print, not an offline app feature.
## Alternatives considered
- **A service worker caching the static shell only** (JS, CSS, fonts, the public `/venue`): would speed up repeat loads, but the first visit at the venue gains nothing, Next already serves immutable hashed assets with long cache lifetimes, and a worker adds update and cache-busting risk on event day. Not worth it for one evening.
- **Caching personal pages, keyed by the cookie**: the worker cannot read an `HttpOnly` cookie, so it could not tell two guests apart on a shared phone, and it would keep serving a revoked or expired invitation offline: the same leak as the cache P0, moved into every guest's browser where we cannot purge it.
- **Caching personal pages and clearing them on sign-out**: there is no sign-out for guests (the link is the credential), so there is no reliable moment to clear.
## Consequences
- With no signal at all, loading or reloading a page shows the browser's offline page. Guidance for the day: open the invitation and venue before arriving and keep the tab, or screenshot the pass.
- Revoking or rotating an invitation takes effect on the next request everywhere; nothing on a guest's device outlives it.
- Revisit after the event if the archive pages (`/memories`, `/gallery`) need offline reading: those are public and could be cached by a worker scoped to them, with no credential involved.
