"""Provider registry: names in ASR_PROVIDERS / MT_PROVIDER map to factories here.

Heavy backends are imported lazily inside their factory, so the mock and the
tests never import faster-whisper or CTranslate2. To add a provider (a cloud
service, for example): implement `AsrProvider` or `TranslationProvider` from
`base.py`, read its own settings from the environment, and register it below.
"""

from __future__ import annotations

from collections.abc import Callable

from ..config import Settings
from .base import AsrProvider, AsrResult, AsrWord, ProviderUnavailable, TranslationProvider


def _mock_asr(settings: Settings) -> AsrProvider:
    from .mock import DEFAULT_SCRIPT, MockAsrProvider, load_script

    script = load_script(settings.mock_asr_script) if settings.mock_asr_script else DEFAULT_SCRIPT
    return MockAsrProvider(script)


def _faster_whisper(settings: Settings) -> AsrProvider:
    from .faster_whisper import FasterWhisperProvider

    return FasterWhisperProvider(settings.faster_whisper, settings.model_cache)


def _mock_mt(settings: Settings) -> TranslationProvider:
    from .mock import MockTranslationProvider

    return MockTranslationProvider()


def _nllb(settings: Settings) -> TranslationProvider:
    from .nllb import NllbProvider

    return NllbProvider(settings.nllb, settings.model_cache)


ASR_PROVIDERS: dict[str, Callable[[Settings], AsrProvider]] = {
    "mock": _mock_asr,
    "faster-whisper": _faster_whisper,
}

MT_PROVIDERS: dict[str, Callable[[Settings], TranslationProvider]] = {
    "mock": _mock_mt,
    "nllb": _nllb,
}


def create_asr_providers(settings: Settings) -> list[AsrProvider]:
    unknown = [n for n in settings.asr_providers if n not in ASR_PROVIDERS]
    if unknown:
        raise ValueError(f"unknown ASR provider(s) {unknown}; known: {sorted(ASR_PROVIDERS)}")
    return [ASR_PROVIDERS[name](settings) for name in settings.asr_providers]


def create_mt_provider(settings: Settings, name: str) -> TranslationProvider:
    if name not in MT_PROVIDERS:
        raise ValueError(f"unknown MT provider {name!r}; known: {sorted(MT_PROVIDERS)}")
    return MT_PROVIDERS[name](settings)


__all__ = [
    "ASR_PROVIDERS",
    "MT_PROVIDERS",
    "AsrProvider",
    "AsrResult",
    "AsrWord",
    "ProviderUnavailable",
    "TranslationProvider",
    "create_asr_providers",
    "create_mt_provider",
]
