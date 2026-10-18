# Translation

Live captions for the ceremony (experimental, #18): venue audio in, numbered caption segments out to `apps/api`. Python, independently deployable, safe to switch off. It never touches the database or object storage, has no Ingress, and the rest of GRAD '26 works the same whether it runs or not.

Two programs live here:

- **`grad-translation`**, the service (#67). Runs on the GPU node; `apps/api` relays the venue audio to its `/ingest` WebSocket and it posts segments back to `POST /internal/translation/segments`.
- **`grad-capture`**, the venue capture client (#69). Runs on the AV laptop next to the mixer and streams the line-in to `WS /live/ingest` on the API, never to this service directly (ADR-007). Operating it on the day: `docs/operations/event-runbook.md`, "Live translation".

They share one package on purpose: the capture client and the service agree on the audio format, the framing and the acknowledgement scheme, and one test suite proves the whole path (capture → API proxy → service → segment POST) against a fake API. The capture client needs only `aiohttp` (plus `sounddevice` for a live input), so installing it on the laptop pulls in no ML libraries.

```text
mixer line-out ─▶ grad-capture ══WS /live/ingest══▶ apps/api ══WS /ingest══▶ grad-translation
                  (AV laptop)    SERVICE_TOKEN_INGEST          SERVICE_TOKEN_TRANSLATION
                                                    ◀── POST /internal/translation/segments ──┘
```

## Pipeline

```text
/ingest frames ─▶ ring buffer + energy VAD chunker ─▶ ResilientAsr (provider chain)
   ─▶ glossary correction ─▶ SentenceSegmenter ─▶ sequence number
   ─▶ per-language workers (de, en, vi) ─▶ SegmentPusher ─▶ API
```

- **Chunking.** An energy VAD cuts the stream at pauses (`CHUNK_PAUSE_MS`, 600 ms) into chunks of at most `CHUNK_MAX_MS` (12 s; a long run is cut at its quietest moment). A pause of `SENTENCE_PAUSE_MS` (1.5 s) also closes the open sentence. Chunks are only sample ranges into a bounded ring buffer (`RING_BUFFER_SECONDS`, 90 s).
- **ASR with failover.** `ASR_PROVIDERS` is an ordered chain. Each chunk gets a timeout per provider (`ASR_TIMEOUT_S`); a provider that fails three times in a row is skipped for 30 s (circuit breaker) and retried after. If every provider fails, the chunk is replayed from the ring buffer with backoff until it is more than `ASR_MAX_LAG_MS` (20 s) behind live, then dropped, so a GPU hiccup costs latency, not words, and a long outage never builds an unbounded backlog.
- **Sentences are never revised.** The segmenter keeps the unfinished tail pending across chunks and emits a sentence only when it ends (punctuation, aware of titles like "Prof." and "PGS."), passes 180 characters (split at a comma), changes language, or meets a long pause, a `gap` or a `stop`. An emitted sentence gets the next sequence number and is final.
- **Translations per language.** The caption in the spoken language is the transcript (`final`, provider = the ASR provider). Each other language has its own worker and queue, so a slow or broken language never holds up another. An error, a timeout (`MT_TIMEOUT_S`) or a backlog older than `MT_MAX_QUEUE_S` posts `failed` for that language ("translation unavailable"). With `MT_DRAFT_PROVIDER` set, a fast draft is posted first and the final replaces it.
- **Glossary.** `src/grad_translation/glossary.json` (or `GLOSSARY_PATH`) lists VGU names and programmes in de/en/vi with known mis-hearings. It biases Whisper (initial prompt), fixes aliases in transcripts ("Vietnam German University" → "Vietnamese-German University") and puts the target-language name in before translation.
- **Delivery.** Segments go to the API one at a time in sequence order. While the API is unreachable they wait in memory with exponential backoff and jitter (honouring `Retry-After`), up to `PUSH_QUEUE_MAX` (2000) segments, oldest dropped beyond that. A newer post for the same `(sessionId, sequence)` replaces the queued one. `400/409/413/415/422` are dropped (retrying can't help); everything else is retried.

## Providers

ASR and MT sit behind two small protocols in `src/grad_translation/providers/base.py`; the pipeline owns chunking, retries, failover and timeouts, so a provider only turns audio into text or text into text.

| Name | Kind | Notes |
| --- | --- | --- |
| `mock` | ASR, MT | Deterministic, no dependencies. ASR emits the next line of a script per chunk (`MOCK_ASR_SCRIPT` to change it); MT returns `[de] text`. Default outside the GPU image; segments say `provider: "mock"`. |
| `faster-whisper` | ASR | CTranslate2 Whisper. `WHISPER_MODEL=small` with int8 weights on CUDA by default, sized for the 6 GB GPU; `large-v3-turbo` in `int8_float16` (~1.6 GB) also fits next to NLLB if Vietnamese needs it. Detects English or Vietnamese per chunk unless the operator fixes it. |
| `nllb` | MT | NLLB-200-distilled-600M on CTranslate2, one model for every pair (en↔vi, en/vi→de), under 1 GB in int8. |

Adding a provider (a cloud service, say): implement the protocol in a new module, read its own settings from the environment, and add one line to the registry in `providers/__init__.py`. Then `ASR_PROVIDERS=cloud-x,faster-whisper` makes it primary with the GPU as fallback, or the other way round.

Model weights are cached under `MODEL_CACHE` (`/models`, the `translation-models` PVC in the cluster) and never baked into the image. Fill it once before the event:

```sh
uv run --extra gpu --with 'torch>=2.4' scripts/fetch-models.sh   # MODEL_CACHE=... to choose where
```

Whisper weights download ready-made; NLLB is converted from the official `facebook/` checkpoint (PyTorch is needed for that step only).

## Ingest protocol

The authoritative definition is `packages/contract/src/translation.ts` (`ingestControlMessageSchema`, `ingestStatusMessageSchema`, `ingestServiceMessageSchema`) and `docs/architecture/target/use-cases.md` §6.2. In short:

- **Auth.** The capture client opens `WS /live/ingest` with `Authorization: Bearer <SERVICE_TOKEN_INGEST>`. The API opens this service's `/ingest` with `Authorization: Bearer <SERVICE_TOKEN_TRANSLATION>`, which the service checks in constant time against its `SERVICE_TOKEN` (the same secret it uses to post segments). Unset `SERVICE_TOKEN` means no check (local dev only).
- **Audio.** Binary frames of raw PCM, 16 kHz, mono, s16le, no header. The capture client sends 100 ms (3,200 bytes) per frame; the API accepts 20–200 ms, at most 16 KiB, and relays frames verbatim and in order.
- **Capture client → service** (JSON text frames, relayed by the API):
  - `{"type":"start","sessionId":"ceremony","sourceLanguage":"vi","sampleRate":16000,"channels":1,"encoding":"s16le"}`: sent first on every connection; the API replays the last one after each reconnect to the service. All fields optional; no `sourceLanguage` means detect English or Vietnamese. A later `start` switches the language. Another audio format is refused with an `error` and close code `4415`.
  - `{"type":"stop"}`: the speaker is done; the open sentence closes now (and the service acknowledges everything).
  - `{"type":"gap","samples":N}`: the client dropped N samples it never sent (its buffer overflowed); the timeline skips ahead.
- **Service → capture client** (relayed by the API):
  - `{"type":"ready","sessionId":"ceremony-20261120T020000Z","resumed":false}` when a connection attaches.
  - `{"type":"ack","receivedSamples":N}` about every 250 ms: samples received on this service connection.
  - `{"type":"error","code":...,"message":...}` before the service closes the socket.
- **API → capture client:** `{"type":"status","upstream":"connected"|"unavailable","droppedFrames":N}` on connect and on change. Close `4001`: a newer capture client took over (exit, don't reconnect); `1001`: the API is restarting (reconnect).

**Sessions.** `sessionId` in `start` is a label (default `ceremony`, `SESSION_LABEL`). Segments are stored under `<label>-<UTC start time>`, so sequence numbers are gapless within a run and a restarted service starts a fresh session instead of colliding with what the API already stored. A session outlives connections: the capture client and the API both reconnect, and a new connection continues the same timeline and sequence. When a connection drops and nothing comes back within `DISCONNECT_FLUSH_S` (3 s), the open sentence is closed.

**Resending after a drop.** The capture client keeps every frame until an `ack` covers it. When the service connection is new (a reconnect to the API, or `status` flipping back to `connected`), it resends what wasn't acknowledged, then the audio buffered meanwhile at up to 4× real time. Frames are counted per service connection, so delivery is at-least-once: a drop can repeat up to ~250 ms of audio, never silently lose a sentence. While `upstream` is `unavailable` the client buffers instead of sending audio the API would drop. No acknowledgement for 5 s while audio is in flight counts as a dead socket.

**Segments.** `POST /internal/translation/segments` with `Authorization: Bearer <SERVICE_TOKEN>`, body `translationSegmentSchema`. A sentence is posted when it ends, with its source-language caption, and again as each translation lands (each post carries every translation known so far). The API merges per language: a `final` is never revised, a failure never hides a draft.

## Running it

Needs [uv](https://docs.astral.sh/uv/). On a Mac (no NVIDIA GPU) everything runs on the mock providers:

```sh
cd apps/translation
uv sync                                           # core + dev tools; add --extra gpu for the real models
SERVICE_TOKEN=$SERVICE_TOKEN_TRANSLATION pnpm serve     # mock pipeline on :8100, posting to API_INTERNAL_URL (default :4000)
```

In `.env` for the API, set `SERVICE_TOKEN_TRANSLATION`, `SERVICE_TOKEN_INGEST` and `TRANSLATION_INGEST_URL=ws://localhost:8100/ingest`, then stream a recording through the whole path:

```sh
CAPTURE_TOKEN=$SERVICE_TOKEN_INGEST uv run grad-capture --url ws://localhost:4000/live/ingest --file speech.wav
```

`--file` takes 16-bit WAV at any rate or channel count (converted on the fly) or raw 16 kHz mono s16le (`.raw`/`.pcm`); `--speed 10` plays faster, `--loop` repeats. Without the API, point `--url` at `ws://localhost:8100/ingest` with the service's token. Real models on CPU work too (`ASR_PROVIDERS=faster-whisper WHISPER_MODEL=base uv run --extra gpu grad-translation`), slowly.

`GET /healthz` is liveness; `GET /readyz` is 200 once an ASR provider has loaded and shows providers, queues, push state and sessions (never tokens or transcripts).

| Variable | Default | |
| --- | --- | --- |
| `PORT`, `HOST` | `8000`, `0.0.0.0` | `pnpm serve` uses 8100 to match the API's `.env.example` |
| `API_INTERNAL_URL` | `http://localhost:4000` | where segments are posted |
| `SERVICE_TOKEN` | unset | the API's `SERVICE_TOKEN_TRANSLATION`; posts segments and guards `/ingest` |
| `ASR_PROVIDERS` | `mock` (`faster-whisper` in the GPU image) | ordered failover chain |
| `MT_PROVIDER`, `MT_DRAFT_PROVIDER` | `mock` (`nllb` in the GPU image), unset | |
| `TARGET_LANGUAGES` | `de,en,vi` | |
| `SOURCE_LANGUAGE` | `auto` | `en` or `vi` to fix it; the operator can override live |
| `MODEL_CACHE` | `/models` | PVC with weights |
| `WHISPER_MODEL`, `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE` | `small`, `auto`, `auto` | `auto` = int8_float16 on CUDA, int8 on CPU |
| `NLLB_MODEL` | `nllb-200-distilled-600M-ct2-int8` | directory under `MODEL_CACHE` |
| `GLOSSARY_PATH`, `MOCK_ASR_SCRIPT`, `SESSION_LABEL` | bundled, bundled, `ceremony` | |
| `VAD_THRESHOLD_DBFS`, `CHUNK_*_MS`, `SENTENCE_PAUSE_MS` | -45, 600/300/12000, 1500 | chunking |
| `ASR_TIMEOUT_S`, `ASR_MAX_LAG_MS`, `MT_TIMEOUT_S`, `MT_MAX_QUEUE_S` | 15, 20000, 10, 20 | latency bounds |
| `PUSH_QUEUE_MAX`, `PUSH_BACKOFF_MAX_S`, `DISCONNECT_FLUSH_S` | 2000, 30, 3 | |

## Images

`Dockerfile` has two targets built from this directory: `gpu` (default; CUDA 12 + cuDNN 9 runtime, faster-whisper and NLLB) and `mock` (python:3.12-slim, mock providers). Both run as uid 1001 and listen on 8000.

```sh
docker build -t grad-translation apps/translation
docker build --target mock -t grad-translation:mock apps/translation
```

## Checks

`pnpm lint`, `typecheck`, `test` and `build` call `scripts/py.sh`, which runs ruff, mypy (strict), pytest and a wheel build through uv, and skips with a message on machines without uv. The `translation` CI job installs uv and runs them for real (`REQUIRE_UV=1`), plus a build of the mock image. The tests need no GPU, model or network: `tests/test_e2e.py` drives the capture client through a fake API (with the real API's takeover, status, start-replay and merge behaviour) into the service and checks the segments posted, including a capture-side network drop, a translation-service reconnect and the API being absent.
