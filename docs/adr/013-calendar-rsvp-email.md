# ADR-013: Branded HTML email and RSVP from the guest's calendar
Status: Accepted
Date: 2026-10-19
## Context
ADR-012 added three plain-text guest emails from the owner's Gmail. The owner then asked for two things: emails in the site's blue-and-white theme and font, and a way to RSVP from the email itself, in Gmail or any other mail app. On 2026-09-29 calendar RSVP buttons were ruled out, because calendar apps can only send their answer back by email and nothing read email then. Now the API sends from a real mailbox it can also read.

Two ways to RSVP from an email were weighed: buttons in the email that open the invitation with the answer filled in, or a real calendar invitation answered with the mail app's own Yes / Maybe / No. The owner chose the calendar invitation.
## Decision
- **HTML in the brand theme.** Every guest email is `multipart/alternative` with the plain text from ADR-012 and an HTML part rendered from the same content (`modules/mail/layout.ts`). It has a blue header band with the compact logo and a mono "GRAD '26" label, the event name in white, and a short accent rule. White language sections use mono uppercase labels and a When / Where table, and the button is the brand CTA (blue, white arrow tile). The colours are copied from `brand.css`. Tables and inline styles only, a 600px column that shrinks to a phone, and no script or tracking. Inter Tight and Geist Mono load from Google Fonts where the client allows web fonts (Apple Mail, iOS Mail, Thunderbird); Gmail and Outlook show Arial and the system monospace. All text is escaped, and only `http(s)` and `webcal` URLs become links.
- **The invitation email is a calendar invitation.** With `MAIL_CALENDAR_RSVP=true` it also carries an iTIP `METHOD:REQUEST` event (RFC 5546, sent as the `text/calendar` alternative per RFC 6047). The organizer is the sending mailbox and the guest is an `RSVP=TRUE` attendee. Gmail, Outlook and Apple Mail show Yes / Maybe / No and put the ceremony in the guest's calendar. Each invitation has its own UID (`invite-<invitationId>@grad26.fuisloy.dev`, not a credential), so a reply names its invitation. `SEQUENCE` follows the event's, so a later request replaces the entry.
- **The worker reads the replies.** When the guest answers, their mail app emails a `METHOD:REPLY` to the organizer. The worker polls the INBOX over IMAP (TLS, 993) every minute, with the same app password. It opens the mailbox read-only (EXAMINE), so no flags or messages change, and looks only at messages newer than its cursor (`mail_cursors`, migration 0007). It downloads only `text/calendar` and `application/ics` parts. A pass holds a Postgres advisory lock, so only one replica polls.
- **Only the invited guest can answer.** A reply counts when all of these hold:
  - its UID is one of ours;
  - its attendee is the address the invitation was mailed to and is also the From address;
  - the receiving server's own `Authentication-Results` (topmost, from `MAIL_AUTHSERV_ID`, default `mx.google.com`) shows DMARC pass or an aligned DKIM pass for that domain;
  - the invitation is active and unexpired.

  Yes sets `attending: true` and keeps plus-ones; No sets `attending: false` and clears them. Other RSVP fields, including accessibility needs, are untouched. Maybe changes nothing. A reply older than the RSVP already saved on the site loses. Applying a reply twice is a no-op.
- **Privacy.** Nothing about a mailbox message is stored or logged. The cursor holds two numbers, logs carry invitation ids, outcome counts and error codes, and imapflow's logger is off.
## Alternatives considered
- Buttons in the email that open the invitation with the answer filled in: works in every client, needs no inbox access and keeps plus-ones. Not chosen by the owner. It remains the fallback inside the email ("Open your invitation").
- One-click links that RSVP directly: link scanners (Outlook Safe Links, corporate gateways) open every link, so they would answer for the guest. Rejected.
- Gmail's own actions (schema.org `RsvpAction`, AMP for Email): require sender registration with Google and don't work in other clients. Rejected.
- Parsing free-text replies ("yes, two of us"): unreliable in two languages. Rejected.
## Consequences
- The API's worker can read the owner's whole mailbox. It only looks at calendar parts of new messages, but the app password grants full access, so treat it like the account password. Revoking it stops sending and reading at once.
- Calendar replies arrive in the INBOX. A Gmail filter that skips the inbox for them would hide them from the worker.
- Guests get a calendar entry at the placeholder time while `timeConfirmed` is false; the entry says "to be confirmed". When the time is confirmed, rotating and re-sending an invitation sends a request with the new `SEQUENCE`. A bulk "send calendar update to everyone" is not built yet.
- Calendar answers can't carry plus-ones; guests add them on the invitation page, and the email says so. "Maybe" isn't counted, and the email says that too.
- The worker needs egress on 993 as well as 587 (`allow-imap-egress`, worker only).
