# Printer daemon

Experimental (#19, #73). A small Node/TypeScript service that runs only at the
venue: it takes print jobs from the API's queue, prints the photo's display
derivative through CUPS or the thermal Receipt Photobooth, and reports the
outcome. Guests never talk to it, and when it is absent the queue simply waits;
nothing else depends on it, so its failure never affects event-critical flows.

```text
loop:  GET  /internal/print/jobs/next        (Bearer SERVICE_TOKEN; claims a job under a 5-minute lease)
       GET  job.imageUrl                     (the public `display` derivative, no credential)
       lp -n <copies> -t grad26-<jobId> …    (CUPS client, or a file in dry-run mode,
                                              or POST {PHOTOBOOTH_URL}/api/tickets once per copy)
       POST /internal/print/jobs/{id}/done   ({ result: "done" } or { result: "failed", error })
```

Wire shapes come from `packages/contract/src/print.ts` (`claimedPrintJobSchema`:
the job plus `imageUrl`, `variant`, `attempt`, `leaseExpiresAt` and the admin's
optional `options`: `layout`, `ascii`, `caption`). A lease that
runs out unreported puts the job back in the queue; after `PRINT_MAX_ATTEMPTS`
(3) claims the API marks it `failed`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_URL` | required | API base URL, e.g. `https://api.grad26.fuisloy.dev` |
| `SERVICE_TOKEN` | required | The API's `SERVICE_TOKEN_PRINTER`. Never logged |
| `PRINT_MODE` | `cups` | `cups` runs `lp`; `dry-run` writes `<jobId>.jpg` and `<jobId>.json` to `DRY_RUN_DIR`; `photobooth` sends jobs to the Receipt Photobooth (see Photobooth mode) |
| `DRY_RUN_DIR` | `./dry-run-output` | Dry-run output |
| `PRINTER_NAME` | CUPS default | `lp -d` queue |
| `LP_OPTIONS` | `fit-to-page` | Comma-separated `lp -o` options, e.g. `media=4x6,fit-to-page` |
| `CUPS_SERVER` | (CUPS default) | Read by `lp` itself; the venue overlay sets the host socket `/run/cups/cups.sock` |
| `STATE_DIR` | `/var/lib/grad-printer` | Journal and spool; must survive restarts |
| `POLL_INTERVAL_MS` | `3000` | Wait between polls while the queue is empty |
| `BACKOFF_MAX_MS` | `60000` | Cap of the exponential backoff (full jitter, from 1 s) after any error |
| `REQUEST_TIMEOUT_MS` | `15000` | Per API request |
| `LP_TIMEOUT_MS` | `60000` | Per `lp` call |
| `LEASE_MARGIN_MS` | `30000` | A claim is sent to the printer only while at least this much of its lease is left (covers clock skew with the API; keep the venue host on NTP) |
| `JOURNAL_RETENTION_HOURS` | `72` | How long settled journal entries are kept to recognise re-deliveries |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

Logs are JSON lines with job ids, phases and error summaries only: never the
token, never a photo's `publicId` (an unguessable link), never guest data.

## Photobooth mode

Experimental bridge to the venue's 80 mm thermal printer (Xprinter XP-Q80W).
That printer is driven by a separate local app, the **Receipt Photobooth**
(Python/FastAPI, its own repository), which composes a photo into a layout and
prints it over ESC/POS. With `PRINT_MODE=photobooth` the daemon hands each job's
`display` derivative to the booth instead of CUPS:

```text
POST {PHOTOBOOTH_URL}/api/tickets   multipart, once per copy (the booth has no copies field):
     photo, layout, orientation=portrait, caption, dither=atkinson, ascii_mode,
     include_quote, include_qr, strip_size=half, do_print=true, keep_original=false
```

The job's `options` (set by an admin in Moderation → Print…) choose the
`layout` (`polaroid`, `boarding`, `receipt`, `photo`, `strip`), `ascii_mode`
and `caption`; anything unset uses the variables below. Guest requests always
use the defaults. No guest name or email is sent, and the booth's answer (its
own keepsake token and share link) is neither logged nor kept.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PHOTOBOOTH_URL` | required in this mode | The booth's base URL on the laptop or LAN, e.g. `https://localhost:8000` |
| `PHOTOBOOTH_INSECURE_TLS` | `false` | `true` accepts the booth's self-signed certificate. It applies only to requests to the booth (a dedicated connection pool), never to the API or the rest of the process |
| `PHOTOBOOTH_DEFAULT_LAYOUT` | `polaroid` | Layout for jobs without one |
| `PHOTOBOOTH_CAPTION` | `GRAD '26 · VGU` | Caption for jobs without one (the strip layout prints none) |
| `PHOTOBOOTH_INCLUDE_QR` | `false` | The booth's QR links to its LAN address, which guests can't reach |
| `PHOTOBOOTH_INCLUDE_QUOTE` | `true` | The booth's quote of the day on layouts that have one |
| `PHOTOBOOTH_TIMEOUT_MS` | `60000` | Per booth request. The booth answers after printing (a polaroid takes about 4 s) |

How booth answers map onto the journal (see Idempotency). The request counts as
`submitting` from the moment it is sent:

