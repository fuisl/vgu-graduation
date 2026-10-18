"""Deterministic, dependency-free providers for tests and local development.

The mock ASR does not listen: every chunk of speech it is given becomes the
next line of a script, so the same audio always yields the same captions.
Segments it produces carry provider ``mock`` so they can never be mistaken
for real output.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from ..config import SourceLanguage, TargetLanguage
from .base import AsrResult, AsrWord, ProviderUnavailable

DEFAULT_SCRIPT: tuple[tuple[SourceLanguage, str], ...] = (
    ("en", "Good morning and welcome to the graduation ceremony"),
    ("en", "of the Vietnamese German University. Please take your seats."),
    ("en", "We are proud of every graduate of the class of 2026!"),
    ("vi", "Xin chúc mừng các tân cử nhân."),
)


def load_script(path: Path) -> tuple[tuple[SourceLanguage, str], ...]:
    """One line per chunk; a line may start with `en:` or `vi:` (default en)."""
    lines: list[tuple[SourceLanguage, str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lang: SourceLanguage = "en"
        prefix, sep, rest = line.partition(":")
        if sep and prefix.strip().lower() in ("en", "vi"):
            lang = "vi" if prefix.strip().lower() == "vi" else "en"
            line = rest.strip()
        lines.append((lang, line))
    if not lines:
        raise ValueError(f"mock ASR script {path} has no lines")
    return tuple(lines)


class MockAsrProvider:
    name = "mock"

    def __init__(
        self,
        script: tuple[tuple[SourceLanguage, str], ...] = DEFAULT_SCRIPT,
        *,
        fail_first: int = 0,
        delay_s: float = 0.0,
        name: str = "mock",
    ) -> None:
        self._script = script
        self._index = 0
        self._fail_remaining = fail_first
        self._delay = delay_s
        self.name = name
        self.calls = 0

    async def load(self) -> None:
        return None

    async def transcribe(
        self, pcm: bytes, *, language: SourceLanguage | None, prompt: str | None
    ) -> AsrResult:
        self.calls += 1
        if self._delay:
            await asyncio.sleep(self._delay)
        if self._fail_remaining > 0:
            self._fail_remaining -= 1
            raise ProviderUnavailable(f"{self.name}: simulated failure")
        lang, text = self._script[self._index % len(self._script)]
        self._index += 1
        duration_ms = len(pcm) * 1000 // 32_000
        words = text.split()
        step = duration_ms / max(1, len(words))
        timed = [
            AsrWord(text=w, start_ms=int(i * step), end_ms=int((i + 1) * step)) for i, w in enumerate(words)
        ]
        return AsrResult(text=text, language=language or lang, words=timed, language_probability=1.0)

    async def close(self) -> None:
        return None


class MockTranslationProvider:
    """`[de] original text`: obviously fake, but shows which language went where."""

    name = "mock"

    def __init__(self, *, fail_languages: tuple[str, ...] = (), delay_s: float = 0.0, name: str = "mock"):
        self._fail = fail_languages
        self._delay = delay_s
        self.name = name

    async def load(self) -> None:
        return None

    async def translate(self, text: str, *, source: SourceLanguage, target: TargetLanguage) -> str:
        if self._delay:
            await asyncio.sleep(self._delay)
        if target in self._fail:
            raise ProviderUnavailable(f"{self.name}: simulated failure for {target}")
        return f"[{target}] {text}"

    async def close(self) -> None:
        return None
