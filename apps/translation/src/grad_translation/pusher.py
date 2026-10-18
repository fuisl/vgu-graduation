"""Delivers segments to the API: `POST /internal/translation/segments`.

The API may be restarting, deploying or simply absent, and that must never
stall or crash the pipeline. Posts queue in memory in sequence order and go
out one at a time with exponential backoff (full jitter) while the API is
unreachable. A later post for the same (sessionId, sequence) replaces the
queued one in place, since each post carries every translation known so far
and the API upserts per language. The queue is bounded: past ``max_pending``
segments the oldest is dropped and counted (phones fetch gaps by sequence, so
a hole is survivable; unbounded memory on the GPU node is not).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import random
import time
from collections import OrderedDict
from typing import Any, Literal

import aiohttp

log = logging.getLogger(__name__)

Outcome = Literal["ok", "retry", "drop"]
# The request itself is wrong; sending it again won't help.
_DROP_STATUSES = frozenset({400, 409, 413, 415, 422})


def _retry_after(value: str | None) -> float | None:
    try:
        return max(0.0, float(value)) if value else None
    except ValueError:
        return None  # an HTTP date; the normal backoff is fine


class SegmentPusher:
    def __init__(
        self,
        url: str,
        token: str | None,
        *,
        max_pending: int = 2_000,
        backoff_base_s: float = 0.5,
        backoff_max_s: float = 30.0,
        request_timeout_s: float = 10.0,
    ) -> None:
        self._url = url
        self._token = token
        self._max_pending = max(1, max_pending)
        self._base = backoff_base_s
        self._max = backoff_max_s
        self._timeout = aiohttp.ClientTimeout(total=request_timeout_s)
        self._pending: OrderedDict[tuple[str, int], dict[str, Any]] = OrderedDict()
        self._wake = asyncio.Event()
        self._session: aiohttp.ClientSession | None = None
        self._task: asyncio.Task[None] | None = None
        self.sent = 0
        self.dropped = 0
        self.attempts_failed = 0
        self.last_success_at: float | None = None
        self.last_error: str | None = None
        self._consecutive_failures = 0
        self._retry_after: float | None = None

    @property
    def pending(self) -> int:
        return len(self._pending)

    def submit(self, payload: dict[str, Any]) -> None:
        key = (str(payload["sessionId"]), int(payload["sequence"]))
        if key not in self._pending and len(self._pending) >= self._max_pending:
            old_key, _ = self._pending.popitem(last=False)
            self.dropped += 1
            log.warning(
                "push queue full (%d): dropped segment %s#%d while the API is unreachable",
                self._max_pending,
                old_key[0],
                old_key[1],
            )
        self._pending[key] = payload  # replacing keeps the original position
        self._wake.set()

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="segment-pusher")

    async def _post(self, payload: dict[str, Any]) -> Outcome:
        if self._session is None:
            self._session = aiohttp.ClientSession(timeout=self._timeout)
        headers = {"Authorization": f"Bearer {self._token}"} if self._token else {}
        try:
            async with self._session.post(self._url, json=payload, headers=headers) as resp:
                if 200 <= resp.status < 300:
                    return "ok"
                self.last_error = f"HTTP {resp.status}"
                if resp.status in _DROP_STATUSES:
                    body = (await resp.text())[:300]
                    log.error(
                        "API rejected segment %s#%s (HTTP %d), dropping it: %s",
                        payload["sessionId"],
                        payload["sequence"],
                        resp.status,
                        body,
                    )
                    return "drop"
                if resp.status in (401, 403):
                    log.error("API refused the service token (HTTP %d); check SERVICE_TOKEN", resp.status)
                # 503 + Retry-After: the API is up but its storage isn't.
                self._retry_after = _retry_after(resp.headers.get("Retry-After"))
                return "retry"
        except (aiohttp.ClientError, TimeoutError, OSError) as err:
            self.last_error = f"{type(err).__name__}: {err}" if str(err) else type(err).__name__
            return "retry"

    def _backoff(self) -> float:
        exp = min(self._max, self._base * (2 ** min(self._consecutive_failures, 16)))
        delay = random.uniform(self._base / 2, exp)
        if self._retry_after is not None:
            delay = max(delay, min(self._retry_after, self._max))
            self._retry_after = None
        return delay

    async def _run(self) -> None:
        while True:
            if not self._pending:
                self._wake.clear()
                await self._wake.wait()
                continue
            key, payload = next(iter(self._pending.items()))
            outcome = await self._post(payload)
            if outcome == "retry":
                self.attempts_failed += 1
                if self._consecutive_failures == 0 or self._consecutive_failures % 10 == 0:
                    log.warning(
                        "API unreachable (%s); %d segment(s) waiting, retrying with backoff",
                        self.last_error,
                        len(self._pending),
                    )
                self._consecutive_failures += 1
                await asyncio.sleep(self._backoff())
                continue
            if self._consecutive_failures:
                log.info("API reachable again after %d failed attempt(s)", self._consecutive_failures)
            self._consecutive_failures = 0
            if outcome == "ok":
                self.sent += 1
                self.last_success_at = time.time()
            else:
                self.dropped += 1
            # Only remove what we sent; a newer version submitted meanwhile goes next.
            if self._pending.get(key) is payload:
                del self._pending[key]

    async def drain(self, timeout_s: float) -> bool:
        """Wait until everything queued is delivered, up to ``timeout_s``."""
        deadline = time.monotonic() + timeout_s
        while self._pending and time.monotonic() < deadline:  # noqa: ASYNC110 - shutdown only
            await asyncio.sleep(0.05)
        return not self._pending

    async def close(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        if self._session is not None:
            await self._session.close()
            self._session = None

    def status(self) -> dict[str, Any]:
        return {
            "pending": len(self._pending),
            "sent": self.sent,
            "dropped": self.dropped,
            "failedAttempts": self.attempts_failed,
            "lastSuccessAt": self.last_success_at,
            "lastError": self.last_error,
        }
