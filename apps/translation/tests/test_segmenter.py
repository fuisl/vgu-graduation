from __future__ import annotations

from grad_translation.providers.base import AsrResult, AsrWord
from grad_translation.segmenter import SentenceSegmenter, Word, words_from_result


def words(text: str, start: int = 0, step: int = 100) -> list[Word]:
    return [Word(w, start + i * step, start + (i + 1) * step) for i, w in enumerate(text.split())]


def test_sentence_spanning_two_chunks_is_emitted_once_complete() -> None:
    seg = SentenceSegmenter()
    assert seg.feed(words("Welcome to the"), "en") == []
    out = seg.feed(words("ceremony. Please sit", start=300), "en")
    assert [s.text for s in out] == ["Welcome to the ceremony."]
    assert (out[0].start_ms, out[0].end_ms) == (0, 400)
    assert seg.pending_text == "Please sit"
    assert [s.text for s in seg.flush()] == ["Please sit"]
    assert seg.flush() == []


def test_abbreviations_and_initials_do_not_end_sentences() -> None:
    seg = SentenceSegmenter()
    out = seg.feed(words("Please welcome Prof. Dr. J. Nguyen and Mr. Tran."), "en")
    assert [s.text for s in out] == ["Please welcome Prof. Dr. J. Nguyen and Mr. Tran."]
    out = seg.feed(words("Xin mời PGS. TS. Lê lên phát biểu."), "vi")
    assert [s.text for s in out] == ["Xin mời PGS. TS. Lê lên phát biểu."]


def test_closing_quotes_and_other_terminators() -> None:
    seg = SentenceSegmenter()
    out = seg.feed(words('He said "congratulations!" Then… we cheered?'), "en")
    assert [s.text for s in out] == ['He said "congratulations!"', "Then…", "we cheered?"]


def test_language_change_closes_the_pending_sentence() -> None:
    seg = SentenceSegmenter()
    seg.feed(words("Thank you"), "en")
    out = seg.feed(words("Cảm ơn."), "vi")
    assert [(s.language, s.text) for s in out] == [("en", "Thank you"), ("vi", "Cảm ơn.")]


def test_run_on_speech_is_split_at_a_comma() -> None:
    seg = SentenceSegmenter(max_chars=60)
    out = seg.feed(
        words("we thank the parents, the teachers, the staff and every friend who came along today"), "en"
    )
    assert out, "a sentence over max_chars is emitted"
    assert out[0].text.endswith(",")
    assert all(len(s.text) <= 61 for s in out)


def test_words_from_result_uses_timings_or_spreads_evenly() -> None:
    timed = AsrResult(text="a b", language="en", words=[AsrWord("a", 0, 100), AsrWord("b", 150, 300)])
    assert words_from_result(timed, 1_000, 2_000) == [Word("a", 1_000, 1_100), Word("b", 1_150, 1_300)]
    untimed = AsrResult(text="aa bb", language="en")
    assert words_from_result(untimed, 0, 1_000) == [Word("aa", 0, 500), Word("bb", 500, 1_000)]
    assert words_from_result(AsrResult(text="  ", language="en"), 0, 10) == []
