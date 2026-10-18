"""One ceremony session: audio in, numbered sentences out.

    ingest bytes -> ring buffer + VAD chunker -> ASR worker (ResilientAsr)
      -> glossary correction -> SentenceSegmenter -> sequence number
      -> TranslationFanout (per-language workers) -> SegmentPusher -> API

A session outlives the connection that feeds it: the capture client and the
API proxy both reconnect, and each new connection attaches to the same
session, so the timeline and the sequence numbers simply continue. Audio the
capture client had to drop arrives as an explicit `gap` that advances the
timeline. Sequence numbers stay gapless per session for as long as this
process runs; a restarted process starts a new session id, so it can never
collide with segments the API already stored.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import re
import time
from datetime import UTC, datetime
from typing import Any

from .asr import AllProvidersFailed, Chunk, Event, Pause, ResilientAsr, VadChunker
from .audio import SAMPLE_WIDTH, PcmRingBuffer, ms_to_samples, samples_to_ms
from .config import Settings, SourceLanguage
from .glossary import Glossary
from .pusher import SegmentPusher
from .segmenter import SentenceSegmenter, words_from_result
from .translate import ManagedTranslator, SegmentRecord, TranslationFanout

log = logging.getLogger(__name__)

_LABEL = re.compile(r"[^a-z0-9-]+")


def session_label(raw: str | None, default: str) -> str:
    label = _LABEL.sub("-", (raw or default).strip().lower()).strip("-")[:40]
    return label or default


class Session:
    def __init__(
        self,
        session_id: str,
        settings: Settings,
        asr: ResilientAsr,
        fanout: TranslationFanout,
        glossary: Glossary,
    ) -> None:
        self.session_id = session_id
        self._settings = settings
        self._asr = asr
        self._fanout = fanout
        self._glossary = glossary
        self._ring = PcmRingBuffer(settings.ring_buffer_seconds)
        self._chunker = VadChunker(
            threshold_dbfs=settings.vad_threshold_dbfs,
            pause_ms=settings.chunk_pause_ms,
            min_ms=settings.chunk_min_ms,
            max_ms=settings.chunk_max_ms,
            sentence_pause_ms=settings.sentence_pause_ms,
        )
        self._segmenter = SentenceSegmenter()
        self._events: asyncio.Queue[Event] = asyncio.Queue()
        self._next_sequence = 0
        self.language: SourceLanguage | None = settings.source_language
        self._carry = b""  # half a sample split across frames
        self._flush_handle: asyncio.TimerHandle | None = None
        self._worker: asyncio.Task[None] | None = None
        self._last_asr_provider = "unknown"
        self._last_language: SourceLanguage = "en"
        self.gaps_ms = 0
        self.dropped_chunks = 0

    @property
    def position(self) -> int:
        """Samples on the session timeline, gaps included (ms = samples / 16)."""
        return self._ring.end

    def start(self) -> None:
        if self._worker is None:
            self._worker = asyncio.create_task(self._run_asr(), name=f"asr-{self.session_id}")

    # --- ingest side -----------------------------------------------------------------

    def attach(self) -> dict[str, Any]:
        """A connection starts feeding this session; returns the `ready` message for it."""
        if self._flush_handle is not None:
            self._flush_handle.cancel()
            self._flush_handle = None
        self._carry = b""
        return {"type": "ready", "sessionId": self.session_id, "resumed": self.position > 0}

    def gap(self, samples: int) -> None:
        """Audio lost upstream: the timeline skips ahead and the open sentence closes."""
        if samples <= 0:
            return
        self.gaps_ms += samples_to_ms(samples)
        log.warning("audio gap of %d ms in %s", samples_to_ms(samples), self.session_id)
        self._carry = b""
        target = self.position + samples
        self._enqueue(self._chunker.jump(target))
        self._ring.skip_to(target)

    def feed(self, data: bytes) -> None:
        data = self._carry + data
        usable = len(data) - len(data) % SAMPLE_WIDTH
        self._carry = data[usable:]
        pcm = data[:usable]
        if not pcm:
            return
        self._ring.append(pcm)
        self._enqueue(self._chunker.push(pcm))

    def set_language(self, language: SourceLanguage | None) -> None:
        if language != self.language:
            log.info("source language set to %s", language or "auto")
            self.language = language
            # A sentence never spans the switch.
            self._enqueue(self._chunker.flush())

    def detach(self) -> None:
        """The feeding connection went away; close the open sentence if it doesn't come back soon."""
        if self._flush_handle is not None:
            self._flush_handle.cancel()
        loop = asyncio.get_running_loop()
        self._flush_handle = loop.call_later(self._settings.disconnect_flush_s, self.flush)

    def flush(self) -> None:
        self._flush_handle = None
        self._enqueue(self._chunker.flush())

    def _enqueue(self, events: list[Event]) -> None:
        for event in events:
            self._events.put_nowait(event)

    # --- ASR side ------------------------------------------------------------------

    async def _run_asr(self) -> None:
        while True:
            event = await self._events.get()
            try:
                if isinstance(event, Pause):
                    self._emit(self._segmenter.flush())
                else:
                    await self._transcribe(event)
            except Exception:
                log.exception("asr worker error in %s", self.session_id)
            finally:
                self._events.task_done()

    async def _transcribe(self, chunk: Chunk) -> None:
        attempt = 0
        max_lag = ms_to_samples(self._settings.asr_max_lag_ms)
        while True:
            pcm = self._ring.read(chunk.start, chunk.end)
            if pcm is None or self.position - chunk.end > max_lag:
                self.dropped_chunks += 1
                log.warning(
                    "asr dropped %d ms of audio in %s (too far behind or evicted)",
                    samples_to_ms(chunk.end - chunk.start),
                    self.session_id,
                )
                self._emit(self._segmenter.flush())
                return
            try:
                # Bias toward glossary spellings in the language most likely being spoken.
                hint = self.language or self._last_language
                result, provider = await self._asr.transcribe(
                    pcm, language=self.language, prompt=self._glossary.prompt(hint)
                )
                break
            except AllProvidersFailed as err:
                attempt += 1
                if attempt == 1:
                    log.warning("asr failed on every provider, replaying chunk from the buffer: %s", err)
                await asyncio.sleep(min(5.0, 0.25 * 2**attempt))
        self._last_asr_provider = provider
        self._last_language = result.language
        words = words_from_result(result, samples_to_ms(chunk.start), samples_to_ms(chunk.end))
        self._emit(self._segmenter.feed(words, result.language))

    def _emit(self, sentences: list[Any]) -> None:
        for sentence in sentences:
            text = self._glossary.correct(sentence.text, sentence.language)
            record = SegmentRecord(
                session_id=self.session_id,
                sequence=self._next_sequence,
                start_ms=sentence.start_ms,
                end_ms=sentence.end_ms,
                source_language=sentence.language,
                source_text=text,
            )
            self._next_sequence += 1
            self._fanout.submit(record, self._last_asr_provider)

    async def drain(self, timeout_s: float) -> None:
        """Finish what has been received: close open speech and wait for ASR."""
        self.flush()
        try:
            await asyncio.wait_for(self._events.join(), timeout_s)
        except TimeoutError:
            log.warning("asr did not finish %s within %.0fs", self.session_id, timeout_s)

    async def close(self) -> None:
        if self._flush_handle is not None:
            self._flush_handle.cancel()
        if self._worker is not None:
            self._worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._worker
            self._worker = None

    def status(self) -> dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "positionMs": samples_to_ms(self.position),
            "nextSequence": self._next_sequence,
            "language": self.language or "auto",
            "asrBacklog": self._events.qsize(),
            "gapsMs": self.gaps_ms,
            "droppedChunks": self.dropped_chunks,
        }


