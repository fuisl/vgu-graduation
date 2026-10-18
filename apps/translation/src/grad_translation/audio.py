"""PCM helpers shared by the service and the capture client.

The wire format is fixed (see README, "Ingest protocol"): 16 kHz, mono, signed
16-bit little-endian. Everything here works on that format with the standard
library only, so the mock pipeline and the capture client's file mode need no
native dependencies.
"""

from __future__ import annotations

import math
import sys
from array import array
from collections import deque

SAMPLE_RATE = 16_000
CHANNELS = 1
SAMPLE_WIDTH = 2  # bytes, s16le
ENCODING = "s16le"
BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH


def samples_to_ms(samples: int) -> int:
    return samples * 1000 // SAMPLE_RATE


def ms_to_samples(ms: int) -> int:
    return ms * SAMPLE_RATE // 1000


def _as_int16(pcm: bytes) -> array[int]:
    data = array("h")
    data.frombytes(pcm[: len(pcm) - (len(pcm) % SAMPLE_WIDTH)])
    if sys.byteorder == "big":
        data.byteswap()
    return data


def _to_bytes(data: array[int]) -> bytes:
    if sys.byteorder == "big":
        data = array("h", data)
        data.byteswap()
    return data.tobytes()


def rms_dbfs(pcm: bytes) -> float:
    """Root-mean-square level in dBFS; -inf-like floor of -120 for silence."""
    data = _as_int16(pcm)
    if not data:
        return -120.0
    mean_square = sum(s * s for s in data) / len(data)
    if mean_square <= 0:
        return -120.0
    return max(-120.0, 10 * math.log10(mean_square / (32768.0 * 32768.0)))


def peak_dbfs(pcm: bytes) -> float:
    data = _as_int16(pcm)
    peak = max((abs(s) for s in data), default=0)
    if peak == 0:
        return -120.0
    return max(-120.0, 20 * math.log10(peak / 32768.0))


class PcmRingBuffer:
    """Bounded buffer of the most recent audio, addressed by absolute sample index.

    The ASR stage reads chunks back out of it by range, so a chunk whose
    transcription failed can be replayed on the next provider (or on the same one
    after a hiccup) for as long as it is still inside the window. Memory stays
    bounded at about ``capacity_seconds`` of audio however far ASR falls behind.
    The timeline may have gaps (audio lost upstream); audio either side is kept.
    """

    def __init__(self, capacity_seconds: float) -> None:
        self._capacity = max(1, int(capacity_seconds * SAMPLE_RATE)) * SAMPLE_WIDTH
        self._blocks: deque[tuple[int, bytes]] = deque()  # (start sample, pcm)
        self._bytes = 0
        self._end = 0  # absolute sample index after the newest audio (or gap)

    @property
    def start(self) -> int:
        return self._blocks[0][0] if self._blocks else self._end

    @property
    def end(self) -> int:
        return self._end

    def append(self, pcm: bytes) -> None:
        pcm = pcm[: len(pcm) - len(pcm) % SAMPLE_WIDTH]
        if not pcm:
            return
        self._blocks.append((self._end, pcm))
        self._bytes += len(pcm)
        self._end += len(pcm) // SAMPLE_WIDTH
        while self._bytes > self._capacity and len(self._blocks) > 1:
            _, old = self._blocks.popleft()
            self._bytes -= len(old)

    def skip_to(self, sample: int) -> None:
        """Move the write position forward over a gap; earlier audio stays readable."""
        self._end = max(self._end, sample)

    def read(self, start: int, end: int) -> bytes | None:
        """Audio for ``[start, end)``, or None if any of it was evicted or falls in a gap."""
        if end < start or start < self.start or end > self._end:
            return None
        out = bytearray()
        cursor = start
        for block_start, pcm in self._blocks:
            block_end = block_start + len(pcm) // SAMPLE_WIDTH
            if block_end <= cursor:
                continue
            if block_start > cursor or cursor >= end:
                break
            hi = min(end, block_end)
            out += pcm[(cursor - block_start) * SAMPLE_WIDTH : (hi - block_start) * SAMPLE_WIDTH]
            cursor = hi
        return bytes(out) if cursor >= end else None


class StreamConverter:
    """Streaming downmix + linear resample of s16le audio to the wire format.

    Good enough for speech recognition (the model works at 16 kHz anyway) and
    dependency-free. State carries across calls so block boundaries are seamless.
    """

    def __init__(self, in_rate: int, in_channels: int) -> None:
        if in_rate <= 0 or in_channels <= 0:
            raise ValueError("sample rate and channel count must be positive")
        self._in_rate = in_rate
        self._channels = in_channels
        self._step = in_rate / SAMPLE_RATE
        self._pos = 0.0  # position of the next output sample, in input samples, relative to _prev
        self._prev: int | None = None
        self._carry = b""

    @property
    def passthrough(self) -> bool:
        return self._in_rate == SAMPLE_RATE and self._channels == 1

    def convert(self, pcm: bytes) -> bytes:
        frame = SAMPLE_WIDTH * self._channels
        pcm = self._carry + pcm
        usable = len(pcm) - (len(pcm) % frame)
        self._carry = pcm[usable:]
        pcm = pcm[:usable]
        if self.passthrough:
            return pcm
        data = _as_int16(pcm)
        if self._channels > 1:
            c = self._channels
            mono = [sum(data[i : i + c]) // c for i in range(0, len(data), c)]
        else:
            mono = list(data)
        if self._in_rate == SAMPLE_RATE:
            return _to_bytes(array("h", mono))
        # Linear interpolation; `samples` is the previous block's last sample followed by this block.
        samples = mono if self._prev is None else [self._prev, *mono]
        out = array("h")
        pos = self._pos
        while pos + 1 < len(samples):
            i = int(pos)
            frac = pos - i
            out.append(int(samples[i] + (samples[i + 1] - samples[i]) * frac))
            pos += self._step
        if samples:
            # Re-base so the last input sample becomes index 0 of the next call.
            self._pos = pos - (len(samples) - 1)
            self._prev = samples[-1]
        return _to_bytes(out)
