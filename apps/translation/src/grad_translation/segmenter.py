"""Turns a stream of recognised words into sentences that are never revised.

ASR output arrives chunk by chunk and a sentence often spans two chunks, so the
segmenter keeps the unfinished tail pending and only emits a sentence once it
ends: at sentence punctuation, when it grows past ``max_chars`` (split at the
last comma if there is one), when the language changes, or when the pipeline
calls ``flush`` after a long pause or a gap. Once emitted, a sentence is final:
it gets a sequence number and is translated and published as is.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .config import SourceLanguage
from .providers.base import AsrResult

_END = re.compile(r"[.!?…。]+[\"'”’)»\]]*$")  # noqa: RUF001
_SOFT = re.compile(r"[,;:–—][\"'”’)»\]]*$")  # noqa: RUF001
# Words ending in a period that don't end a sentence (titles in en, de and vi).
_ABBREVIATIONS = frozenset(
    {
        "mr.", "mrs.", "ms.", "dr.", "prof.", "st.", "jr.", "sr.", "vs.", "no.", "e.g.", "i.e.",
        "b.sc.", "m.sc.", "ph.d.", "dipl.-ing.", "dipl.", "ing.", "hr.", "fr.", "bzw.", "z.b.",
        "gs.", "pgs.", "ts.", "ths.", "tp.", "ks.",
    }
)  # fmt: skip


@dataclass(frozen=True)
class Word:
    text: str
    start_ms: int  # session timeline
    end_ms: int


@dataclass(frozen=True)
class Sentence:
    text: str
    language: SourceLanguage
    start_ms: int
    end_ms: int


def words_from_result(result: AsrResult, chunk_start_ms: int, chunk_end_ms: int) -> list[Word]:
    """Session-timed words for one chunk, spreading the chunk evenly when ASR gave no timings."""
    if result.words:
        return [
            Word(w.text, chunk_start_ms + max(0, w.start_ms), chunk_start_ms + max(w.start_ms, w.end_ms))
            for w in result.words
            if w.text.strip()
        ]
    tokens = result.text.split()
    if not tokens:
        return []
    total = sum(len(t) for t in tokens)
    span = max(0, chunk_end_ms - chunk_start_ms)
    out: list[Word] = []
    acc = 0
    for token in tokens:
        start = chunk_start_ms + span * acc // total
        acc += len(token)
        out.append(Word(token, start, chunk_start_ms + span * acc // total))
    return out


def _ends_sentence(word: str) -> bool:
    if not _END.search(word):
        return False
    lowered = word.casefold()
    if lowered in _ABBREVIATIONS:
        return False
    # An initial such as "J." in "J. Smith".
    return not (len(word) == 2 and word[0].isalpha() and word[0].isupper() and word[1] == ".")


class SentenceSegmenter:
    def __init__(self, max_chars: int = 180) -> None:
        self._max_chars = max_chars
        self._pending: list[Word] = []
        self._language: SourceLanguage | None = None

    @property
    def pending_text(self) -> str:
        return " ".join(w.text for w in self._pending)

    def feed(self, words: list[Word], language: SourceLanguage) -> list[Sentence]:
        out: list[Sentence] = []
        if self._pending and self._language != language:
            out.extend(self.flush())
        self._language = language
        for word in words:
            self._pending.append(word)
            if _ends_sentence(word.text):
                out.extend(self._emit(len(self._pending)))
            elif len(self.pending_text) > self._max_chars:
                out.extend(self._emit(self._soft_break()))
        return out

    def flush(self) -> list[Sentence]:
        return self._emit(len(self._pending))

    def _soft_break(self) -> int:
        # The last comma-like break in the second half, else everything pending.
        for i in range(len(self._pending) - 1, len(self._pending) // 2 - 1, -1):
            if _SOFT.search(self._pending[i].text):
                return i + 1
        return len(self._pending)

    def _emit(self, count: int) -> list[Sentence]:
        if count <= 0 or self._language is None:
            return []
        words, self._pending = self._pending[:count], self._pending[count:]
        text = " ".join(w.text for w in words).strip()
        if not text:
            return []
        return [Sentence(text, self._language, words[0].start_ms, max(words[-1].end_ms, words[0].start_ms))]
