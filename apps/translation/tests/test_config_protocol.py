from __future__ import annotations

from pathlib import Path

import pytest

from grad_translation.config import ConfigError, load_settings
from grad_translation.pipeline import session_label
from grad_translation.protocol import (
    CLOSE_UNSUPPORTED_FORMAT,
    Gap,
    ProtocolError,
    Start,
    Stop,
    parse_control,
    parse_json,
)
from grad_translation.providers import create_asr_providers, create_mt_provider


def test_defaults_are_the_mock_pipeline() -> None:
    s = load_settings({})
    assert s.asr_providers == ("mock",) and s.mt_provider == "mock"
    assert s.target_languages == ("de", "en", "vi")
    assert s.source_language is None
    assert s.port == 8000 and s.service_token is None
    assert s.segments_url == "http://localhost:4000/internal/translation/segments"


def test_env_selects_providers_and_options() -> None:
    s = load_settings(
        {
            "API_INTERNAL_URL": "http://api.grad.svc.cluster.local/",
            "SERVICE_TOKEN": "t",
            "MODEL_CACHE": "/models",
            "ASR_PROVIDERS": "faster-whisper, mock",
            "MT_PROVIDER": "nllb",
            "TARGET_LANGUAGES": "vi,de",
            "SOURCE_LANGUAGE": "VI",
            "WHISPER_MODEL": "large-v3-turbo",
            "WHISPER_VAD_FILTER": "false",
        }
    )
    assert s.segments_url == "http://api.grad.svc.cluster.local/internal/translation/segments"
    assert s.asr_providers == ("faster-whisper", "mock")
    assert s.target_languages == ("vi", "de")
    assert s.source_language == "vi"
    assert s.model_cache == Path("/models")
    assert s.faster_whisper.model == "large-v3-turbo" and s.faster_whisper.vad_filter is False
    # Factories build without importing the heavy libraries (they load lazily in load()).
    asr = create_asr_providers(s)
    assert [p.name for p in asr] == ["faster-whisper:large-v3-turbo", "mock"]
    assert create_mt_provider(s, "nllb").name == "nllb:nllb-200-distilled-600M-ct2-int8"


@pytest.mark.parametrize(
    "env",
    [
        {"TARGET_LANGUAGES": "fr"},
        {"SOURCE_LANGUAGE": "de"},
        {"PORT": "eighty"},
        {"CHUNK_MIN_MS": "5000", "CHUNK_MAX_MS": "100"},
    ],
)
def test_invalid_config_is_rejected(env: dict[str, str]) -> None:
    with pytest.raises(ConfigError):
        load_settings(env)


def test_unknown_provider_names_are_rejected() -> None:
    with pytest.raises(ValueError, match="unknown ASR provider"):
        create_asr_providers(load_settings({"ASR_PROVIDERS": "cloud-x"}))
    with pytest.raises(ValueError, match="unknown MT provider"):
        create_mt_provider(load_settings({}), "cloud-y")


def test_control_messages_match_the_contract() -> None:
    raw = (
        '{"type":"start","sessionId":"ceremony","sourceLanguage":"vi",'
        '"sampleRate":16000,"channels":1,"encoding":"s16le"}'
    )
    data = parse_json(raw)
    assert data is not None
    assert parse_control(data) == Start(session="ceremony", language="vi")
    assert parse_control({"type": "start"}) == Start(session=None, language=None)
    assert parse_control({"type": "stop"}) == Stop()
    assert parse_control({"type": "gap", "samples": 1600}) == Gap(1600)
    # Unknown types and non-objects are ignored, like the API does.
    assert parse_control({"type": "future-thing"}) is None
    assert parse_json("[1]") is None
    assert parse_json("not json") is None
    assert parse_json('{"type": 1}') is None


@pytest.mark.parametrize(
    "message",
    [
        {"type": "start", "sourceLanguage": "de"},
        {"type": "start", "sourceLanguage": "auto"},
        {"type": "start", "sessionId": ""},
        {"type": "start", "sessionId": "x" * 101},
        {"type": "gap", "samples": -1},
        {"type": "gap", "samples": True},
    ],
)
def test_bad_control_messages_are_rejected(message: dict[str, object]) -> None:
    with pytest.raises(ProtocolError):
        parse_control(message)


def test_wrong_audio_format_has_its_own_close_code() -> None:
    for wrong in ({"sampleRate": 48000}, {"channels": 2}, {"encoding": "f32le"}):
        with pytest.raises(ProtocolError) as err:
            parse_control({"type": "start", **wrong})
        assert err.value.close_code == CLOSE_UNSUPPORTED_FORMAT


def test_session_labels_are_sanitised() -> None:
    assert session_label("Ceremony Day 1!", "ceremony") == "ceremony-day-1"
    assert session_label(None, "ceremony") == "ceremony"
    assert session_label("!!!", "ceremony") == "ceremony"
