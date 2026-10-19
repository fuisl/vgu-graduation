from __future__ import annotations

import asyncio
from typing import Any

from grad_translation.glossary import Glossary
from grad_translation.providers.base import ProviderUnavailable
from grad_translation.providers.mock import MockTranslationProvider
from grad_translation.translate import ManagedTranslator, SegmentRecord, TranslationFanout

from .helpers import check_segment


def record(seq: int = 0, lang: Any = "en", text: str = "Hello.") -> SegmentRecord:
    return SegmentRecord("s-1", seq, 0, 900, lang, text)


def fanout(
    final: Any, *, draft: Any = None, max_queue_s: float = 20.0, timeout_s: float = 1.0
) -> tuple[TranslationFanout, list[dict[str, Any]]]:
    posts: list[dict[str, Any]] = []
    f = TranslationFanout(
        ("de", "en", "vi"),
        ManagedTranslator(final),
        ManagedTranslator(draft) if draft else None,
        Glossary.empty(),
        lambda r: posts.append(r.to_json()),
        timeout_s=timeout_s,
        max_queue_s=max_queue_s,
    )
    return f, posts


def latest(posts: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {t["language"]: t for t in posts[-1]["translations"]}


async def test_posts_the_source_caption_then_each_translation() -> None:
    f, posts = fanout(MockTranslationProvider())
    await f.start()
    f.submit(record(), "faster-whisper:small")
    await f.join(2)
    await f.close()
    for p in posts:
        check_segment(p)
    assert [t["language"] for t in posts[0]["translations"]] == ["en"]
    assert posts[0]["translations"][0] == {
        "language": "en",
        "status": "final",
        "text": "Hello.",
        "provider": "faster-whisper:small",
    }
    assert len(posts) == 3
    final = latest(posts)
    assert final["de"] == {"language": "de", "status": "final", "text": "[de] Hello.", "provider": "mock"}
    assert final["vi"]["text"] == "[vi] Hello."


async def test_one_failing_language_never_blocks_the_others() -> None:
    f, posts = fanout(MockTranslationProvider(fail_languages=("de",)))
    await f.start()
    f.submit(record(), "mock")
    await f.join(2)
    await f.close()
    final = latest(posts)
    assert final["de"] == {"language": "de", "status": "failed", "text": None, "provider": "mock"}
    assert final["vi"]["status"] == "final"
    assert f.status()["failed"]["de"] == 1


async def test_backlog_older_than_the_limit_is_marked_failed_not_translated_late() -> None:
    f, posts = fanout(MockTranslationProvider(delay_s=0.05), max_queue_s=0.01)
    await f.start()
    for seq in range(3):
        f.submit(record(seq), "mock")
    await f.join(2)
    await f.close()
    third = [p for p in posts if p["sequence"] == 2][-1]
    statuses = {t["language"]: t["status"] for t in third["translations"]}
    assert statuses["de"] == "failed" and statuses["en"] == "final"


async def test_draft_then_final_and_draft_kept_when_final_fails() -> None:
    class Draft(MockTranslationProvider):
        async def translate(self, text: str, *, source: Any, target: Any) -> str:
            return f"draft:{target}"

    f, posts = fanout(MockTranslationProvider(fail_languages=("vi",)), draft=Draft(name="fast"))
    await f.start()
    f.submit(record(), "mock")
    await f.join(2)
    await f.close()
    de_posts = [t for p in posts for t in p["translations"] if t["language"] == "de"]
    assert de_posts[0]["status"] == "draft" and de_posts[0]["provider"] == "fast"
    final = latest(posts)
    assert final["de"]["status"] == "final"
    assert final["vi"] == {"language": "vi", "status": "draft", "text": "draft:vi", "provider": "fast"}


async def test_unloadable_provider_yields_failed_translations() -> None:
    class Broken(MockTranslationProvider):
        async def load(self) -> None:
            raise ProviderUnavailable("no model")

    f, posts = fanout(Broken(name="nllb"))
    await f.start()
    f.submit(record(lang="vi", text="Xin chào."), "mock")
    await f.join(2)
    await f.close()
    final = latest(posts)
    assert final["vi"]["status"] == "final"
    assert final["de"]["status"] == "failed" and final["en"]["status"] == "failed"
    assert f.status()["loaded"] is False


async def test_timeout_marks_failed() -> None:
    f, posts = fanout(MockTranslationProvider(delay_s=0.5), timeout_s=0.01)
    await f.start()
    f.submit(record(), "mock")
    await asyncio.wait_for(f.join(2), 3)
    await f.close()
    assert latest(posts)["de"]["status"] == "failed"
