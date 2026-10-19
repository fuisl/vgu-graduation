"""Synthetic audio, a contract checker and a fake apps/api for the tests."""

from __future__ import annotations

import asyncio
import contextlib
import json
import math
import socket
import struct
import wave
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiohttp
from aiohttp import WSMsgType, web

SERVICE_TOKEN = "svc-test-token"
CAPTURE_TOKEN = "capture-test-token"
RATE = 16_000


def tone(ms: int, freq: float = 220.0, amplitude: float = 0.3) -> bytes:
    """A speech-loud tone (about -13 dBFS RMS), as 16 kHz mono s16le."""
    n = RATE * ms // 1000
    peak = int(32767 * amplitude)
    return b"".join(struct.pack("<h", int(peak * math.sin(2 * math.pi * freq * i / RATE))) for i in range(n))


def silence(ms: int) -> bytes:
    return b"\x00\x00" * (RATE * ms // 1000)


def speech_script(bursts: int, *, burst_ms: int = 1_200, gap_ms: int = 800, tail_ms: int = 2_000) -> bytes:
    """``bursts`` utterances separated by short pauses, then a long pause that ends the last sentence."""
    out = silence(300)
    for i in range(bursts):
        out += tone(burst_ms)
        out += silence(gap_ms if i < bursts - 1 else tail_ms)
    return out


def write_wav(path: Path, pcm: bytes, *, rate: int = RATE, channels: int = 1) -> Path:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    return path


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port: int = s.getsockname()[1]
        return port


def check_segment(payload: dict[str, Any]) -> None:
    """Mirror of `ingestTranslationSegmentRequestSchema` (packages/contract/src/translation.ts)."""
    assert set(payload) == {
        "sessionId",
        "sequence",
        "startMs",
        "endMs",
        "sourceLanguage",
        "sourceText",
        "translations",
    }, payload.keys()
    assert isinstance(payload["sessionId"], str) and payload["sessionId"]
    for key in ("sequence", "startMs", "endMs"):
        assert isinstance(payload[key], int) and not isinstance(payload[key], bool) and payload[key] >= 0
    assert payload["endMs"] >= payload["startMs"]
    assert payload["sourceLanguage"] in ("en", "vi")
    assert isinstance(payload["sourceText"], str) and payload["sourceText"]
    assert isinstance(payload["translations"], list)
    for t in payload["translations"]:
        assert set(t) == {"language", "status", "text", "provider"}
        assert t["language"] in ("de", "en", "vi")
        assert t["status"] in ("draft", "final", "failed")
        assert t["provider"] is None or isinstance(t["provider"], str)
        assert t["status"] == "failed" or isinstance(t["text"], str)


def _replaces(current: dict[str, Any] | None, new: dict[str, Any]) -> bool:
    """apps/api's merge rule: a final is never revised, a failure never hides a draft."""
    if current is None:
        return True
    if current["status"] == "final":
        return False
    if current["status"] == "draft" and new["status"] == "failed":
        return False
    return current != new


@dataclass
class FakeApi:
    """Just enough of apps/api (#68), mirroring `IngestProxy` and the segment route.

    `WS /live/ingest`: newest capture client wins (the old one is closed with
    4001); `status` on connect and on every upstream change; the last `start`
    is replayed after each upstream (re)connect; audio is dropped, not queued,
    while the upstream is down; the service's JSON is relayed back.
    `POST /internal/translation/segments`: merge per language, `{segment, changed}`.
    """

    translation_ingest_url: str | None = None
    posts: list[dict[str, Any]] = field(default_factory=list)
    stored: dict[tuple[str, int], dict[str, Any]] = field(default_factory=dict)
    fail_next: int = 0
    unauthorized: int = 0
    # Fault injection, each fires once: drop the capture socket, or the upstream socket,
    # after this many audio bytes have been relayed.
    drop_capture_after_bytes: int | None = None
    drop_upstream_after_bytes: int | None = None
    capture_connections: int = 0
    upstream_connections: int = 0
    proxied_bytes: int = 0
    dropped_frames: int = 0
    _capture: web.WebSocketResponse | None = None

    def app(self) -> web.Application:
        app = web.Application()
        app.router.add_post("/internal/translation/segments", self._segments)
        app.router.add_get("/live/ingest", self._ingest)
        return app

    async def _segments(self, request: web.Request) -> web.Response:
        if request.headers.get("Authorization") != f"Bearer {SERVICE_TOKEN}":
            self.unauthorized += 1
            return web.json_response(
                {"error": "Unauthorized", "message": "Invalid service token"}, status=401
            )
        if self.fail_next > 0:
            self.fail_next -= 1
            return web.json_response(
                {"error": "Service Unavailable", "message": "Segment not stored; retry"},
                status=503,
                headers={"Retry-After": "5"},
            )
        payload = await request.json()
        check_segment(payload)
        self.posts.append(payload)
        key = (payload["sessionId"], payload["sequence"])
        changed = key not in self.stored
        merged = self.stored.setdefault(key, {**payload, "translations": []})
        by_lang = {t["language"]: t for t in merged["translations"]}
        for t in payload["translations"]:
            if _replaces(by_lang.get(t["language"]), t):
                by_lang[t["language"]] = t
                changed = True
        merged["translations"] = sorted(by_lang.values(), key=lambda t: t["language"])
        return web.json_response({"segment": merged, "changed": changed})

    async def _ingest(self, request: web.Request) -> web.StreamResponse:
        if request.headers.get("Authorization") != f"Bearer {CAPTURE_TOKEN}":
            return web.json_response(
                {"error": "Unauthorized", "message": "Invalid service token"}, status=401
            )
        capture = web.WebSocketResponse()
        await capture.prepare(request)
        previous, self._capture = self._capture, capture
        if previous is not None and not previous.closed:
            await previous.close(code=4001, message=b"replaced by a newer ingest connection")
        self.capture_connections += 1
        state: dict[str, Any] = {"upstream": None, "start": None, "dropped": 0}

        async def status() -> None:
            if not capture.closed:
                up = state["upstream"]
                await capture.send_json(
                    {
                        "type": "status",
                        "upstream": "connected" if up is not None and not up.closed else "unavailable",
                        "droppedFrames": state["dropped"],
                    }
                )

        async def upstream_loop(http: aiohttp.ClientSession) -> None:
            assert self.translation_ingest_url
            while not capture.closed:
                try:
                    async with http.ws_connect(
                        self.translation_ingest_url, headers={"Authorization": f"Bearer {SERVICE_TOKEN}"}
                    ) as up:
                        self.upstream_connections += 1
                        state["upstream"] = up
                        if state["start"]:
                            await up.send_str(state["start"])
                        await status()
                        async for msg in up:
                            if msg.type == WSMsgType.TEXT and not capture.closed:
                                await capture.send_str(msg.data)
                except aiohttp.ClientError:
                    pass
                was_open = state["upstream"] is not None
                state["upstream"] = None
                if was_open:
                    await status()
                await asyncio.sleep(0.05)

        await status()
        async with aiohttp.ClientSession() as http:
            upstream_task = asyncio.create_task(upstream_loop(http)) if self.translation_ingest_url else None
            async for msg in capture:
                up = state["upstream"]
                if msg.type == WSMsgType.BINARY:
                    if up is None or up.closed:
                        state["dropped"] += 1
                        self.dropped_frames += 1
                        continue
                    await up.send_bytes(msg.data)
                    self.proxied_bytes += len(msg.data)
                    if (
                        self.drop_upstream_after_bytes
                        and self.proxied_bytes >= self.drop_upstream_after_bytes
                    ):
                        self.drop_upstream_after_bytes = None
                        await up.close()
                    if self.drop_capture_after_bytes and self.proxied_bytes >= self.drop_capture_after_bytes:
                        self.drop_capture_after_bytes = None
                        await capture.close(code=1011, message=b"simulated network drop")
                elif msg.type == WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    if data.get("type") == "start":
                        state["start"] = msg.data
                    if up is not None and not up.closed:
                        await up.send_str(msg.data)
            if upstream_task is not None:
                upstream_task.cancel()
                await asyncio.gather(upstream_task, return_exceptions=True)
            up = state["upstream"]
            if up is not None and not up.closed:
                await up.close()
        return capture


@contextlib.asynccontextmanager
async def serve(app: web.Application, port: int = 0) -> AsyncIterator[str]:
    """Run an aiohttp app on localhost; yields its base URL."""
    runner = web.AppRunner(app, shutdown_timeout=1.0)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", port)
    await site.start()
    server = site._server
    assert server is not None
    sockets = getattr(server, "sockets", None) or []
    bound = sockets[0].getsockname()[1] if sockets else port
    try:
        yield f"http://127.0.0.1:{bound}"
    finally:
        await runner.cleanup()


async def wait_for(predicate: Any, within: float = 10.0, interval: float = 0.02) -> None:
    deadline = asyncio.get_running_loop().time() + within
    while not predicate():
        if asyncio.get_running_loop().time() > deadline:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(interval)
