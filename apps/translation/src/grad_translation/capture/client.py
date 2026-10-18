"""Streams captured audio to `WS /live/ingest` on the API and survives network drops.

Protocol (packages/contract/src/translation.ts, use-cases.md §6.2): binary
frames of raw PCM, 16 kHz mono s16le, 100 ms each; a JSON `start` first (the
API replays it to the translation service after every reconnect). The API
answers with `status` messages saying whether the translation service is
connected, and relays the service's own `ready`/`ack` messages.

Audio is captured continuously, independent of the connection, into a
bounded local buffer. A frame leaves the buffer only once the service has
acknowledged it, so after a drop (Wi-Fi blip, half-open socket, API restart,
translation service restart) the unacknowledged tail is sent again and
captions catch up instead of losing the sentence. While the API says the
service is unavailable the client keeps buffering rather than sending audio
the API would drop. If an outage outlasts the buffer, the oldest audio is
dropped and the service is told with a `gap` message so its timeline stays
right. Reconnects back off exponentially with jitter; close code 4001 means
another capture client took over, and this one exits instead of fighting it.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
import sys
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

import aiohttp

from ..audio import CHANNELS, ENCODING, SAMPLE_RATE, SAMPLE_WIDTH, peak_dbfs
from .sources import AudioSource

log = logging.getLogger("grad_capture")

EXIT_SUPERSEDED = 3
CLOSE_REPLACED = 4001  # the API: a newer capture client took over

Language = Literal["auto", "en", "vi"]


class Superseded(Exception):
    """Another capture client took over the single input."""


class _Reconnect(Exception):
    pass


@dataclass
class CaptureConfig:
    url: str
    token: str | None
    session: str = "ceremony"
    language: Language = "auto"
    # Audio kept for resending. Captions more than a few seconds late are of
    # little use, and the API drops audio once ~8 s is queued toward the service.
    buffer_seconds: float = 10.0
    status_interval_s: float = 5.0
    # No acknowledgement for this long while audio is in flight: treat the socket as dead.
    ack_timeout_s: float = 5.0
    backoff_base_s: float = 0.5
    backoff_max_s: float = 10.0
    # File mode: how long to keep trying to deliver the end of the file.
    drain_timeout_s: float = 30.0
    # Buffered audio is resent at up to this multiple of real time.
    catch_up_speed: float = 4.0


@dataclass
class _Frame:
    pcm: bytes
    # End of this frame in samples sent on the current upstream connection, once sent.
    sent_end: int | None = None

    @property
    def samples(self) -> int:
        return len(self.pcm) // SAMPLE_WIDTH


class CaptureStreamer:
    def __init__(self, config: CaptureConfig, *, out: Callable[[str], None] | None = None) -> None:
        self.config = config
        self._buffer: deque[_Frame] = deque()
        self._buffered = 0  # samples in _buffer
        self._inflight = 0  # frames at the front of _buffer sent but not yet acknowledged
        self._epoch_sent = 0  # samples sent since the service connection (re)started
        self._capacity = max(1, int(config.buffer_seconds * SAMPLE_RATE))
        self._pending_gap = 0  # dropped samples the service hasn't been told about
        self.captured = 0
        self.delivered = 0  # samples the service acknowledged
        self.dropped_samples = 0
        self.reconnects = 0
        self.api_dropped_frames = 0
        self.session_id: str | None = None
        self.state = "connecting"
        self.upstream = False
        self._last_progress = time.monotonic()
        self._next_retry_at: float | None = None
        self._connected_at: float | None = None
        self._wake = asyncio.Event()
        self._source_done = asyncio.Event()
        self._source_done_at: float | None = None
        self._source_error: BaseException | None = None
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._language: Language = config.language
        self._peak = -120.0
        self._out = out or (lambda line: print(line, file=sys.stderr, flush=True))

    # --- buffer ----------------------------------------------------------------------------

    def add_audio(self, pcm: bytes) -> None:
        pcm = pcm[: len(pcm) - len(pcm) % SAMPLE_WIDTH]
        if not pcm:
            return
        frame = _Frame(pcm)
        self._buffer.append(frame)
        self.captured += frame.samples
        self._buffered += frame.samples
        self._peak = max(self._peak, peak_dbfs(pcm))
        while self._buffered > self._capacity and len(self._buffer) > 1:
            old = self._buffer.popleft()
            self._buffered -= old.samples
            self.dropped_samples += old.samples
            if self._inflight:
                self._inflight -= 1  # sent once, never acknowledged: may or may not have arrived
            else:
                self._pending_gap += old.samples
        self._wake.set()

    def _ack(self, received: int) -> None:
        while (
            self._inflight and self._buffer[0].sent_end is not None and self._buffer[0].sent_end <= received
        ):
            old = self._buffer.popleft()
            self._inflight -= 1
            self._buffered -= old.samples
            self.delivered += old.samples
            self._last_progress = time.monotonic()
        self._wake.set()

    def _new_epoch(self) -> None:
        """The service connection is new: whatever it hasn't acknowledged goes again."""
        for i in range(self._inflight):
            self._buffer[i].sent_end = None
        self._inflight = 0
        self._epoch_sent = 0
        self._last_progress = time.monotonic()

    @property
    def drained(self) -> bool:
        return self._source_done.is_set() and not self._buffer

    def _gave_up(self) -> bool:
        return (
            self._source_done_at is not None
            and time.monotonic() - self._source_done_at > self.config.drain_timeout_s
        )

    async def _capture(self, source: AudioSource) -> None:
        try:
            async for frame in source.frames():
                self.add_audio(frame)
        except Exception as err:
            self._source_error = err
            self._out(f"[capture] ! audio input failed: {type(err).__name__}: {err}")
        finally:
            self._source_done.set()
            self._source_done_at = time.monotonic()
            self._wake.set()

    # --- control ---------------------------------------------------------------------------

    def _start_message(self) -> str:
        message: dict[str, Any] = {
            "type": "start",
            "sessionId": self.config.session,
            "sampleRate": SAMPLE_RATE,
            "channels": CHANNELS,
            "encoding": ENCODING,
        }
        if self._language != "auto":
            message["sourceLanguage"] = self._language
        return json.dumps(message)

    async def set_language(self, language: Language) -> None:
        """A new `start` switches the language; the API replays the latest one on reconnects."""
        self._language = language
        self._out(f"[capture] source language: {language}")
        if self._ws is not None and not self._ws.closed:
            await self._ws.send_str(self._start_message())

    # --- connection ------------------------------------------------------------------------

    def _backoff(self, attempt: int) -> float:
        cap = min(self.config.backoff_max_s, self.config.backoff_base_s * 2**attempt)
        return random.uniform(cap / 2, cap)

    async def _connection_loop(self, http: aiohttp.ClientSession) -> None:
        attempt = 0
        headers = {"Authorization": f"Bearer {self.config.token}"} if self.config.token else {}
        while not self.drained and not self._gave_up():
            self.state = "connecting"
            try:
                async with http.ws_connect(
                    self.config.url,
                    headers=headers,
                    heartbeat=15.0,
                    timeout=aiohttp.ClientWSTimeout(ws_close=5.0),
                ) as ws:
                    self._ws = ws
                    attempt = 0
                    await self._serve(ws)
                    if self.drained:
                        return
            except Superseded:
                raise
            except aiohttp.WSServerHandshakeError as err:
                if err.status in (401, 403):
                    self._out(f"[capture] ! the API refused the capture token (HTTP {err.status})")
                else:
                    self._out(f"[capture] ! handshake failed (HTTP {err.status})")
            except (aiohttp.ClientError, TimeoutError, OSError, _Reconnect) as err:
                if self.drained:
                    return
                if self.state in ("live", "waiting"):
                    self.reconnects += 1
                    self._out(f"[capture] ○ connection lost ({err or type(err).__name__}); still buffering")
                else:
                    self._out(f"[capture] ○ cannot connect: {type(err).__name__} {err}".rstrip())
            finally:
                self._ws = None
                self._connected_at = None
                self.upstream = False
            delay = self._backoff(attempt)
            attempt += 1
            self.state = "offline"
            self._next_retry_at = time.monotonic() + delay
            await asyncio.sleep(delay)
            self._next_retry_at = None
        if self._buffer:
            self._out(f"[capture] ! gave up with {self._buffered / SAMPLE_RATE:.1f} s undelivered")

    async def _serve(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        self.state = "waiting"
        self._connected_at = time.monotonic()
        self._new_epoch()
        await ws.send_str(self._start_message())
        sender = asyncio.create_task(self._send(ws), name="send")
        receiver = asyncio.create_task(self._receive(ws), name="receive")
        try:
            done, _ = await asyncio.wait({sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in (sender, receiver):
                task.cancel()
            await asyncio.gather(sender, receiver, return_exceptions=True)
        if sender in done and sender.exception() is None:
            return  # file mode: everything delivered
        if ws.close_code == CLOSE_REPLACED:
            raise Superseded()
        for task in done:
            err = task.exception()
            if isinstance(err, _Reconnect):
                raise err
        raise _Reconnect(f"closed ({ws.close_code})")

    async def _receive(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        async for msg in ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                continue
            try:
                data = json.loads(msg.data)
            except json.JSONDecodeError:
                continue
            if not isinstance(data, dict):
                continue
            kind = data.get("type")
            if kind == "status":  # from the API
                self._on_status(data)
            elif kind == "ack":  # from the translation service
                self._ack(int(data.get("receivedSamples", 0)))
            elif kind == "ready":
                if not self.upstream:
                    # Straight to the service (local dev, no API in between): no `status` comes.
                    self._on_status({"upstream": "connected", "droppedFrames": self.api_dropped_frames})
                if data.get("sessionId") != self.session_id:
                    self.session_id = data.get("sessionId")
                    self._out(f"[capture] session {self.session_id}")
            elif kind == "error":
                self._out(f"[capture] ! service error {data.get('code')}: {data.get('message')}")
            # Anything else: newer than this client; ignore.

    def _on_status(self, data: dict[str, Any]) -> None:
        dropped = int(data.get("droppedFrames", 0))
        if dropped > self.api_dropped_frames:
            self._out(f"[capture] ! the API dropped {dropped} frame(s) on this connection")
        self.api_dropped_frames = dropped
        connected = data.get("upstream") == "connected"
        if connected and not self.upstream:
            self._new_epoch()
            self.state = "live"
            backlog = self._buffered / SAMPLE_RATE
            self._out(
                "[capture] ● live: translation service connected"
                + (f", catching up {backlog:.1f} s" if backlog >= 0.5 else "")
            )
        elif not connected and self.upstream:
            self.state = "waiting"
            self._out("[capture] ○ translation service unavailable; buffering until it is back")
        elif not connected:
            self.state = "waiting"
        self.upstream = connected
        self._wake.set()

    async def _send(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        frame_s = 0.1
        stop_sent = False
        while True:
            # Only while the service is said to be there; otherwise silence is expected.
            stalled = time.monotonic() - self._last_progress > self.config.ack_timeout_s
            if self.upstream and self._inflight and stalled:
                raise _Reconnect("no acknowledgement from the service")
            if self.drained:
                await ws.close()
                return
            if self._gave_up():
                raise _Reconnect("gave up delivering the end of the file")
            unsent = len(self._buffer) - self._inflight
            if not self.upstream or unsent == 0:
                if self._source_done.is_set() and unsent == 0 and self.upstream and not stop_sent:
                    await ws.send_str(json.dumps({"type": "stop"}))  # the service acks everything
                    stop_sent = True
                self._wake.clear()
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(self._wake.wait(), 1.0)
                continue
            if self._pending_gap:
                await ws.send_str(json.dumps({"type": "gap", "samples": self._pending_gap}))
                self._pending_gap = 0
            frame = self._buffer[self._inflight]
            await ws.send_bytes(frame.pcm)
            if not self._inflight:
                self._last_progress = time.monotonic()
            self._epoch_sent += frame.samples
            frame.sent_end = self._epoch_sent
            self._inflight += 1
            frame_s = frame.samples / SAMPLE_RATE
            if unsent > 2:  # catching up on buffered audio: don't flood the API
                await asyncio.sleep(frame_s / self.config.catch_up_speed)

    # --- status ----------------------------------------------------------------------------

    def status_line(self) -> str:
        level = "no signal" if self._peak <= -60 else f"peak {self._peak:5.1f} dBFS"
        self._peak = -120.0
        if self.state == "done":
            head = "■ finished"
        elif self.state == "live":
            up = max(0.0, time.monotonic() - (self._connected_at or time.monotonic()))
            head = f"● live {int(up // 60):02d}:{int(up % 60):02d}"
        elif self.state == "waiting":
            head = "○ connected to the API, translation service unavailable"
        elif self.state == "offline" and self._next_retry_at is not None:
            head = f"○ offline, retry in {max(0.0, self._next_retry_at - time.monotonic()):.1f} s"
        else:
            head = "○ connecting"
        parts = [
            head,
            level,
            f"buffer {self._buffered / SAMPLE_RATE:.1f}/{self.config.buffer_seconds:.0f} s",
            f"delivered {self.delivered / SAMPLE_RATE / 60:.1f} min",
            f"reconnects {self.reconnects}",
        ]
        if self.dropped_samples:
            parts.append(f"LOST {self.dropped_samples / SAMPLE_RATE:.1f} s")
        return "[capture] " + " | ".join(parts)

    async def _status(self) -> None:
        while True:
            await asyncio.sleep(self.config.status_interval_s)
            self._out(self.status_line())

    async def run(self, source: AudioSource) -> None:
        async with aiohttp.ClientSession() as http:
            capture = asyncio.create_task(self._capture(source), name="capture")
            status = asyncio.create_task(self._status(), name="status")
            try:
                await self._connection_loop(http)
            finally:
                capture.cancel()
                status.cancel()
                for task in (capture, status):
                    with contextlib.suppress(asyncio.CancelledError):
                        await task
        self.state = "done"
        self._out(self.status_line())
        if self._source_error is not None:
            raise self._source_error
