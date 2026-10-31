# ADR-015: Guest self-registration through a graduate's join link
Status: Proposed
Date: 2026-10-31
## Context
Until now every invitation was typed in by an admin, one guest at a time (#32, #42), and graduates never signed in. With three weeks to the ceremony the owner wants graduates to collect their own guests: each graduate gets a personal link, shares it, and their family and friends register themselves with a name and email.

The owner decided (2026-10-31):
- a graduate gets their link by email, by typing the address an admin stored for them;
- a guest who registers is invited at once and emailed their invitation link, with no approval step;
- there is no cap on guests per graduate;
- the form asks for name and email only; RSVP, plus-ones and needs stay on the invitation page.
## Decision
- **One join link per graduate.** `users.join_code` (migration 0010) holds a 64-bit random base64url code; the link is `{PUBLIC_ORIGIN}/join/{code}`. The code is stored as is, not hashed. It is meant to be posted in family chats, it lets someone do exactly one thing (register as this graduate's guest), it reads nothing back, and keeping it lets a graduate ask again and get the same link without breaking the copies already shared. It is not a bearer credential like the invitation token, so it may appear in request logs as part of the URL; guest names and addresses never do.
- **Graduates ask for it on `/graduate`.** `POST /join-links/request` answers 202 before looking anything up, whatever the address, so neither the answer nor its timing tells a stranger who is a graduate. The link goes only to the graduate's stored address, in the language of the page they asked from. The code is issued on the first request. One address may ask 3 times a day; more requests are dropped quietly so the form can't flood an inbox.
- **Guests register on `/join/{code}`.** `GET /join/{code}` gives the graduate's name for the heading. `POST /join/{code}` creates a guest and an invitation (`max_plus_ones` 0: each companion can register with their own name) with the graduate as inviter, and emails the invitation link like an admin issue does (ADR-012, ADR-013). The answer is the same whether the address was new or already invited, so the form can't be used to check who is invited:
  - an address with an active invitation is not invited twice: the graduate is added as a co-inviter (the existing joint-invitation model) and no email is sent;
  - a transaction-scoped advisory lock on the address keeps simultaneous submissions to one invitation;
  - if the invitation email can't be sent, the guest and invitation are deleted (the token went nowhere) and the guest is told to try again;
  - while mail is off, the form isn't shown and the API answers 503, because an invitation whose link can't be delivered is useless.
- **Abuse brakes, not caps.** 60 registrations per link per hour (in memory, per API process), a hidden honeypot field, and the address must look valid. The admin can reset a link (`POST /admin/graduates/{id}/join-link`) when it leaks to people it shouldn't; registered guests keep their invitations.
- **Admins see the link.** `GET /admin/graduates` returns `joinUrl`; the graduate's edit page shows it with Copy and Create / Reset, so an organizer can hand it over if the email doesn't arrive.
- **Audit.** `graduate.join_link_issue`, `graduate.join_link_rotate`, `invitation.join_create`, `invitation.join_add_inviter` and `invitation.join_discard`, with actor `join-link` for guest-driven writes. Ids only.
## Alternatives considered
- Graduates sign in (magic-link session) and manage their guests: more useful, much more to build and secure three weeks out. Not chosen; the link can grow into it later.
- Admin or graduate approval before an invitation is sent: safer against strangers, but slower for guests and more work for the people approving. Not chosen by the owner.
- Hashing the code like invitation tokens: then a second request would have to issue a new code and break every copy already shared. Rejected.
- A per-graduate guest cap: not wanted by the owner. The rate limit and admin reset handle abuse.
## Consequences
- Anyone holding a graduate's link can register. A leaked link is reset by an admin; the guests it created stay and can be revoked one by one on `/admin/invitations`.
- Self-registered guest names are split automatically (`name_reviewed` false), so they show up under "Names to check" in the admin.
- The rate limits are per API process; with N replicas a link accepts up to N × 60 an hour. Fine for a cohort-sized event.
- Mail now gates guest registration as well as the invitation email: with SMTP down, `/join/{code}` says registration is closed for the moment.
- Guest-facing copy and the two pages are new UI built from the existing primitives (`Section`, `BrandEyebrow`, `Cta`, the venue form pattern); they need owner review under the design authority rule before launch. Neither page is linked from the menu yet.
