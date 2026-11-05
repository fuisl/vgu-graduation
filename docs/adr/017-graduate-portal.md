# ADR-017: Graduate portal, signed in by email
Status: Proposed
Date: 2026-11-05
## Context
ADR-015 gave each graduate a join link and deliberately stopped there: graduates could not see who registered, and "graduates sign in and manage their guests" was listed as too much to build at that point. The owner now wants that dashboard: who a graduate's guests are, whether they have answered, and a way to invite or remove them, mostly from a phone.

The owner set two constraints:
- **Nothing rotates.** Nothing here may rotate, replace or invalidate a join code or an invitation token. Links people already hold keep working.
- **The join code is not a credential.** It is shared widely and is public. An invitation token isn't a graduate credential either.
## Decision
**Sign-in is by email, on the existing form.** `/graduate` and `POST /join-links/request` keep their properties: always 202, answered before the lookup and the send, 3 per address per day. The email they send keeps the same join link and gains a second one, "Open your guest dashboard", carrying a new 128-bit token. Only its SHA-256 hash is stored, in `graduate_sign_in_tokens` (migration 0011). It works once, for 30 minutes. A new request adds a token and leaves earlier ones valid until they expire. While mail is off the form shows the organizers' note, as before.

**Opening the link spends nothing.** Mail scanners and link previews follow links, so a GET can't be what uses a token up (ADR-013 rejected one-click RSVP links for the same reason). The link is a two-step flow:
1. `GET /graduate/sign-in/{token}` moves the token into a 30-minute HttpOnly cookie (`grad_sign_in`, path `/graduate/sign-in`) and answers 303 to `/graduate/sign-in`, the same first hop as `/invite/{token}`. It calls no API. The token leaves the visible URL, history and Referer at once.
2. `/graduate/sign-in` shows one button. Pressing it runs a Server Action, which calls `POST /graduate/sessions`. That POST spends the token and opens a session, in one transaction; the `UPDATE ... WHERE consumed_at IS NULL` makes it single use under concurrency.

A scanner that follows the link only sets a cookie in its own jar. A scanner that also runs JavaScript and presses buttons would spend the token; the graduate then sees "this link can't be used" and asks for a new one. We accept that as rare.

**A session is a separate credential.** `graduate_sessions` (also migration 0011) holds the hash of another 128-bit token, for 30 days, not sliding, revocable with `revoked_at`. The browser keeps it in `grad_portal`: HttpOnly, Secure in production, SameSite=Lax, path `/graduate`. Sign-out revokes the row and drops the cookie. If the API can't be reached during sign-out the cookie still goes, and the row expires by itself.

**Credentials don't cross.**
- The portal API takes the session only as `Authorization: Bearer`, sent by the web BFF. It reads no cookie.
- Invitation tokens, admin JWTs, join codes and sign-in tokens are not known sessions, so they get 401 on `/graduate/*`. A session token is not a known invitation or a valid JWT, so it gets 404 on guest routes and 401 on admin routes. Sessions and sign-in tokens live in two tables so that one can't be presented as the other.

**Cookie scope (ADR-003).** `inv` is scoped to `.grad26.fuisloy.dev` because the browser also talks straight to the API with it (uploads, streams). The portal has no browser-direct traffic, so its cookies set no `Domain` and are host-only on the web host. That is narrower than ADR-003 allows and doesn't depend on `COOKIE_DOMAIN`.

**CSRF.** Every write goes through a Server Action, as other cookie-authenticated writes do: Next compares `Origin` with the host before it runs one, and the cookie is SameSite=Lax. The API host has no ambient credential to abuse, because it reads no cookie.

**The dashboard** is `/graduate/dashboard`: no-store, noindex (metadata and `X-Robots-Tag`), `Referrer-Policy` no-referrer. Summary counts come from the same list it shows. A failed read degrades that section only.

