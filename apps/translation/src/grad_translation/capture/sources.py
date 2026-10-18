"""Audio sources for the capture client: a sound card (live) or a file (testing).

Both yield 16 kHz mono s16le frames of ``frame_ms`` each. Whatever the device or
file delivers (44.1/48 kHz, stereo from the mixer) is converted here, so the
wire format never depends on the AV laptop's hardware.
"""

from __future__ import annotations

import asyncio
import logging
import wave
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, Protocol

from ..audio import SAMPLE_RATE, SAMPLE_WIDTH, StreamConverter

log = logging.getLogger(__name__)


class AudioSource(Protocol):
    def frames(self) -> AsyncIterator[bytes]: ...


def _frame_bytes(frame_ms: int) -> int:
    return SAMPLE_RATE * frame_ms // 1000 * SAMPLE_WIDTH


class FileSource:
    """WAV (16-bit PCM, any rate or channel count) or raw 16 kHz mono s16le (`.raw`/`.pcm`).

    ``speed`` 1.0 paces frames like a live input, which is what the service sees
    at the venue; 10.0 plays ten times faster; 0 yields frames unpaced.
    """

    def __init__(self, path: Path, *, frame_ms: int = 100, speed: float = 1.0, loop: bool = False):
        self.path = path
        self._frame_ms = frame_ms
        self._speed = speed
        self._loop = loop

    def _read(self) -> bytes:
        if self.path.suffix.lower() in (".raw", ".pcm", ".s16le"):
            return self.path.read_bytes()
        with wave.open(str(self.path), "rb") as wav:
            if wav.getsampwidth() != SAMPLE_WIDTH or wav.getcomptype() != "NONE":
                raise ValueError(
                    f"{self.path}: only 16-bit PCM WAV is supported "
                    "(convert with: ffmpeg -i in.ext -ac 1 -ar 16000 -sample_fmt s16 out.wav)"
                )
            converter = StreamConverter(wav.getframerate(), wav.getnchannels())
            return converter.convert(wav.readframes(wav.getnframes()))

    async def frames(self) -> AsyncIterator[bytes]:
        pcm = await asyncio.to_thread(self._read)
        size = _frame_bytes(self._frame_ms)
        loop = asyncio.get_running_loop()
        started = loop.time()
        sent_s = 0.0
        while True:
            for off in range(0, len(pcm), size):
                frame = pcm[off : off + size]
                yield frame
                sent_s += len(frame) / (SAMPLE_RATE * SAMPLE_WIDTH)
                if self._speed > 0:
                    delay = started + sent_s / self._speed - loop.time()
                    if delay > 0:
                        await asyncio.sleep(delay)
                else:
                    await asyncio.sleep(0)
            if not self._loop:
                return


class DeviceSource:
    """Live input through PortAudio (sounddevice): the mixer's line out into the laptop.

    Opens the device at its own default rate and channel count, so drivers that
    can't do 16 kHz natively still work; ``channel`` picks one input channel
    (1-based) instead of the average of all of them.
    """

    def __init__(
        self,
        device: str | int | None = None,
        *,
        frame_ms: int = 100,
        channels: int | None = None,
        channel: int | None = None,
    ) -> None:
        self._device = device
        self._frame_ms = frame_ms
        self._channels = channels
        self._channel = channel
        self.overflows = 0

    @staticmethod
    def list_devices() -> str:
        sd = _sounddevice()
        return str(sd.query_devices())

    async def frames(self) -> AsyncIterator[bytes]:
        sd = _sounddevice()
        info: Any = sd.query_devices(self._device, "input")
        rate = int(info["default_samplerate"])
        channels = self._channels or min(2, int(info["max_input_channels"])) or 1
        if self._channel is not None and not 1 <= self._channel <= channels:
            raise ValueError(f"--channel must be between 1 and {channels}")
        converter = StreamConverter(rate, 1 if self._channel else channels)
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=200)

        def _deliver(data: bytes) -> None:
            if queue.full():
                self.overflows += 1  # the event loop is stalled; drop rather than grow
                return
            queue.put_nowait(data)

        def callback(indata: Any, frames: int, time: Any, status: Any) -> None:  # PortAudio thread
            if status.input_overflow:
                self.overflows += 1
            loop.call_soon_threadsafe(_deliver, bytes(indata))

        blocksize = rate * self._frame_ms // 1000
        log.info("capturing from %r at %d Hz, %d channel(s)", info["name"], rate, channels)
        with sd.RawInputStream(
            samplerate=rate,
            channels=channels,
            dtype="int16",
            blocksize=blocksize,
            device=self._device,
            callback=callback,
        ):
            while True:
                data = await queue.get()
                if self._channel is not None:
                    data = _pick_channel(data, channels, self._channel - 1)
                out = converter.convert(data)
                if out:
                    yield out


def _pick_channel(data: bytes, channels: int, index: int) -> bytes:
    step = channels * SAMPLE_WIDTH
    start = index * SAMPLE_WIDTH
    return b"".join(data[i + start : i + start + SAMPLE_WIDTH] for i in range(0, len(data) - step + 1, step))


def _sounddevice() -> Any:
    try:
        import sounddevice
    except ImportError as err:  # pragma: no cover - depends on the laptop
        raise SystemExit(
            "live capture needs sounddevice: install with `uv sync --extra capture` "
            "(or use --file for a recording)"
        ) from err
    except OSError as err:  # pragma: no cover - PortAudio missing
        raise SystemExit(f"PortAudio is not available: {err}") from err
    return sounddevice
