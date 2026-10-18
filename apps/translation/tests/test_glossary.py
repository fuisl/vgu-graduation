from __future__ import annotations

import json
from pathlib import Path

from grad_translation.glossary import Glossary


def test_bundled_glossary_corrects_aliases_to_canonical_names() -> None:
    g = Glossary.load()
    assert g.correct("Welcome to the vietnam german university!", "en") == (
        "Welcome to the Vietnamese-German University!"
    )
    assert g.correct("Sinh viên Đại học Việt Đức", "vi") == "Sinh viên Trường Đại học Việt Đức"
    # Already-canonical text is left alone (no "Trường Trường").
    assert g.correct("Trường Đại học Việt Đức", "vi") == "Trường Đại học Việt Đức"
    # Words that only contain a term are untouched.
    assert g.correct("VGUs and xVGU", "en") == "VGUs and xVGU"


def test_prepare_swaps_terms_for_the_target_language() -> None:
    g = Glossary.load()
    text = "Graduates of Computer Science at the Vietnamese-German University"
    assert g.prepare(text, "en", "de") == "Graduates of Informatik at the Vietnamesisch-Deutsche Universität"
    assert g.prepare(text, "en", "en") == text


def test_prompt_lists_terms_for_asr() -> None:
    g = Glossary.load()
    prompt = g.prompt("en")
    assert prompt is not None and "Vietnamese-German University" in prompt and "VGU" in prompt
    both = g.prompt(None)
    assert both is not None and "Trường Đại học Việt Đức" in both
    assert Glossary.empty().prompt("en") is None


def test_custom_glossary_file(tmp_path: Path) -> None:
    path = tmp_path / "g.json"
    path.write_text(
        json.dumps({"terms": [{"en": "Rector", "de": "Rektor", "aliases": {"en": ["rektor"]}}]}),
        encoding="utf-8",
    )
    g = Glossary.load(path)
    assert g.correct("the rektor speaks", "en") == "the Rector speaks"
    assert g.prepare("the rector speaks", "en", "de") == "the Rektor speaks"
    assert g.prepare("the rector speaks", "en", "vi") == "the rector speaks"
