# ADR-019: Public posting of wishes and photos
Status: Accepted
Date: 2026-11-18
## Context
Until now only invited guests could post: `POST /wishes` and `POST /media` required the invitation credential, and the trust model of principles §8 ("the guest list is small and trusted, so nothing is reviewed before display") rested on that. Reading was already public (decided 2026-09-30).

The owner is making the site public so that classmates, friends and family without an invitation can join in. Strangers are not a trusted list, and the event display is on a big screen in the hall, so whatever they post needs a brake.

The owner decided (2026-11-18):
- wishes from anyone go live immediately;
- photos from people without an invitation are held for admin approval;
- invited guests keep today's behaviour (instant, no review, the 36-shot roll);
- abuse is held back by per-IP rate limits and a word filter.
## Decision
- **The credential is optional on both endpoints.** A valid one behaves as before. No credential, or an invalid, revoked or expired one, makes the post anonymous: a stale `inv` cookie must never block posting, so the API does not answer 401/404/410 there any more.
- **Anonymous wishes** carry an `authorName` the writer types (1 to 60 characters after trimming; 400 without it) and are stored with `invitation_id` null. They are visible at once, like guests' wishes, and moderated afterwards.
- **Anonymous photos** are stored with `invitation_id` null and the new moderation state `pending` (migration `0011`, CHECK widened). The worker still makes their derivatives, so admins can preview them, but `GET /gallery`, `GET /gallery/public`, the live feed (`/live/gallery`, `/live/display`) and `GET /media/{publicId}/{variant}` treat `pending` like `hidden`: never listed, never served. `POST /admin/media/{publicId}/moderate` with `visible` approves (audited `photo.moderate`, `from: pending`); `hidden` or `removed` rejects. Approval bumps `updated_at`, so the `NOTIFY grad_live` trigger (ADR-014) puts it on screen within a second. Nothing ever goes back to `pending`; the moderate body still only accepts `visible`, `hidden` and `removed`. The upload answer says which path it took: `reviewStatus` `visible` or `pending`, and `shotsRemaining` null without an invitation.
- **Admins see the queue.** `GET /admin/media?status=pending` lists waiting photos (with `invitationId` null), and `GET /admin/media/pending-count` returns `{ pending }` for an "N photos waiting" badge.
- **Rate limits per client IP**, only for anonymous posts: 5 wishes per 10 minutes and 10 photos per hour, `429` with `Retry-After`. The photo check runs before any bytes are read. Invited guests keep their per-invitation limits (5 wishes per 10 minutes, the 36-shot roll). Limits live in memory in the API process (`apps/api/src/rate-limit/sliding-window.ts`).
- **Real client IPs.** The API now sets Fastify's `trustProxy` from `TRUST_PROXY`, default one hop in production: Traefik (`externalTrafficPolicy: Local`) appends the peer it saw to `X-Forwarded-For`, and only that last entry is believed, so a client can't pick its own address by sending the header. The browser posts straight to `PUBLIC_API_ORIGIN` with `credentials: include` (ADR-003), not through the Vercel BFF, so the IP is the guest's and not Vercel's.
- **Word filter** (`apps/api/src/modules/wishes/word-filter.ts`): a short built-in list of English and Vietnamese profanity and slurs, matched as whole words after case folding. English and unambiguous toneless Vietnamese phrases ("dit me", chat abbreviations like "dcm") match with diacritics removed; single Vietnamese words whose toneless form is an everyday word ("đĩ"/"đi", "lồn"/"lon") match only with their tones. It checks the body and the author name of every wish, invited or not; anonymous wishes also may not contain a link (`scheme://` or `www.`). A refusal is `422` "This message can't be posted. Please rephrase it." and the text is never logged.
## Alternatives considered
- **Fully open and instant, photos included.** Simplest and most festive, but one stranger's photo could reach the hall's screen before anyone sees it, and a photo can't be word-filtered. Rejected by the owner for photos; accepted for wishes, which the filter and fast takedown cover.
- **Venue-only posting through a QR code** (a shared code shown in the hall, acting as a credential). Keeps strangers off the internet but excludes the people the change is for: friends and family who are not in the hall. A leaked code is also just a public link. Not chosen.
- **Pre-review everything from strangers, wishes too.** Safest, but wishes are the cheap, social part and would sit in a queue all day. The word filter and takedown were judged enough.
- **A shared rate-limit store (Redis or Postgres).** Exact across replicas, but a new dependency or a hot table for a single-replica API. Not now.
## Consequences
- **Moderation load.** Someone has to clear the photo queue during and after the ceremony; until they do, strangers' photos simply don't appear. The pending count makes the backlog visible on the dashboard.
- **Abuse risk is reduced, not removed.** A determined person with many addresses can post more wishes, and the filter misses creative spelling. Wishes still rely on fast takedown (hide is one click and leaves the feed within a second). The blocklist is deliberately short to avoid blocking a family member's wish; widen it only on evidence.
- **Single-replica assumption.** The limits are per API process; with N replicas an address gets N times the limit, and a restart forgets the windows. Fine for one replica; revisit if the API scales out.
- **Proxy configuration matters.** If anything is put in front of Traefik (a CDN, a tunnel), `TRUST_PROXY` must count it, or every request appears to come from that proxy and shares one limit. `TRUST_PROXY=true` would let clients spoof their address and must not be used.
- **Data model.** `photos.invitation_id` and `wishes.invitation_id` are nullable; anything joining them to invitations must expect null (the admin queue shows "No invitation"). No IP address or other identifier of an anonymous poster is stored.
- **Consent.** Strangers see the same consent notice at the point of upload (principles §8); takedown on request works the same way.
- **Web.** The posting forms, the "awaiting review" state for anonymous photos and the admin badge are UI work in `apps/web`, under design review like any new surface.
