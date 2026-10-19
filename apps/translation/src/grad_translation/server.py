"""HTTP surface of the translation service (cluster-internal only, no Ingress).

- ``GET /ingest``: the audio WebSocket. Only apps/api connects to it, relaying
  the venue capture client (ADR-007), with ``Authorization: Bearer`` set to the
  translation service token. One input at a time: a new connection takes over
  and the previous one is closed with 4001, like the API does for capture clients.
- ``GET /healthz``: liveness, always cheap.
- ``GET /readyz``: 200 once at least one ASR provider has loaded, with provider,
  push-queue and session status (no secrets, no transcript text).
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from typing import Any

from aiohttp import WSMsgType, web

from .asr import ResilientAsr
from .audio import SAMPLE_RATE, SAMPLE_WIDTH
from .config import Settings
from .glossary import Glossary
from .pipeline import Session, TranslationService, session_label
from .protocol import (
    CLOSE_REPLACED,
    CLOSE_SHUTTING_DOWN,
    Gap,
    ProtocolError,
    Start,
    Stop,
    encode,
    error,
    parse_control,
    parse_json,
)
from .providers import create_asr_providers, create_mt_provider
from .pusher import SegmentPusher
from .translate import ManagedTranslator

log = logging.getLogger(__name__)

SERVICE_KEY = web.AppKey("service", TranslationService)
ACTIVE_KEY = web.AppKey("active", dict)

ACK_EVERY_SAMPLES = 4_000  # acknowledge about every 250 ms of audio
# The API caps audio frames at 16 KiB (INGEST_MAX_FRAME_BYTES) and text at 4 KiB; allow headroom.
MAX_FRAME_BYTES = 64 * 1024


def _authorized(request: web.Request, token: str | None) -> bool:
    if not token:
        return True
    header = request.headers.get("Authorization", "")
    scheme, _, presented = header.partition(" ")
    if scheme.lower() != "bearer" or not presented:
        return False
    return hmac.compare_digest(presented.strip().encode(), token.encode())


async def ingest(request: web.Request) -> web.StreamResponse:
    service = request.app[SERVICE_KEY]
    if not _authorized(request, service.settings.service_token):
        return web.json_response({"error": "Unauthorized", "message": "Invalid service token"}, status=401)

    ws = web.WebSocketResponse(heartbeat=20.0, max_msg_size=MAX_FRAME_BYTES)
    await ws.prepare(request)
    active: dict[str, Any] = request.app[ACTIVE_KEY]
    previous: web.WebSocketResponse | None = active.get("ws")
    active["ws"] = ws
    if previous is not None and not previous.closed:
        log.info("a new ingest connection took over from the previous one")
        await previous.close(code=CLOSE_REPLACED, message=b"replaced by a newer ingest connection")

    session: Session | None = None
    received = 0  # samples received on this connection
    acked = 0

    async def attach(label: str | None) -> Session:
        nonlocal session
        name = session_label(label, service.settings.session_label)
        target = service.session(name)
        if session is not target:
            if session is not None:
                session.detach()
            session = target
            ready = session.attach()
            await ws.send_str(encode(ready))
            log.info("ingest attached to %s (resumed=%s)", session.session_id, ready["resumed"])
        return target

    async def ack() -> None:
        nonlocal acked
        acked = received
        await ws.send_str(encode({"type": "ack", "receivedSamples": received}))

    try:
        async for msg in ws:
            if msg.type == WSMsgType.BINARY:
                # Audio before any `start` is fine: default session, auto language.
                current = session or await attach(None)
                received += len(msg.data) // SAMPLE_WIDTH
                current.feed(msg.data)
                if received - acked >= ACK_EVERY_SAMPLES:
                    await ack()
            elif msg.type == WSMsgType.TEXT:
                data = parse_json(msg.data)
                if data is None:
                    continue
                control = parse_control(data)
                if isinstance(control, Start):
                    current = await attach(control.session)
                    current.set_language(control.language or service.settings.source_language)
                elif isinstance(control, Stop):
                    if session is not None:
                        session.flush()
                    await ack()
                elif isinstance(control, Gap):
                    (session or await attach(None)).gap(control.samples)
                # Unknown types are ignored so either end can be newer than the other.
            elif msg.type == WSMsgType.ERROR:
                log.warning("ingest socket error: %s", ws.exception())
    except ProtocolError as err:
        log.warning("ingest protocol error: %s", err)
        if not ws.closed:
            await ws.send_str(error(err.code, str(err)))
            await ws.close(code=err.close_code, message=err.code.encode())
    finally:
        if active.get("ws") is ws:
            active.pop("ws", None)
        if session is not None and active.get("ws") is None:
            session.detach()
        log.info("ingest connection closed after %d s of audio", received // SAMPLE_RATE)
    return ws


async def healthz(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok"})


async def readyz(request: web.Request) -> web.Response:
    service = request.app[SERVICE_KEY]
    ready = service.asr.ready
    body = {"status": "ready" if ready else "loading", **service.status()}
    return web.json_response(body, status=200 if ready else 503)


def build_service(settings: Settings) -> TranslationService:
    asr = ResilientAsr(create_asr_providers(settings), timeout_s=settings.asr_timeout_s)
    final = ManagedTranslator(create_mt_provider(settings, settings.mt_provider))
    draft = (
        ManagedTranslator(create_mt_provider(settings, settings.mt_draft_provider))
        if settings.mt_draft_provider
        else None
    )
    glossary = Glossary.load(settings.glossary_path)
    pusher = SegmentPusher(
        settings.segments_url,
        settings.service_token,
        max_pending=settings.push_queue_max,
        backoff_max_s=settings.push_backoff_max_s,
    )
    return TranslationService(settings, asr, final, draft, glossary, pusher)


def create_app(settings: Settings, service: TranslationService | None = None) -> web.Application:
    app = web.Application()
    app[SERVICE_KEY] = service or build_service(settings)
    app[ACTIVE_KEY] = {}
    app.router.add_get("/ingest", ingest)
    app.router.add_get("/healthz", healthz)
    app.router.add_get("/readyz", readyz)

    async def on_startup(app: web.Application) -> None:
        await app[SERVICE_KEY].start()

    async def on_shutdown(app: web.Application) -> None:
        ws = app[ACTIVE_KEY].get("ws")
        if ws is not None and not ws.closed:
            await ws.close(code=CLOSE_SHUTTING_DOWN, message=b"shutting down")

    async def on_cleanup(app: web.Application) -> None:
        await asyncio.shield(app[SERVICE_KEY].stop())

    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    app.on_cleanup.append(on_cleanup)
    return app
