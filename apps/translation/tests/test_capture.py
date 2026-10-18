from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from grad_translation.capture.client import CaptureConfig, CaptureStreamer, _Frame, _Reconnect
from grad_translation.capture.sources import FileSource, _pick_channel

from .helpers import silence, tone, write_wav


def streamer(buffer_seconds: float = 1.0, language: str = "auto") -> CaptureStreamer:
    return CaptureStreamer(
        CaptureConfig(url="ws://x", token=None, buffer_seconds=buffer_seconds, language=language),  # type: ignore[arg-type]
        out=lambda _: None,
    )


def mark_sent(s: CaptureStreamer, frames: int) -> None:
    """What `_send` does for each frame it writes to the socket."""
    for _ in range(frames):
        frame: _Frame = s._buffer[s._inflight]
        s._epoch_sent += frame.samples
        frame.sent_end = s._epoch_sent
        s._inflight += 1


def test_buffer_is_bounded_and_unsent_losses_become_a_gap() -> None:
    s = streamer(buffer_seconds=1.0)
    for _ in range(25):  # 2.5 s of 100 ms frames while offline
        s.add_audio(silence(100))
    assert s.captured == 40_000
    assert s._buffered <= 16_000
    assert s.dropped_samples == 40_000 - s._buffered
    assert s._pending_gap == s.dropped_samples, "the service is told about audio it never got"
    assert "LOST" in s.status_line()


def test_acks_release_frames_and_a_new_connection_resends_the_rest() -> None:
    s = streamer(buffer_seconds=10.0)
    for _ in range(10):
        s.add_audio(tone(100))
    mark_sent(s, 6)
    s._ack(4_000)  # covers the first two frames (3,200 samples) but not the third
    assert s.delivered == 3_200 and s._inflight == 4
    s._ack(9_600)
    assert s.delivered == 9_600 and s._inflight == 0
    mark_sent(s, 3)
    s._new_epoch()  # e.g. the translation service reconnected: unacknowledged frames go again
    assert s._inflight == 0 and all(f.sent_end is None for f in s._buffer)
    assert s._buffered == 4 * 1_600
    assert s.dropped_samples == 0 and s._pending_gap == 0


def test_dropping_sent_but_unacknowledged_audio_is_not_reported_as_a_gap() -> None:
    s = streamer(buffer_seconds=0.5)
    for _ in range(5):
        s.add_audio(tone(100))
    mark_sent(s, 5)
    s.add_audio(tone(100))  # pushes the oldest (sent) frame out
    assert s.dropped_samples == 1_600 and s._pending_gap == 0 and s._inflight == 4


def test_start_message_follows_the_contract() -> None:
    auto = json.loads(streamer()._start_message())
    assert auto == {
        "type": "start",
        "sessionId": "ceremony",
        "sampleRate": 16_000,
        "channels": 1,
        "encoding": "s16le",
    }
    vi = json.loads(streamer(language="vi")._start_message())
    assert vi["sourceLanguage"] == "vi"


def test_status_messages_drive_the_state() -> None:
    s = streamer()
    s._on_status({"type": "status", "upstream": "unavailable", "droppedFrames": 0})
    assert s.state == "waiting" and not s.upstream
    s._on_status({"type": "status", "upstream": "connected", "droppedFrames": 0})
    assert s.state == "live" and s.upstream
    s._on_status({"type": "status", "upstream": "unavailable", "droppedFrames": 3})
    assert s.state == "waiting" and s.api_dropped_frames == 3


def test_status_line_shows_signal_state() -> None:
    s = streamer()
    s.add_audio(silence(100))
    assert "no signal" in s.status_line()
    s.add_audio(tone(100))
    assert "dBFS" in s.status_line()


async def test_file_source_converts_wav_to_the_wire_format(tmp_path: Path) -> None:
    stereo_48k = b"".join(b"\x10\x00\x30\x00" for _ in range(48_000))  # 1 s, L=16 R=48
    path = write_wav(tmp_path / "in.wav", stereo_48k, rate=48_000, channels=2)
    frames = [f async for f in FileSource(path, speed=0).frames()]
    total = sum(len(f) for f in frames)
    assert abs(total // 2 - 16_000) <= 2
    assert all(len(f) <= 3_200 for f in frames)
    assert frames[0][:2] == b"\x20\x00"  # average of 16 and 48


def test_pick_channel() -> None:
    data = b"\x01\x00\x02\x00" * 3
    assert _pick_channel(data, 2, 1) == b"\x02\x00" * 3


class _FakeSocket:
    def __init__(self) -> None:
        self.sent: list[bytes | str] = []

    async def send_bytes(self, data: bytes) -> None:
        self.sent.append(data)

    async def send_str(self, data: str) -> None:
        self.sent.append(data)

    async def close(self) -> None:
        return None


async def test_no_ack_timeout_while_the_service_is_unavailable() -> None:
    s = streamer(buffer_seconds=10.0)
    s.config.ack_timeout_s = 0.05
    for _ in range(3):
        s.add_audio(tone(100))
    mark_sent(s, 3)  # in flight when the service went away
    s.upstream = False
    s._last_progress = 0.0
    sock = _FakeSocket()
    with pytest.raises(TimeoutError):  # still waiting for the service, not reconnecting
        await asyncio.wait_for(s._send(sock), 0.3)  # type: ignore[arg-type]
    assert sock.sent == []
    s.upstream = True
    with pytest.raises(_Reconnect):  # the service is back but silent: the socket is dead
        await asyncio.wait_for(s._send(sock), 0.3)  # type: ignore[arg-type]