class TranslationService:
    """Owns the providers, the pusher and the sessions (one per label, normally one)."""

    def __init__(
        self,
        settings: Settings,
        asr: ResilientAsr,
        final: ManagedTranslator,
        draft: ManagedTranslator | None,
        glossary: Glossary,
        pusher: SegmentPusher,
    ) -> None:
        self.settings = settings
        self.asr = asr
        self.glossary = glossary
        self.pusher = pusher
        self.fanout = TranslationFanout(
            settings.target_languages,
            final,
            draft,
            glossary,
            lambda record: pusher.submit(record.to_json()),
            timeout_s=settings.mt_timeout_s,
            max_queue_s=settings.mt_max_queue_s,
        )
        self.sessions: dict[str, Session] = {}
        self.started_at = time.time()
        self._loader: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self.pusher.start()
        # Models load in the background so /healthz answers during a slow first download.
        self._loader = asyncio.create_task(self._load(), name="load-providers")

    async def _load(self) -> None:
        await self.asr.load()
        await self.fanout.start()
        log.info("providers ready: asr=%s", ", ".join(s["name"] for s in self.asr.status() if s["loaded"]))

    def session(self, label: str) -> Session:
        existing = self.sessions.get(label)
        if existing is not None:
            return existing
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        session = Session(f"{label}-{stamp}", self.settings, self.asr, self.fanout, self.glossary)
        session.start()
        self.sessions[label] = session
        log.info("session %s started", session.session_id)
        return session

    async def stop(self, drain_timeout_s: float = 10.0) -> None:
        if self._loader is not None and not self._loader.done():
            self._loader.cancel()
        for session in self.sessions.values():
            await session.drain(drain_timeout_s)
        await self.fanout.join(drain_timeout_s)
        if not await self.pusher.drain(min(5.0, drain_timeout_s)):
            log.warning("shutting down with %d segment(s) not delivered to the API", self.pusher.pending)
        for session in self.sessions.values():
            await session.close()
        await self.fanout.close()
        await self.asr.close()
        await self.pusher.close()

    def status(self) -> dict[str, Any]:
        return {
            "asr": self.asr.status(),
            "mt": self.fanout.status(),
            "push": self.pusher.status(),
            "sessions": [s.status() for s in self.sessions.values()],
        }
