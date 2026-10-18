from __future__ import annotations

import struct

from grad_translation.asr import Chunk, Pause, VadChunker
from grad_translation.audio import PcmRingBuffer, StreamConverter, peak_dbfs, rms_dbfs

from .helpers import silence, tone


def chunker(**overrides: int) -> VadChunker:
    opts = {"pause_ms": 600, "min_ms": 300, "max_ms": 12_000, "sentence_pause_ms": 1_500}
    opts.update(overrides)
    return VadChunker(threshold_dbfs=-45.0, **opts)


def test_levels() -> None:
    assert rms_dbfs(silence(100)) == -120.0
    assert -16 < rms_dbfs(tone(100)) < -10
    assert -12 < peak_dbfs(tone(100)) < -9


def test_ring_buffer_reads_ranges_and_evicts_old_audio() -> None:
    ring = PcmRingBuffer(capacity_seconds=1.0)
    for i in range(30):  # 3 s in 100 ms blocks
        ring.append(bytes([i]) * 3_200)
    assert ring.end == 48_000
    assert ring.start == 32_000  # only the last second is kept
    assert ring.read(0, 1_600) is None
    assert ring.read(46_400, 48_000) == bytes([29]) * 3_200
    assert ring.read(47_200, 48_800) is None  # beyond the end


def test_ring_buffer_keeps_audio_on_both_sides_of_a_gap() -> None:
    ring = PcmRingBuffer(capacity_seconds=10.0)
    ring.append(b"\x01\x00" * 1_600)
    ring.skip_to(16_000)
    ring.append(b"\x02\x00" * 1_600)
    assert ring.read(0, 1_600) == b"\x01\x00" * 1_600
    assert ring.read(16_000, 17_600) == b"\x02\x00" * 1_600
    assert ring.read(1_000, 16_100) is None  # spans the gap


def test_converter_downmixes_and_resamples_48k_stereo() -> None:
    conv = StreamConverter(48_000, 2)
    frame = struct.pack("<hh", 1000, 3000)  # L, R
    out = b"".join(conv.convert(frame * 4_800) for _ in range(10))  # 1 s in 10 blocks
    samples = struct.unpack(f"<{len(out) // 2}h", out)
    assert abs(len(samples) - 16_000) <= 2
    assert set(samples) == {2000}


def test_converter_handles_odd_block_boundaries() -> None:
    conv = StreamConverter(44_100, 1)
    pcm = tone(1_000)  # pretend it's 44.1 kHz: length scales by 16000/44100
    out = b""
    for i in range(0, len(pcm), 777):  # odd sizes split samples across calls
        out += conv.convert(pcm[i : i + 777])
    assert abs(len(out) // 2 - round(16_000 * 16_000 / 44_100)) <= 2


def test_chunker_cuts_at_pauses_and_reports_long_silence() -> None:
    c = chunker()
    audio = silence(300) + tone(1_000) + silence(800) + tone(1_000) + silence(2_000)
    events = c.push(audio)
    chunks = [e for e in events if isinstance(e, Chunk)]
    pauses = [e for e in events if isinstance(e, Pause)]
    assert len(chunks) == 2
    assert len(pauses) == 1 and pauses[0].at > chunks[1].end
    first = chunks[0]
    # Starts with a little pre-roll before the onset at 300 ms, ends shortly after the speech.
    assert 1_000 <= first.start <= 300 * 16
    assert 1_300 * 16 <= first.end <= 1_520 * 16


def test_chunker_drops_clicks_and_splits_long_speech() -> None:
    c = chunker(max_ms=3_000)
    events = c.push(tone(90) + silence(1_000))
    assert not any(isinstance(e, Chunk) for e in events)
    events = c.push(tone(7_000))
    chunks = [e for e in events if isinstance(e, Chunk)]
    assert len(chunks) == 2
    assert all(ch.end - ch.start <= 3_000 * 16 for ch in chunks)
    assert chunks[1].start == chunks[0].end


def test_chunker_flush_and_jump() -> None:
    c = chunker()
    c.push(tone(500))
    assert c.in_speech
    events = c.jump(10 * 16_000)
    assert isinstance(events[0], Chunk) and isinstance(events[-1], Pause)
    assert c.position == 160_000
    events = c.push(tone(1_000) + silence(700))
    (chunk,) = [e for e in events if isinstance(e, Chunk)]
    assert chunk.start == 160_000  # pre-roll never reaches back across the gap
