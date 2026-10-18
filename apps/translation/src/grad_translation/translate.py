"""Per-language translation workers.

Each caption language has its own worker and queue, so a slow or broken
language never holds up the others. Every finished sentence is posted at once
with its source-language caption; each target language then attaches its
translation with a re-post of the same (sessionId, sequence). A translation
that errors, times out, or waited too long in the queue (the GPU fell behind)
is posted as ``failed``, which phones render as "translation unavailable".
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from .config import SourceLanguage, TargetLanguage
from .glossary import Glossary
from .providers.base import TranslationProvider

log = logging.getLogger(__name__)

Status = Literal["draft", "final", "failed"]


@dataclass
class Translation:
    language: TargetLanguage
    status: Status
    text: str | None
    provider: str | None

    def to_json(self) -> dict[str, Any]:
        return {
            "language": self.language,
            "status": self.status,
            "text": self.text,
            "provider": self.provider,
        }


@dataclass
class SegmentRecord:
    session_id: str
    sequence: int
    start_ms: int
    end_ms: int
    source_language: SourceLanguage
    source_text: str
    translations: dict[str, Translation] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        """The `translationSegmentSchema` / `ingestTranslationSegmentRequestSchema` wire shape."""
        return {
            "sessionId": self.session_id,
            "sequence": self.sequence,
            "startMs": self.start_ms,
            "endMs": max(self.end_ms, self.start_ms),
            "sourceLanguage": self.source_language,
            "sourceText": self.source_text,
            "translations": [self.translations[k].to_json() for k in sorted(self.translations)],
        }


class ManagedTranslator:
    """A provider plus its load state; a failed load is retried at most every ``retry_s``."""

    def __init__(
        self,
        provider: TranslationProvider,
        retry_s: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.provider = provider
        self.loaded = False
        self.last_error: str | None = None
        self._retry = retry_s
        self._next = 0.0
        self._clock = clock
        self._lock = asyncio.Lock()

    @property
    def name(self) -> str:
        return self.provider.name

    def loaded_by_other_waiter(self) -> bool:
        return self.loaded

    async def ensure(self) -> bool:
        if self.loaded:
            return True
        async with self._lock:
            if self._clock() < self._next:
                return False
            if self.loaded_by_other_waiter():
                return True
            try:
                await self.provider.load()
            except Exception as err:
                self._next = self._clock() + self._retry
                self.last_error = str(err)
                log.warning("mt provider %s unavailable: %s", self.provider.name, err)
                return False
            self.loaded = True
            self.last_error = None
            return True


Publish = Callable[[SegmentRecord], None]


class LanguageWorker:
    def __init__(
        self,
        language: TargetLanguage,
        final: ManagedTranslator,
        draft: ManagedTranslator | None,
        glossary: Glossary,
        publish: Publish,
        *,
        timeout_s: float,
        max_queue_s: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.language = language
        self._final = final
        self._draft = draft
        self._glossary = glossary
        self._publish = publish
        self._timeout = timeout_s
        self._max_queue = max_queue_s
        self._clock = clock
        self.queue: asyncio.Queue[tuple[SegmentRecord, float]] = asyncio.Queue()
        self.failed = 0

    def submit(self, record: SegmentRecord) -> None:
        self.queue.put_nowait((record, self._clock()))

    async def _attempt(self, translator: ManagedTranslator, record: SegmentRecord) -> str | None:
        if not await translator.ensure():
            return None
        prepared = self._glossary.prepare(record.source_text, record.source_language, self.language)
        try:
            text = await asyncio.wait_for(
                translator.provider.translate(prepared, source=record.source_language, target=self.language),
                self._timeout,
            )
        except Exception as err:
            log.warning(
                "translation to %s failed for #%d via %s: %s",
                self.language,
                record.sequence,
                translator.name,
                f"{type(err).__name__}: {err}",
            )
            return None
        text = self._glossary.correct(text.strip(), self.language)
        return text or None

    def _set(self, record: SegmentRecord, status: Status, text: str | None, provider: str) -> None:
        record.translations[self.language] = Translation(self.language, status, text, provider)
        self._publish(record)

    async def handle(self, record: SegmentRecord, queued_at: float) -> None:
        if self._clock() - queued_at > self._max_queue:
            self.failed += 1
            log.warning("translation to %s skipped for #%d: backlog too old", self.language, record.sequence)
            self._set(record, "failed", None, self._final.name)
            return
        drafted = False
        if self._draft is not None:
            text = await self._attempt(self._draft, record)
            if text is not None:
                drafted = True
                self._set(record, "draft", text, self._draft.name)
        text = await self._attempt(self._final, record)
        if text is not None:
            self._set(record, "final", text, self._final.name)
        elif not drafted:
            self.failed += 1
            self._set(record, "failed", None, self._final.name)
        # else: keep the draft rather than replace a usable caption with "unavailable".

    async def run(self) -> None:
        while True:
            record, queued_at = await self.queue.get()
            try:
                await self.handle(record, queued_at)
            except Exception:  # never let one sentence kill the worker
                log.exception("translation worker %s crashed on #%d", self.language, record.sequence)
            finally:
                self.queue.task_done()


class TranslationFanout:
    def __init__(
        self,
        targets: tuple[TargetLanguage, ...],
        final: ManagedTranslator,
        draft: ManagedTranslator | None,
        glossary: Glossary,
        publish: Publish,
        *,
        timeout_s: float,
        max_queue_s: float,
    ) -> None:
        self._targets = targets
        self._final = final
        self._draft = draft
        self._publish = publish
        self.workers = {
            lang: LanguageWorker(
                lang, final, draft, glossary, publish, timeout_s=timeout_s, max_queue_s=max_queue_s
            )
            for lang in targets
        }
        self._tasks: list[asyncio.Task[None]] = []

    async def start(self) -> None:
        await self._final.ensure()
        if self._draft is not None:
            await self._draft.ensure()
        self._tasks = [
            asyncio.create_task(w.run(), name=f"translate-{lang}") for lang, w in self.workers.items()
        ]

    def submit(self, record: SegmentRecord, asr_provider: str) -> None:
        # The caption in the spoken language is the transcript itself.
        if record.source_language in self._targets:
            src: TargetLanguage = record.source_language
            record.translations[src] = Translation(src, "final", record.source_text, asr_provider)
        self._publish(record)
        for lang, worker in self.workers.items():
            if lang != record.source_language:
                worker.submit(record)

    async def join(self, timeout_s: float) -> None:
        waits = [asyncio.create_task(w.queue.join()) for w in self.workers.values()]
        if not waits:
            return
        _, pending = await asyncio.wait(waits, timeout=timeout_s)
        for task in pending:
            task.cancel()

    async def close(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._tasks = []
        for translator in (self._final, self._draft):
            if translator is not None:
                try:
                    await translator.provider.close()
                except Exception:  # pragma: no cover
                    log.exception("closing mt provider %s", translator.name)

    def status(self) -> dict[str, Any]:
        return {
            "provider": self._final.name,
            "loaded": self._final.loaded,
            "lastError": self._final.last_error,
            "draftProvider": self._draft.name if self._draft else None,
            "queues": {lang: w.queue.qsize() for lang, w in self.workers.items()},
            "failed": {lang: w.failed for lang, w in self.workers.items()},
        }
