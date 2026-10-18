# Printer daemon

Experimental (#19, #73). A small Node/TypeScript service that runs only on the
venue node: it takes print jobs from the API's queue, prints the photo's display
derivative through CUPS and reports the outcome. Guests never talk to it, and
when it is absent the queue simply waits; nothing else depends on it.

```text
loop:  GET  /internal/print/jobs/next        (Bearer SERVICE_TOKEN; the API marks the job `printing`)
       GET  /media/{photoPublicId}/display   (public derivative, no credential)
       lp -n <copies> -t grad26-<jobId> …    (CUPS client, or a file in dry-run mode)
       POST /internal/print/jobs/{id}/done   ({ result: "done" } or { result: "failed", error })
```

Wire shapes come from `packages/contract/src/print.ts` and `media.ts`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_URL` | required | API base URL, e.g. `https://api.grad26.fuisloy.dev` |
| `SERVICE_TOKEN` | required | The API's `SERVICE_TOKEN_PRINTER`. Never logged |
| `PRINT_MODE` | `cups` | `cups` runs `lp`; `dry-run` writes `<jobId>.jpg` and `<jobId>.json` to `DRY_RUN_DIR` |
| `DRY_RUN_DIR` | `./dry-run-output` | Dry-run output |
| `PRINTER_NAME` | CUPS default | `lp -d` queue |
| `LP_OPTIONS` | `fit-to-page` | Comma-separated `lp -o` options, e.g. `media=4x6,fit-to-page` |
| `CUPS_SERVER` | (CUPS default) | Read by `lp` itself; the venue overlay sets the host socket `/run/cups/cups.sock` |
| `STATE_DIR` | `/var/lib/grad-printer` | Journal and spool; must survive restarts |
| `POLL_INTERVAL_MS` | `3000` | Wait between polls while the queue is empty |
| `BACKOFF_MAX_MS` | `60000` | Cap of the exponential backoff (full jitter, from 1 s) after any error |
| `REQUEST_TIMEOUT_MS` | `15000` | Per API request |
| `LP_TIMEOUT_MS` | `60000` | Per `lp` call |
| `JOURNAL_RETENTION_HOURS` | `72` | How long settled journal entries are kept to recognise re-deliveries |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

Logs are JSON lines with job ids, phases and error summaries only: never the
token, never a photo's `publicId` (an unguessable link), never guest data.

## Idempotency

The goal is **at most one print per job id**, with the outcome reported **at
least once**. Every step is written to a small journal under `STATE_DIR` before
it is taken (one JSON file per job, replaced atomically), and journalled work is
always finished before a new job is taken:

| Journal phase when the daemon (re)starts | What it does |
| --- | --- |
| `received`: taken from the queue, nothing sent to CUPS | Downloads and prints it (nothing came out yet) |
| `submitting`: `lp` was running | Reports `failed` ("interrupted … not retried to avoid a duplicate print"); never reprints. An organizer checks the printer and re-queues if nothing came out |
| `printed`: CUPS accepted it | Reports `done` again; never reprints |
| `failed` | Reports `failed` again |
| `reported` | Nothing. If the API hands the same job id out again (a lost report), the recorded outcome is re-sent instead of printing |

A derivative that answers 4xx (photo hidden, removed or not processed) is
reported `failed` without printing; network errors, timeouts, 408, 429 and 5xx
are retried with backoff. An `lp` error (unknown printer, cupsd down) is
reported `failed` with `lp`'s message, since CUPS took nothing. A report the API
answers with 404 or 409 is treated as already settled; 400/422 is logged and
dropped so a malformed report cannot wedge the queue.

The guarantee holds per `STATE_DIR`: losing the volume loses the memory of
which jobs printed. A `printing` job the daemon never journalled (it crashed
between the API's answer and the first journal write) stays `printing` on the
API side until the API returns stale `printing` jobs to the queue (or an
organizer re-queues it); on that re-delivery the daemon prints it normally.

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
