# ADR-016: Yes / No links in the invitation email, calendar replies off by default
Status: Accepted
Date: 2026-11-05
Amends: ADR-013
## Context
ADR-013 made the invitation email a calendar invitation and had the worker read the replies from the organizer's INBOX. The owner reported that guests answer Yes or No on the invitation and the site doesn't update.

A search of the organizer's Gmail on 2026-11-05 found about 28 sent invitations and, over the last 30 to 60 days, no calendar replies, no inbound `.ics` attachments and no bounces, including in trash and spam. So replies are not reaching the mailbox the worker reads, and no change to the reply processing can fix that. The search can't tell whether Google handles the replies itself or guests simply didn't tap. The worker logged at `warn`, so its `calendar reply` lines were not visible in production either.

The owner had decided in advance what happens if calendar replies can't be made to work: put Yes and No in the email itself, which is the alternative ADR-013 weighed and kept as its fallback.
## Decision
- **Two links in the invitation email.** Each language section has **Yes, I will attend** and **No, I cannot attend** (brand primary and outlined buttons, plus plain-text equivalents). They open `/invite/<token>?answer=yes` or `?answer=no`. The values are the RSVP form's `attending` field (`INVITE_ANSWERS` in `@grad/contract`); the API's own field is a boolean. "Open your invitation" stays, as a text link, and links in emails already sent keep working.
- **The link pre-selects, the guest confirms.** `/invite/[token]` sets the `inv` cookie as before and carries a valid answer through its redirect (`/invite?answer=yes`, never the token). The form opens with that answer selected, says it isn't saved yet, and its button reads **Confirm answer**. Only submitting the form saves, through the same `PUT /rsvp` as any other answer, so plus-ones, dietary needs and accessibility needs work as usual and the same confirmation email follows.
- **A GET never writes an RSVP.** Mail link scanners fetch every link, so a write on GET would answer for the guest. ADR-013 rejected one-click links for this reason, and it still holds.
- **A saved answer is safe until the guest confirms.** A different answer from a link is shown as pending next to the saved one, with a line saying the saved answer stays until they confirm. An unknown or repeated `answer` is ignored, on the route and on the page. A retry after a temporary error keeps the answer. After a save the query is removed from the URL, so a reload shows the saved answer.
- **The calendar part is add-only by default.** With `MAIL_CALENDAR_RSVP` off (the default), the invitation attaches the same `METHOD:PUBLISH` file as the venue page's calendar email: `UID:event-1@…`, no organizer, no attendee, nothing to answer. Guests still get the event on their calendar and no longer see Yes / Maybe / No buttons that do nothing. While the time is unconfirmed the email also offers the `webcal://` feed, since the file alone won't update.
- **Calendar RSVP stays available.** With the flag on, the email carries the `METHOD:REQUEST` invitation and the worker polls for replies exactly as in ADR-013, and the Yes / No links are there as well. With it off, the poller doesn't start and the code stays dormant.
- **The calendar path is easier to diagnose and safer when on.** `not_ours` and rejected replies (`unauthenticated`, `wrong_attendee`, `inactive`) log at `warn` with ids and the outcome only. The ImapFlow client has an `error` listener, so a dropped socket can't crash the worker. An `applied` reply queues the same `mail.rsvp_confirmation` job as `PUT /rsvp`; if queueing fails the answer stays saved and a `warn` line says so.
## Alternatives considered
- Keep debugging calendar replies: the replies aren't in the mailbox, so there is nothing for the worker to read.
- One-click links that save on GET: link scanners would answer for guests. Rejected again.
- A one-click link followed by a POST from a script on the page: scanners that run scripts could still trigger it, and the guest would have no chance to add plus-ones or needs. Asking them to confirm costs one tap.
- Carrying the answer in a short-lived cookie instead of the URL: it would survive the language switch, but it would add state that outlives the visit for a value that isn't secret. `answer` holds only yes or no.
## Consequences
- Answering takes two taps, one in the email and one on the page, and works in every mail client with a browser.
- Invitations already sent have no buttons, and any that went out as calendar invitations still show dead Yes / Maybe / No in the guest's mail app and calendar. Their links still work. Only the token's hash is stored (ADR-012), so a new email with buttons needs a rotated link, which ends the old one.
- A guest who has both an earlier calendar invitation and a new email can end up with two calendar entries: the old one is per invitation (`invite-<id>@…`), the new one is the event's.
- The language switch returns to `/invite` without a query, by design (`safeReturnPath`), so switching language before confirming clears the pre-selection. Nothing is saved or lost; the guest picks again.
- Turning the flag off is a deployment change on both the API and the worker. Deploy this code first, or invitations go out for a while with neither calendar buttons nor email buttons.
- How mail apps show the `METHOD:PUBLISH` attachment was not tested in real clients for this decision. It is the attachment the venue email already sends.
## Amendment (2026-11-05)
Confirming an answer from a Yes or No link no longer leads to a confirmation email, and neither does a calendar reply (ADR-012 amendment). The saved state on the page is the confirmation.
