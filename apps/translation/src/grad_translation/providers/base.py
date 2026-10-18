"""Provider interfaces. The pipeline only ever talks to these two protocols.

Adding a backend (a cloud ASR or MT service, a different local model) means one
class implementing the protocol and one entry in `providers/__init__.py`. The
pipeline owns chunking, segmentation, retries, failover and timeouts, so a
provider only has to turn audio into text or text into text.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from ..config import SourceLanguage, TargetLanguage


class ProviderUnavailable(RuntimeError):
    """The provider cannot serve requests (model missing, failed to load, quota...)."""


@dataclass(frozen=True)
class AsrWord:
    text: str
    start_ms: int  # relative to the start of the chunk
    end_ms: int


@dataclass(frozen=True)
class AsrResult:
    text: str
    language: SourceLanguage
    # Word timings when the provider has them; otherwise the segmenter spreads
    # the chunk's duration over the words.
    words: list[AsrWord] = field(default_factory=list)
    language_probability: float | None = None


@runtime_checkable
class AsrProvider(Protocol):
    #: Recorded on segments as the producer of the source-language caption.
    name: str

    async def load(self) -> None:
        """Load weights or open connections. Raise ProviderUnavailable when it can't."""

    async def transcribe(
        self, pcm: bytes, *, language: SourceLanguage | None, prompt: str | None
    ) -> AsrResult:
        """Transcribe one chunk of 16 kHz mono s16le speech.

        ``language`` is None in auto mode: detect English or Vietnamese. ``prompt``
        carries glossary terms to bias recognition toward VGU names.
        """
        ...

    async def close(self) -> None: ...


@runtime_checkable
class TranslationProvider(Protocol):
    #: Recorded on each translation (`provider` in the contract).
    name: str

    async def load(self) -> None: ...

    async def translate(self, text: str, *, source: SourceLanguage, target: TargetLanguage) -> str: ...

    async def close(self) -> None: ...
