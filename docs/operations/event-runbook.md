# Event Runbook
Ceremony-day operational source of truth.
## Preflight
Verify public site/invitations, backup, venue internet/local network, media uploads, translation audio/latency, printer queue and projector/display. Keep static event information and fallback QR codes available.

- **Fallback page.** When the API answers 502–504 or has no ready pod, Traefik serves a static page with the event facts and two QR codes (site, directions); it lives in the deployment repository (`workloads/home/fallback`). Check it the week before: `kubectl -n grad scale deploy/api-service --replicas=0`, open `https://api.grad26.fuisloy.dev/`, scale back to 1. If the date, time or address changed in the admin UI, update the page too.
- **Translation off switch.** `flux suspend kustomization translation`, then `kubectl -n grad scale deploy/translation --replicas=0` to free the GPU. `flux resume kustomization translation` brings it back. The API stays healthy and shows live captions as unavailable.
- **Printer.** Venue cluster only (`clusters/venue`, `workloads/venue/printer`). Before doors: a test print from the venue host (`lp -d <queue> test.jpg`), then one queued job end to end. Off switch: `flux suspend kustomization printer` and `kubectl -n print scale deploy/printer --replicas=0`; queued jobs wait in the API. `/admin/print` shows the queue live and says "Printer offline or queue waiting" when jobs sit queued with nothing printing. A job reported failed with "Interrupted while sending to the printer" may or may not have printed: check the tray before re-queueing it (`apps/printer/README.md`, Idempotency).

## Live translation

Experimental (#18); it may be switched off at any time without affecting anything else. Audio path: mixer → AV laptop running `grad-capture` → `WS /live/ingest` on the API → translation service on the GPU node → captions on phones and the display. Details and the protocol: `apps/translation/README.md`.

**Before the event (once).**

1. Fill the model cache on the GPU node: run `scripts/fetch-models.sh` in the translation image with the `translation-models` PVC at `/models`. A pod restart then never downloads anything.
2. Check `GET /readyz` on the translation service (from inside the cluster, e.g. `kubectl -n grad exec deploy/translation -- python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/readyz').read().decode())"`): `"status": "ready"` and `faster-whisper:…` loaded. A `mock` provider here means fake captions: fix the env before the ceremony.
3. Install the capture client on the AV laptop (needs [uv](https://docs.astral.sh/uv/) and a checkout of the repo): `cd apps/translation && uv sync --extra capture`. Put the capture token (`SERVICE_TOKEN_INGEST` from the cluster Secret) in a file only you can read, e.g. `~/.grad-capture-token` with `chmod 600`. Never paste it on the command line or in chat.
4. Wire the mixer's line or aux out into the laptop's line-in or a USB audio interface. Disable the laptop's sleep, screen lock and automatic updates; plug it into power, and use Ethernet if the venue has it.

**Rehearsal and on the day.**

1. Find the input: `uv run grad-capture --list-devices`. Note the index of the line-in or interface.
2. Start streaming: `uv run grad-capture --url wss://api.grad26.fuisloy.dev/live/ingest --token-file ~/.grad-capture-token --device <index>`. Add `--channel 1` if the mixer sends a different signal on each stereo channel, and `--language en` or `--language vi` if only one language will be spoken.
3. Read the status line, printed every 5 seconds:
   - `● live 00:12 | peak -18.0 dBFS | buffer 0.2/10 s | ...`: streaming. Speech should peak around -25 to -6 dBFS. `no signal` means nothing comes in (check the cable, the mixer's aux send and `--device`); near 0 dBFS means clipping (lower the mixer send).
   - `○ connected to the API, translation service unavailable`: the laptop is fine; the GPU service is down or restarting. Audio is buffered (10 s) and sent when it is back.
   - `○ offline, retry in 2.0 s`: the network or the API is down. The client reconnects by itself with backoff and resends what didn't arrive; nothing to do for a short drop.
   - `LOST 12.0 s`: an outage outlasted the buffer and that much audio was dropped. Captions resume on their own.
4. Who is speaking: type `vi`, `en` or `auto` and Enter in the capture window to tell the service the language (auto-detection works but a fixed language is more reliable for a long speech).
5. Rehearse with a recording when the hall is empty: `uv run grad-capture --url … --token-file … --file rehearsal.wav` and watch the captions page.

**When something is wrong.**

| Symptom | Action |
| --- | --- |
| `the API refused the capture token (HTTP 401)` | Wrong or missing token file, or `SERVICE_TOKEN_INGEST` unset on the API. Fix the file and restart. |
| `another capture client took over the input; exiting` | A second laptop (or a second copy) connected; the newest wins. Close the extra one, then restart this one if it should be the input. |
| Status stays `translation service unavailable` | `kubectl -n grad logs deploy/translation`; check `/readyz`. A GPU or driver failure only affects translation. |
| Captions wrong language or garbled | Set the language explicitly (`en`/`vi`); check the level isn't clipping. |
| Captions late by more than ~20 s | The GPU is falling behind; the service drops audio it can't catch up on, so it recovers by itself. If it persists, switch to a smaller `WHISPER_MODEL`. |
| Translation causing any trouble at all | `flux suspend kustomization translation`, then `kubectl -n grad scale deploy/translation --replicas=0` (suspend alone leaves the pod running; reverse with `resume`), and stop the capture client. Phones show "translation unavailable"; nothing else changes. |

Stop the capture client with Ctrl+C after the last speech.

## Takedown requests

A guest or subject asks an admin to remove a photo or wish. Consent model and retention are decided in `docs/product/principles.md` (§8).

1. Hide the photo/wish immediately from gallery, display feed and wishes list: `/admin/moderation`, then Hide (or Remove for a takedown request). It works from a phone; the cached gallery and wishes listings are revalidated at once.
2. Delete the derivative(s) and, once confirmed, the original from Garage.
3. Delete the same object from the offsite mirror (nhientruong04's server, reached over Tailscale) on its next sync, or manually if urgent.
4. Confirm removal back to the requester.

No automatic expiry: the archive is otherwise kept for four years from the ceremony date.

After a takedown, also make a new archive export and delete older exports, which still hold the item (`operations/archive.md` §2).

## After the ceremony

Accessibility needs (#176) were collected for the day only. Once the event is over, and before the first archive export, delete them (`DELETE FROM rsvp_accessibility;`, data-model.md) and note it in the team channel. Earlier, on a guest's request, delete just theirs.

Once uploads stop: make the first encrypted archive export, copy it offsite and run the restore drill (`operations/archive.md`). Repeat the restore check yearly for the four years and note the date and result here.

## Incident priority
1. Guest/event information and pass access.
2. Venue network/core API.
3. Camera/media.
4. Translation.
5. Printing.
6. Decorative/3D experiences.

Experimental systems may be disabled without affecting critical flows.
