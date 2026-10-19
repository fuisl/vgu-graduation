"""Speech chunking and the resilient ASR adapter.

`VadChunker` cuts the continuous stream into utterance-sized chunks at pauses
(simple energy VAD, no model) and reports long pauses so the segmenter can
close a sentence. Chunks are only sample ranges: the audio stays in the
session's ring buffer, so a chunk can be transcribed again after a failure.

`ResilientAsr` runs a chunk through an ordered chain of providers with a
timeout each, and a per-provider circuit breaker so a provider that keeps
failing (CUDA out of memory, a cloud outage) is skipped for a cool-down
instead of costing a timeout on every chunk.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from .audio import SAMPLE_WIDTH, ms_to_samples, rms_dbfs
from .config import SourceLanguage
from .providers.base import AsrProvider, AsrResult

log = logging.getLogger(__name__)

FRAME_SAMPLES = 480  # 30 ms
PREROLL_MS = 200
TAIL_MS = 200


@dataclass(frozen=True)
class Chunk:
    start: int  # absolute sample index, inclusive
    end: int  # exclusive


@dataclass(frozen=True)
class Pause:
    """A long silence (or a gap, or the end of the stream): close the pending sentence."""

    at: int


Event = Chunk | Pause


class VadChunker:
    def __init__(
        self,
        *,
        threshold_dbfs: float,
        pause_ms: int,
        min_ms: int,
        max_ms: int,
        sentence_pause_ms: int,
    ) -> None:
        self._threshold = threshold_dbfs
        self._pause = ms_to_samples(pause_ms)
        self._min = ms_to_samples(min_ms)
        self._max = ms_to_samples(max_ms)
        self._sentence_pause = ms_to_samples(sentence_pause_ms)
        self._pos = 0  # absolute sample index of the next sample pushed
        self._frame_pos = 0  # absolute sample index where the carried partial frame starts
        self._floor = 0  # no chunk starts before this (the end of the last gap)
        self._carry = b""
        self._speech_start: int | None = None
        self._voice_end = 0
        self._silence_reported = True  # no Pause before any speech
        # (frame_end, level) for the open chunk's recent frames, to cut long chunks at a quiet spot.
        self._levels: deque[tuple[int, float]] = deque(maxlen=50)  # 1.5 s of frames

    @property
    def position(self) -> int:
        return self._pos

    @property
    def in_speech(self) -> bool:
        return self._speech_start is not None

    def push(self, pcm: bytes) -> list[Event]:
        data = self._carry + pcm
        frame_bytes = FRAME_SAMPLES * SAMPLE_WIDTH
        usable = len(data) - len(data) % frame_bytes
        self._carry = data[usable:]
        events: list[Event] = []
        for off in range(0, usable, frame_bytes):
            self._frame(data[off : off + frame_bytes], self._frame_pos, events)
            self._frame_pos += FRAME_SAMPLES
        self._pos += len(pcm) // SAMPLE_WIDTH
        return events

    def _frame(self, frame: bytes, frame_start: int, events: list[Event]) -> None:
        frame_end = frame_start + FRAME_SAMPLES
        level = rms_dbfs(frame)
        voiced = level > self._threshold
        if self._speech_start is None:
            if voiced:
                # Pre-roll catches a soft onset, but never reaches back across a gap.
                self._speech_start = max(self._floor, frame_start - ms_to_samples(PREROLL_MS))
                self._voice_end = frame_end
                self._levels.clear()
                self._silence_reported = False
            elif not self._silence_reported and frame_end - self._voice_end >= self._sentence_pause:
                events.append(Pause(frame_end))
                self._silence_reported = True
            return
        self._levels.append((frame_end, level))
        if voiced:
            self._voice_end = frame_end
        silence = frame_end - self._voice_end
        if silence >= self._pause:
            if self._voice_end - self._speech_start >= self._min:
                end = min(frame_end, self._voice_end + ms_to_samples(TAIL_MS))
                events.append(Chunk(self._speech_start, end))
            # else: a click or cough too short to be speech; drop it.
            self._speech_start = None
            return
        if frame_end - self._speech_start >= self._max:
            cut = self._quietest_cut(frame_end)
            events.append(Chunk(self._speech_start, cut))
            self._speech_start = cut
            self._levels.clear()

    def _quietest_cut(self, default: int) -> int:
        if not self._levels:
            return default
        # The quietest frame (to the dB) in the last 1.5 s; on a tie the latest, to keep chunks long.
        end, _ = min(self._levels, key=lambda item: (round(item[1]), -item[0]))
        return end

    def flush(self) -> list[Event]:
        """End of input (disconnect grace expired, gap, shutdown): emit what is open."""
        events: list[Event] = []
        end = self._frame_pos
        if self._speech_start is not None and end - self._speech_start > 0:
            events.append(Chunk(self._speech_start, end))
        self._speech_start = None
        if not self._silence_reported:
            events.append(Pause(end))
            self._silence_reported = True
        return events

    def jump(self, to_sample: int) -> list[Event]:
        """The stream skips ahead (audio lost upstream): close everything open first."""
        events = self.flush()
        self._carry = b""
        self._pos = max(self._pos, to_sample)
        self._frame_pos = self._pos
        self._floor = self._pos
        self._voice_end = self._pos
        return events


class AllProvidersFailed(RuntimeError):
    pass


@dataclass
class _Health:
    loaded: bool = False
    next_load_at: float = 0.0
    failures: int = 0
    open_until: float = 0.0
    last_error: str | None = None


class ResilientAsr:
    def __init__(
        self,
        providers: list[AsrProvider],
        *,
        timeout_s: float,
        failure_threshold: int = 3,
        cooldown_s: float = 30.0,
        load_retry_s: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not providers:
            raise ValueError("at least one ASR provider is required")
        self._providers = providers
        self._health = {id(p): _Health() for p in providers}
        self._timeout = timeout_s
        self._threshold = failure_threshold
        self._cooldown = cooldown_s
        self._load_retry = load_retry_s
        self._clock = clock

    async def load(self) -> None:
        for provider in self._providers:
            await self._ensure_loaded(provider)

    async def _ensure_loaded(self, provider: AsrProvider) -> bool:
        health = self._health[id(provider)]
        if health.loaded:
            return True
        now = self._clock()
        if now < health.next_load_at:
            return False
        try:
            await provider.load()
        except Exception as err:
            health.next_load_at = now + self._load_retry
            health.last_error = str(err)
            log.warning("asr provider %s unavailable: %s", provider.name, err)
            return False
        health.loaded = True
        health.last_error = None
        return True

    @property
    def ready(self) -> bool:
        return any(h.loaded for h in self._health.values())

    async def transcribe(
        self, pcm: bytes, *, language: SourceLanguage | None, prompt: str | None
    ) -> tuple[AsrResult, str]:
        errors: list[str] = []
        for provider in self._providers:
            health = self._health[id(provider)]
            now = self._clock()
            if now < health.open_until:
                errors.append(f"{provider.name}: circuit open")
                continue
            if not await self._ensure_loaded(provider):
                errors.append(f"{provider.name}: not loaded")
                continue
            try:
                result = await asyncio.wait_for(
                    provider.transcribe(pcm, language=language, prompt=prompt), self._timeout
                )
            except Exception as err:
                health.failures += 1
                health.last_error = f"{type(err).__name__}: {err}"
                if health.failures >= self._threshold:
                    health.open_until = self._clock() + self._cooldown
                    log.warning(
                        "asr provider %s failed %d times, skipping it for %.0fs",
                        provider.name,
                        health.failures,
                        self._cooldown,
                    )
                errors.append(f"{provider.name}: {health.last_error}")
                continue
            if health.failures:
                log.info("asr provider %s recovered", provider.name)
            health.failures = 0
            health.open_until = 0.0
            return result, provider.name
        raise AllProvidersFailed("; ".join(errors))

    def status(self) -> list[dict[str, Any]]:
        now = self._clock()
        return [
            {
                "name": p.name,
                "loaded": self._health[id(p)].loaded,
                "circuitOpen": now < self._health[id(p)].open_until,
                "failures": self._health[id(p)].failures,
                "lastError": self._health[id(p)].last_error,
            }
            for p in self._providers
        ]

    async def close(self) -> None:
        for provider in self._providers:
            try:
                await provider.close()
            except Exception:  # pragma: no cover - best effort on shutdown
                log.exception("closing asr provider %s", provider.name)
