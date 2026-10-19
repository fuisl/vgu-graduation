# ADR-014: Live gallery feed, with Postgres NOTIFY as a wake-up hint
Status: Proposed
Date: 2026-10-19
## Context
Guests reported that new wishes and photos took far too long to appear for everyone else. The causes, traced end to end:

- **The gallery never refreshed.** `/gallery` fetched `/api/gallery` once on mount and never again; a new wish or photo appeared only after a reload.
- **Three stacked caches with stale-while-revalidate semantics.** The BFF's Next data cache revalidated `GET /gallery` every 60 s and `GET /wishes` every 30 s, and `/api/gallery` was also edge-cached (`s-maxage=30, stale-while-revalidate=30`). Time-based revalidation serves the stale copy to the first visitor after expiry and refreshes in the background, so a reload could still show a list one to two minutes old, and older after a quiet spell.
- **The display polled every 2 s, and new arrivals waited for the slide on screen** (8 to 20 s). With WebSockets blocked, its only refresh was one catch-up per reconnect attempt, backing off to 30 s.
- **The worker slept up to 1 s** before claiming a new photo's derivative job. Processing itself is not the bottleneck (about 0.2 s for a camera shot).

There is no service worker (ADR-011), and Traefik neither caches nor buffers.
## Decision
- **One live feed, two sockets.** The display's poller (`DisplayFeed`, #65) also feeds a new public `WS /live/gallery` with catch-up `GET /live/gallery/feed?since=`. It carries only the display's `wish`, `photo`, `hidden` and `keepalive` messages (`liveGalleryMessageSchema`), so it exposes nothing `GET /gallery` and `GET /wishes` don't already list publicly (decided 2026-09-30). Only visible wishes and visible, processed photos are ever sent in full; anything else is a bare `hidden` id. Browsers must come from `PUBLIC_ORIGIN`, and past `LIVE_GALLERY_MAX_CLIENTS` (default 1000) the handshake is `503` and pages poll. The display socket keeps the invitation credential. WebSocket, not SSE, because the API already runs WebSockets through Traefik with pings and the browser `LiveSocket` (backoff, jitter, idle watchdog) is tested; SSE would add a second transport for the same job.
- **Postgres NOTIFY as a wake-up hint, polling stays the truth.** Migration 0008 adds statement-level triggers: `grad_live` on insert or update of `wishes` and `photos`, `grad_jobs` on insert into `jobs`. The API keeps one `LISTEN grad_live` connection while any feed listener is connected and polls at once on a notification. The worker listens on `grad_jobs` and skips its idle sleep. Both keep their timers (2 s feed poll, 1 s worker poll) as the fallback. This amends the "polling over LISTEN/NOTIFY" choice in `use-cases.md` §6.2 without reversing it: reads are still of committed rows only (NOTIFY is delivered on commit), no writer has to remember to notify (the database does it), and a dropped listener (`PgListener` reconnects with backoff) costs latency, not correctness. Every API replica listens for itself, so this stays correct with more than one replica. In-process events alone would not reach the API from the worker, which writes `ready`.
- **Pages go live.** `/gallery` paints from the BFF, then follows the socket (`useLiveGallery`, `LiveGallery`): it catches up with `since` on every reopen, polls the catch-up every 5 s while no socket is open, and reconnects on `online` and when the tab becomes visible. A snapshot replaces the first paint, so takedowns made while the page was away disappear.
- **Shorter first-paint caches.** BFF data cache 10 s for both listings; `/api/gallery` edge `s-maxage=5, stale-while-revalidate=10`; the API's own headers `public, s-maxage=10`. Kept short, not removed: during a homelab outage the edge copy still paints the gallery, and a crowd opening it at once is absorbed.
- **Own posts at once.** After a successful post, the wish (as the API returned it) or the photo's public id plus a small local preview is kept in `sessionStorage` for 10 minutes. The gallery shows a photo as `pending: "developing"` until the processed one arrives, and bridges a wish only until the feed's first snapshot, so a moderator's takedown is never undone. The existing form states (sending, failed with the text kept) stay the submitter's pending and failed states.
- **Display.** It polls the catch-up every 5 s while its socket is down, and a new arrival cuts short a slide that is a repeat after 4 s; first showings keep their full time.
## Alternatives considered
- **Server-Sent Events:** proxy-friendly and auto-reconnecting, but a second streaming transport next to the existing WebSockets, with the same Traefik and keepalive needs and no shared client code.
- **Short client polling of the BFF only:** simplest, but every poll is either stale (cached) or a homelab round trip through Vercel, and it multiplies function invocations by every open tab.
- **LISTEN/NOTIFY as the only mechanism (no poll):** lower database load, but a notification lost during a reconnect or restart would be lost for good; the poll is what makes it safe.
- **In-process emitter only:** misses every change the worker makes (photo `ready`) and every other replica's writes.
- **`no-store` on the listings:** freshest first paint, but loses the edge copy that keeps the gallery readable during a homelab outage, and puts every page view on the home connection.
## Consequences
- The feed now runs whenever any gallery or display is open, so `photos.updated_at` and `wishes.updated_at` are indexed (migration 0008): two indexed queries every 2 s plus one per change.
- The API holds one extra Postgres connection (the LISTEN) while listeners are connected, and the worker one more always.
- `/api/gallery` and the listings reach the API more often (at most every 10 s per cache), and each open gallery tab holds one WebSocket to the API.
- Traefik must keep long-lived WebSockets open (already true for `/live/display`); the API pings every 25 s.
- The developing-photo state (`GalleryItem.pending`) and any "new items" or connection indicator on `/gallery` are UI decisions left to design review; the data is exposed by `useLiveGallery`.
