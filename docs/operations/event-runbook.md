# Event Runbook
Ceremony-day operational source of truth.
## Preflight
Verify public site/invitations, backup, venue internet/local network, media uploads, translation audio/latency, printer queue and projector/display. Keep static event information and fallback QR codes available.
## Takedown requests

A guest or subject asks an admin to remove a photo or wish. Consent model and retention are decided in `docs/product/principles.md` (§8).

1. Hide the photo/wish immediately from gallery, display feed and wishes list (admin moderation action).
2. Delete the derivative(s) and, once confirmed, the original from Garage.
3. Delete the same object from the offsite mirror (nhientruong04's server, reached over Tailscale) on its next sync, or manually if urgent.
4. Confirm removal back to the requester.

No automatic expiry: the archive is otherwise kept for four years from the ceremony date.

## Incident priority
1. Guest/event information and pass access.
2. Venue network/core API.
3. Camera/media.
4. Translation.
5. Printing.
6. Decorative/3D experiences.

Experimental systems may be disabled without affecting critical flows.
