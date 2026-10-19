from __future__ import annotations

import asyncio

import pytest

from grad_translation.asr import AllProvidersFailed, ResilientAsr
from grad_translation.providers.base import AsrResult, ProviderUnavailable
from grad_translation.providers.mock import MockAsrProvider


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class Hanging(MockAsrProvider):
    async def transcribe(self, pcm: bytes, *, language: object, prompt: object) -> AsrResult:
        await asyncio.sleep(10)
        raise AssertionError("unreachable")


class Unloadable(MockAsrProvider):
    loads = 0

    async def load(self) -> None:
        self.loads += 1
        raise ProviderUnavailable("no weights")


async def test_fails_over_to_the_next_provider() -> None:
    primary = MockAsrProvider(fail_first=1, name="primary")
    backup = MockAsrProvider(name="backup")
    asr = ResilientAsr([primary, backup], timeout_s=1)
    await asr.load()
    result, name = await asr.transcribe(b"\x00" * 3200, language=None, prompt=None)
    assert name == "backup" and result.text
    result, name = await asr.transcribe(b"\x00" * 3200, language=None, prompt=None)
    assert name == "primary"


async def test_circuit_opens_after_repeated_failures_and_recovers() -> None:
    clock = Clock()
    primary = MockAsrProvider(fail_first=3, name="primary")
    backup = MockAsrProvider(name="backup")
    asr = ResilientAsr([primary, backup], timeout_s=1, failure_threshold=3, cooldown_s=30, clock=clock)
    for _ in range(3):
        _, name = await asr.transcribe(b"", language="en", prompt=None)
        assert name == "backup"
    assert asr.status()[0]["circuitOpen"] is True
    calls = primary.calls
    _, name = await asr.transcribe(b"", language="en", prompt=None)
    assert name == "backup" and primary.calls == calls, "open circuit skips the primary"
    clock.now = 31
    _, name = await asr.transcribe(b"", language="en", prompt=None)
    assert name == "primary"
    assert asr.status()[0]["failures"] == 0


async def test_timeouts_count_as_failures() -> None:
    asr = ResilientAsr([Hanging(name="slow"), MockAsrProvider(name="fast")], timeout_s=0.05)
    _, name = await asr.transcribe(b"", language="en", prompt=None)
    assert name == "fast"


async def test_all_failing_raises_and_unloadable_providers_retry_later() -> None:
    clock = Clock()
    broken = Unloadable(name="gpu")
    asr = ResilientAsr([broken], timeout_s=1, load_retry_s=60, clock=clock)
    await asr.load()
    assert not asr.ready
    with pytest.raises(AllProvidersFailed):
        await asr.transcribe(b"", language=None, prompt=None)
    assert broken.loads == 1, "no reload attempt before the retry interval"
    clock.now = 61
    with pytest.raises(AllProvidersFailed):
        await asr.transcribe(b"", language=None, prompt=None)
    assert broken.loads == 2