**A write returns the fresh list.** The invite and remove actions return the guest list with their answer, and a small client provider holds it for the summary and the list. `revalidatePath` and `router.refresh()` were tried first: in the production build the refreshed tree was sometimes never committed (the response carried the new guest, the page didn't change, a reload fixed it). The cause was found later: a lost wake-up in the React that Next 15 bundles (ADR-018). The dashboard keeps this design, which also sends far less over a venue network than a refreshed page.

**Privacy.** A graduate reaches guests only through their own `invitation_inviters` rows. Someone else's guest is 404, including on remove. The list carries the invitation id, name, email, status, answered date and `removal` (what removing them would do), against a strict contract schema. It has no accessibility needs, dietary needs, notes, plus-ones, tokens, photos, wishes or other inviters. `removal` can imply that another inviter exists, never who: the removal confirmation needs it. Only invitations with status `active` are listed.

**Inviting** reuses `JoinService` registration with the graduate taken from the session: a new address gets an invitation by email, an already-invited address gets this graduate as co-inviter and no email, and a failed send keeps nothing. Unlike the public join form, the answer says which happened (`invited` or `already_invited`), because the graduate must know whether an email went, and the guest appears on their list either way.

**Removing (owner's decision, 2026-11-05, replacing the first rule).** Who added the link decides. `invitation_inviters.added_by` and `invitations.created_by` (migration 0012) are each `admin` or `graduate`:
- **A link an admin added can't be removed by the graduate.** The API answers 403 and changes nothing. The dashboard shows "Added by the organizers" and no Remove button. Typing that guest's address changes nothing: the link stays admin-added.
- **A link the graduate added**, through their join link or the invite form, can be removed. The graduate leaves the guest's inviters, in one transaction with an audit row (`invitation.graduate_remove_inviter`, actor `graduate:{id}`, ids only).
- **A graduate can never revoke an admin-created invitation.** A graduate who became a co-inviter of one by typing its address takes away only their own link, even as the last inviter. The invitation stays active with no inviters, and an admin can still revoke it.
- **The last graduate out of a graduate-created invitation** revokes it, by the same code an admin revoke uses (`invitation.revoke`), so the link stops working. The token hash isn't touched and the RSVP stays. If another inviter remains, the invitation is untouched.

**Backfill.** Existing rows start as `admin`, the safe direction. Only what the audit table proves moves to `graduate`: `invitation.join_create` or `invitation.join_add_inviter` for that invitation and that graduate, from actor `join-link` or `graduate:{id}`, with a `created_at` exactly equal to the row's. Registration writes both in one transaction and both take `now()`, the transaction's start, so the times match only for the row that audit entry created. No audit row, or any doubt, stays `admin`. During a rollout an old API process still writes rows with the default, also `admin`: a guest registered in those seconds would be refused removal, and that is the safe way to be wrong.

The address lock from `JoinRepository.register` and a row lock keep a simultaneous join or a second removal from leaving an active invitation with no inviters. The confirmation says which case applies. Inviting the same address again later creates a new invitation with a new link and a new answer.

**No rotation, so no resend.** Only the hash of an invitation token is stored, so an existing guest's email can't be sent again without rotating the token, which would break the link they hold. The portal has no resend action, and the form says an invitation is emailed only once and to ask the organizers about a lost one. The portal never calls `JoinService.rotate` or the invitation rotate path. A test runs the whole journey and compares every join code and token hash before and after. Join links are read with `ensureJoinCode` semantics: issued if absent, never replaced.

**Rate limits**, in memory per API process like the others:
- `POST /graduate/guests`: 20 per graduate per hour, plus 300 invitation emails per day across the portal, which leaves room under Gmail's 500 for other mail. An already-invited address spends no daily budget but still counts per graduate, so the form isn't a fast way to test addresses. Failed sends are refunded.
- `DELETE /graduate/guests/{id}`: 60 per graduate per hour. A refused removal counts.
- `POST /graduate/sessions` has no limit: guessing a 128-bit token is hopeless, each real token works once, and all calls arrive from the BFF's address, so a shared limit would let a stranger block every sign-in. `DELETE /graduate/sessions/current` needs a live session and sends nothing.
## Alternatives considered
- Spending the token on the GET: scanners would lock graduates out, and the limit of 3 requests a day makes that expensive. Rejected.
- Reusable sign-in links until they expire: nothing to spend, so a retried request is harmless, but a leaked email grants a session for 30 minutes. Rejected in favour of single use.
- The token in the URL fragment, read by client JavaScript: it never reaches server logs, but it needs JavaScript and is a different pattern from `/invite/{token}`. Rejected. The path token is exposed to the web host's request logs like an invitation token already is, and here it lasts 30 minutes.
- Treating the join code as the sign-in: it is public by design (ADR-015). Rejected by the owner.
- Reusing the invitation session or `inv`: a graduate isn't necessarily a guest, and mixing them would let either credential open the other's routes. Rejected.
- A parent-domain cookie like `inv`, read by the API: wider scope, and a CSRF surface on the API host, for no benefit. Rejected.
- A resend that rotates the token: forbidden by the owner, and it would silently break the link the guest holds.
## Consequences
- **An existing guest's invitation email can't be resent from the portal.** A guest who lost it needs an organizer, whose only tool (rotate and re-send) replaces their link; that is an admin decision outside this feature.
- Sign-in shares the 3-a-day limit with the join link request. A graduate who burns three links in a day waits, and the form doesn't say so, because it must answer the same for everyone. Sessions last 30 days, so this should be rare.
- An admin-created invitation can end up active with no inviters, when its last co-inviter leaves. It shows no "invited by" line and stays on the admin list. A graduate who was on it can't see it any more.
- A graduate who asks to remove a guest the organizers added has to ask the organizers, and there is no self-service path. An admin can revoke the invitation, but no admin screen removes a single inviter yet.
- A graduate who types an address that is already invited becomes a co-inviter and then sees that guest's stored name, email and RSVP status, with no notice to the guest or the other inviter. The join link allows the same linking by anyone holding it (a stranger can't read it back, but the graduate can). This follows the requested co-inviter rule; the owner should confirm it is acceptable.
- Graduates now hold a credential that can trigger email from the owner's Gmail. The limits above bound it, and a session can be revoked in the database. There is no admin screen for sessions yet.
- The rate limits are per API process; with N replicas they are N times as large.
- New UI built from existing primitives needs owner review under the design authority rule: several adjacent white bands separated by a hairline, three summary counts in the greeting band, and a removal confirmation that opens in the row instead of a dialog (the site has no brand dialog).