| Booth answer | Outcome |
| --- | --- |
| `201` with `print.printed: true` | Copy confirmed. The count goes in the journal (`copiesPrinted`), then the next copy is sent |
| `201` with `print.dry_run: true` (booth started with `PRINTER_ENABLED=false`) | Counted as printed, with a warning in the log |
| Connection refused, host unknown or unreachable, TLS certificate refused, `502`/`503`/`504`, or `print.error` saying the booth sent "0 of N dot rows" (its printer is off or out of reach) | Nothing reached the printer. The job goes back to `received` and is retried with the usual backoff, starting at the first unprinted copy |
| `4xx` | Reported `failed` with the booth's reason, e.g. `Photobooth rejected the job (400): …` |
| Other `5xx`, a timeout or dropped connection after sending, a partial print, or an unexpected body | Reported `failed` and never resent, because it may have printed. If some copies did come out, the message starts with `Printed 1 of 2 copies;` |
| The daemon crashed mid-request | Reported `failed` on restart (`submitting`, as with `lp`) |

If the lease runs out while the booth is away, the claim is dropped unprinted as
usual. If some copies were already printed, the job is reported `failed` with
the count instead, so they are not printed again on the re-claim.

### Running it at the venue

The daemon and the booth run on the same venue laptop, so this mode runs
straight from the repository rather than as the venue-cluster pod:

```sh
# 1. The booth (in its own repository), pointed at the printer:
PRINTER_HOST=192.168.1.8 uv run python -m app     # serves https://localhost:8000 when certs/ exists
curl -k https://localhost:8000/api/status          # "printer": {"enabled": true, "reachable": true, …}

# 2. The daemon, from this repository:
pnpm install && pnpm --filter @grad/contract build
PRINT_MODE=photobooth \
PHOTOBOOTH_URL=https://localhost:8000 PHOTOBOOTH_INSECURE_TLS=true \
API_URL=https://api.grad26.fuisloy.dev SERVICE_TOKEN=<SERVICE_TOKEN_PRINTER> \
STATE_DIR="$HOME/.grad-printer" \
  pnpm --filter @grad/printer dev
```

Keep `STATE_DIR` on the laptop's disk: it holds the journal that prevents
double prints across restarts. At startup the daemon logs whether the booth
and its printer answer (`photobooth reachable`). To stop it, press Ctrl-C:
the job in hand finishes first, and queued jobs wait in the API. The event
runbook has the day-of checklist (`docs/operations/event-runbook.md`, Photo
printing).

## Idempotency

The goal is **at most one print per job id**, with the outcome reported **at
least once**. Every step is written to a small journal under `STATE_DIR` before
it is taken (one JSON file per job, replaced atomically), and journalled work is
always finished before a new job is taken:

| Journal phase when the daemon (re)starts | What it does |
| --- | --- |
| `received`: taken from the queue, nothing sent to CUPS | Downloads and prints it (nothing came out yet), if the lease still holds; otherwise see Leases |
| `submitting`: `lp` was running | Reports `failed` ("interrupted … not retried to avoid a duplicate print"); never reprints. An organizer checks the printer and re-queues if nothing came out |
| `printed`: CUPS accepted it | Reports `done` again; never reprints |
| `failed` | Reports `failed` again |
| `reported` | Nothing. If the API hands the same job id out again (a lost report, or a lease that ran out after printing), the recorded outcome is re-sent instead of printing |

An image URL that answers 4xx (photo hidden, removed or not processed) is
reported `failed` without printing; network errors, timeouts, 408, 429 and 5xx
are retried with backoff. An `lp` error (unknown printer, cupsd down) is
reported `failed` with `lp`'s message, since CUPS took nothing. Reports follow
the API's rules: the same result repeated is a 200 no-op, 409 (the job already
finished with a different result) and 404 (unknown job) count as settled, and
400/422 is logged and dropped so a malformed report cannot wedge the queue.

**Leases.** Each claim is held for the daemon until `leaseExpiresAt`
(`PRINT_LEASE_SECONDS`, 5 minutes); after that the API re-queues the job, and
any daemon may claim it again. So the daemon checks the lease twice, before the
download and again right before `lp`: with less than `LEASE_MARGIN_MS` left it
does not print, drops the journal entry without reporting, and prints the job
when the API hands it out again with a fresh lease (as attempt 2 or 3). Once
something was printed, the report is always sent, even after the lease ran out:
the API still accepts it for a re-queued job, and that is what keeps it from
being printed twice. Late reports are logged with `"late": true`.

The guarantee holds per `STATE_DIR`: losing the volume loses the memory of
which jobs printed. A claim the daemon never journalled (it crashed between the
API's answer and the first journal write) comes back after its lease and is
printed normally then.

## Local development

```sh
pnpm --filter @grad/printer test
# Against a local API (pnpm dev:api) with SERVICE_TOKEN_PRINTER set in .env:
API_URL=http://localhost:4000 SERVICE_TOKEN=<same value> PRINT_MODE=dry-run \
  STATE_DIR=.state pnpm --filter @grad/printer dev
```

The image (`ghcr.io/fuisl/grad-printer`, `docker build -f apps/printer/Dockerfile .`)
contains the CUPS client only. cupsd and the printer's driver run on the venue
host; the deployment repository's venue overlay (`workloads/venue/printer`)
mounts the host's CUPS socket and pins the pod to the labelled venue node. It is
never part of the home overlay (`docs/architecture/target/kubernetes-workloads.md` §7.6).
