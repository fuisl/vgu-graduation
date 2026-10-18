"""Glossary of VGU names and programmes, in the three caption languages.

Used three ways, all plain text substitution so every provider benefits:

- ``prompt(lang)`` biases ASR toward the right spellings (Whisper's initial prompt).
- ``correct(text, lang)`` fixes known mis-hearings and variants to the canonical form.
- ``prepare(text, source, target)`` swaps a term for its target-language form
  before MT, so "Vietnamese-German University" doesn't come out as a literal
  translation in German or Vietnamese.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

LANGS = ("de", "en", "vi")


@dataclass(frozen=True)
class Term:
    forms: dict[str, str]  # language -> canonical form
    aliases: dict[str, tuple[str, ...]]


def _pattern(phrases: list[str]) -> re.Pattern[str] | None:
    if not phrases:
        return None
    # Longest first so "Vietnamese German University" wins over a shorter overlap.
    alternatives = sorted({p for p in phrases if p}, key=len, reverse=True)
    body = "|".join(re.escape(p) for p in alternatives)
    return re.compile(rf"(?<!\w)(?:{body})(?!\w)", re.IGNORECASE)


class Glossary:
    def __init__(self, terms: list[Term]) -> None:
        self.terms = terms
        self._correct: dict[str, tuple[re.Pattern[str] | None, dict[str, str]]] = {}
        for lang in LANGS:
            mapping: dict[str, str] = {}
            for term in terms:
                canonical = term.forms.get(lang)
                if not canonical:
                    continue
                # Aliases only: the canonical form itself is left in whatever case it was said.
                for alias in term.aliases.get(lang, ()):
                    mapping[alias.casefold()] = canonical
            self._correct[lang] = (_pattern(list(mapping)), mapping)

    @classmethod
    def load(cls, path: Path | None = None) -> Glossary:
        if path is None:
            raw = resources.files("grad_translation").joinpath("glossary.json").read_text(encoding="utf-8")
        else:
            raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        terms = []
        for entry in data.get("terms", []):
            forms = {lang: entry[lang] for lang in LANGS if entry.get(lang)}
            aliases = {lang: tuple(v) for lang, v in (entry.get("aliases") or {}).items()}
            terms.append(Term(forms=forms, aliases=aliases))
        return cls(terms)

    @classmethod
    def empty(cls) -> Glossary:
        return cls([])

    def prompt(self, lang: str | None) -> str | None:
        langs = [lang] if lang else ["en", "vi"]
        words = [t.forms[x] for t in self.terms for x in langs if x in t.forms]
        unique = list(dict.fromkeys(words))
        return ", ".join(unique) + "." if unique else None

    def correct(self, text: str, lang: str) -> str:
        pattern, mapping = self._correct.get(lang, (None, {}))
        if pattern is None:
            return text
        return pattern.sub(lambda m: mapping[m.group(0).casefold()], text)

    def prepare(self, text: str, source: str, target: str) -> str:
        if source == target:
            return text
        mapping = {
            t.forms[source].casefold(): t.forms[target]
            for t in self.terms
            if source in t.forms and target in t.forms
        }
        pattern = _pattern(list(mapping))
        if pattern is None:
            return text
        return pattern.sub(lambda m: mapping[m.group(0).casefold()], text)
