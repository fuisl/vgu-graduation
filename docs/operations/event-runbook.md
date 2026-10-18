# Event Runbook
Ceremony-day operational source of truth.
## Preflight
Verify public site/invitations, backup, venue internet/local network, media uploads, translation audio/latency, printer queue and projector/display. Keep static event information and fallback QR codes available.

- **Fallback page.** When the API answers 502–504 or has no ready pod, Traefik serves a static page with the event facts and two QR codes (site, directions); it lives in the deployment repository (`workloads/home/fallback`). Check it the week before: `kubectl -n grad scale deploy/api-service --replicas=0`, open `https://api.grad26.fuisloy.dev/`, scale back to 1. If the date, time or address changed in the admin UI, update the page too.
- **Translation off switch.** `flux suspend kustomization translation`, then `kubectl -n grad scale deploy/translation --replicas=0` to free the GPU. `flux resume kustomization translation` brings it back. The API stays healthy and shows live captions as unavailable.
- **Printer.** Venue cluster only (`clusters/venue`, `workloads/venue/printer`). Before doors: a test print from the venue host (`lp -d <queue> test.jpg`), then one queued job end to end. Off switch: `flux suspend kustomization printer` and `kubectl -n print scale deploy/printer --replicas=0`; queued jobs wait in the API. A job reported failed with "Interrupted while sending to the printer" may or may not have printed: check the tray before re-queueing it (`apps/printer/README.md`, Idempotency).
- **Accessibility needs.** The day before, print the admin "Access needs" page (`/admin/accessibility`, "Print for venue staff") for whoever sets up seating and greets guests at the entrance. Hand it over in person; don't send it as a photo or file.
## Takedown requests

A guest or subject asks an admin to remove a photo or wish. Consent model and retention are decided in `docs/product/principles.md` (§8).

1. Hide the photo/wish immediately from gallery, display feed and wishes list (admin moderation action).
2. Delete the derivative(s) and, once confirmed, the original from Garage.
3. Delete the same object from the offsite mirror (nhientruong04's server, reached over Tailscale) on its next sync, or manually if urgent.
4. Confirm removal back to the requester.

No automatic expiry: the archive is otherwise kept for four years from the ceremony date.

After a takedown, also make a new archive export and delete older exports, which still hold the item (`operations/archive.md` §2).

## After the ceremony

Accessibility needs (#176) were collected for the day only. Once the event is over, and before the first archive export, delete them (`DELETE FROM rsvp_accessibility;`, data-model.md) and note it in the team channel. Earlier, on a guest's request, delete just theirs. Shred any printouts of the admin "Access needs" page too.

Once uploads stop: make the first encrypted archive export, copy it offsite and run the restore drill (`operations/archive.md`). Repeat the restore check yearly for the four years and note the date and result here.

## Incident priority
1. Guest/event information and pass access.
2. Venue network/core API.
3. Camera/media.
4. Translation.
5. Printing.
6. Decorative/3D experiences.

Experimental systems may be disabled without affecting critical flows.
