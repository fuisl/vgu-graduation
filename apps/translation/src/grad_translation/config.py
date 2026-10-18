"""Service configuration, read once from the environment.

Variable names match the Deployment in
`docs/architecture/target/kubernetes-workloads.md` (`API_INTERNAL_URL`,
`SERVICE_TOKEN`, `MODEL_CACHE`, port 8000). Providers are chosen by name, so a
new backend (a cloud ASR, say) is one registry entry plus its own env block.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, cast

SourceLanguage = Literal["en", "vi"]
TargetLanguage = Literal["de", "en", "vi"]
SOURCE_LANGUAGES: tuple[SourceLanguage, ...] = ("en", "vi")
TARGET_LANGUAGES: tuple[TargetLanguage, ...] = ("de", "en", "vi")


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class FasterWhisperSettings:
    model: str = "small"
    device: str = "auto"  # auto | cuda | cpu
    compute_type: str = "auto"  # auto picks int8_float16 on CUDA, int8 on CPU
    beam_size: int = 1
    vad_filter: bool = True


@dataclass(frozen=True)
class NllbSettings:
    # A CTranslate2 conversion of facebook/nllb-200-distilled-600M under MODEL_CACHE
    # (see scripts/fetch-models.sh); the tokenizer comes from the same directory.
    model: str = "nllb-200-distilled-600M-ct2-int8"
    device: str = "auto"
    compute_type: str = "auto"
    beam_size: int = 2


@dataclass(frozen=True)
class Settings:
    host: str = "0.0.0.0"
    port: int = 8000
    api_internal_url: str = "http://localhost:4000"
    # Bearer token for POST /internal/translation/segments. When set, the ingest
    # WebSocket also requires it from the API (defence in depth next to the
    # NetworkPolicy); unset only in local dev.
    service_token: str | None = None
    model_cache: Path = Path("/models")
    # Ordered failover chain, e.g. "faster-whisper" or "faster-whisper,mock" in dev.
    asr_providers: tuple[str, ...] = ("mock",)
    mt_provider: str = "mock"
    # Optional fast provider whose output is posted as `draft` before the final one.
    mt_draft_provider: str | None = None
    target_languages: tuple[TargetLanguage, ...] = TARGET_LANGUAGES
    # Fixed source language, or None to let ASR detect English or Vietnamese.
    source_language: SourceLanguage | None = None
    session_label: str = "ceremony"
    glossary_path: Path | None = None
    mock_asr_script: Path | None = None
    log_level: str = "INFO"
    # Chunking (energy VAD): a pause this long ends a chunk; chunks never exceed max.
    vad_threshold_dbfs: float = -45.0
    chunk_pause_ms: int = 600
    chunk_min_ms: int = 300
    chunk_max_ms: int = 12_000
    # A pause this long also closes the pending sentence (it never gets revised).
    sentence_pause_ms: int = 1_500
    ring_buffer_seconds: float = 90.0
    # ASR attempts give up on a chunk once it is this far behind live audio.
    asr_max_lag_ms: int = 20_000
    asr_timeout_s: float = 15.0
    mt_timeout_s: float = 10.0
    # A queued translation older than this is posted as failed instead of translated late.
    mt_max_queue_s: float = 20.0
    # Pending segment posts kept while the API is unreachable; oldest are dropped beyond it.
    push_queue_max: int = 2_000
    push_backoff_max_s: float = 30.0
    disconnect_flush_s: float = 3.0
    faster_whisper: FasterWhisperSettings = field(default_factory=FasterWhisperSettings)
    nllb: NllbSettings = field(default_factory=NllbSettings)

    @property
    def segments_url(self) -> str:
        return self.api_internal_url.rstrip("/") + "/internal/translation/segments"


def _int(env: Mapping[str, str], key: str, default: int) -> int:
    raw = env.get(key)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as err:
        raise ConfigError(f"{key} must be an integer") from err


def _float(env: Mapping[str, str], key: str, default: float) -> float:
    raw = env.get(key)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError as err:
        raise ConfigError(f"{key} must be a number") from err


def _bool(env: Mapping[str, str], key: str, default: bool) -> bool:
    raw = env.get(key)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _list(env: Mapping[str, str], key: str) -> tuple[str, ...] | None:
    raw = env.get(key)
    if raw is None or raw.strip() == "":
        return None
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _path(env: Mapping[str, str], key: str) -> Path | None:
    raw = env.get(key)
    return Path(raw) if raw else None


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env
    defaults = Settings()

    targets_raw = _list(env, "TARGET_LANGUAGES") or defaults.target_languages
    for lang in targets_raw:
        if lang not in TARGET_LANGUAGES:
            raise ConfigError(f"TARGET_LANGUAGES: unsupported language {lang!r} (use de, en, vi)")
    targets = cast(tuple[TargetLanguage, ...], tuple(dict.fromkeys(targets_raw)))

    source_raw = (env.get("SOURCE_LANGUAGE") or "auto").strip().lower()
    if source_raw != "auto" and source_raw not in SOURCE_LANGUAGES:
        raise ConfigError("SOURCE_LANGUAGE must be auto, en or vi")
    source = None if source_raw == "auto" else cast(SourceLanguage, source_raw)

    asr = _list(env, "ASR_PROVIDERS") or _list(env, "ASR_PROVIDER") or defaults.asr_providers

    settings = Settings(
        host=env.get("HOST") or defaults.host,
        port=_int(env, "PORT", defaults.port),
        api_internal_url=env.get("API_INTERNAL_URL") or defaults.api_internal_url,
        service_token=env.get("SERVICE_TOKEN") or None,
        model_cache=Path(env.get("MODEL_CACHE") or defaults.model_cache),
        asr_providers=asr,
        mt_provider=(env.get("MT_PROVIDER") or defaults.mt_provider).strip(),
        mt_draft_provider=(env.get("MT_DRAFT_PROVIDER") or "").strip() or None,
        target_languages=targets,
        source_language=source,
        session_label=env.get("SESSION_LABEL") or defaults.session_label,
        glossary_path=_path(env, "GLOSSARY_PATH"),
        mock_asr_script=_path(env, "MOCK_ASR_SCRIPT"),
        log_level=(env.get("LOG_LEVEL") or defaults.log_level).upper(),
        vad_threshold_dbfs=_float(env, "VAD_THRESHOLD_DBFS", defaults.vad_threshold_dbfs),
        chunk_pause_ms=_int(env, "CHUNK_PAUSE_MS", defaults.chunk_pause_ms),
        chunk_min_ms=_int(env, "CHUNK_MIN_MS", defaults.chunk_min_ms),
        chunk_max_ms=_int(env, "CHUNK_MAX_MS", defaults.chunk_max_ms),
        sentence_pause_ms=_int(env, "SENTENCE_PAUSE_MS", defaults.sentence_pause_ms),
        ring_buffer_seconds=_float(env, "RING_BUFFER_SECONDS", defaults.ring_buffer_seconds),
        asr_max_lag_ms=_int(env, "ASR_MAX_LAG_MS", defaults.asr_max_lag_ms),
        asr_timeout_s=_float(env, "ASR_TIMEOUT_S", defaults.asr_timeout_s),
        mt_timeout_s=_float(env, "MT_TIMEOUT_S", defaults.mt_timeout_s),
        mt_max_queue_s=_float(env, "MT_MAX_QUEUE_S", defaults.mt_max_queue_s),
        push_queue_max=_int(env, "PUSH_QUEUE_MAX", defaults.push_queue_max),
        push_backoff_max_s=_float(env, "PUSH_BACKOFF_MAX_S", defaults.push_backoff_max_s),
        disconnect_flush_s=_float(env, "DISCONNECT_FLUSH_S", defaults.disconnect_flush_s),
        faster_whisper=FasterWhisperSettings(
            model=env.get("WHISPER_MODEL") or FasterWhisperSettings.model,
            device=env.get("WHISPER_DEVICE") or FasterWhisperSettings.device,
            compute_type=env.get("WHISPER_COMPUTE_TYPE") or FasterWhisperSettings.compute_type,
            beam_size=_int(env, "WHISPER_BEAM_SIZE", FasterWhisperSettings.beam_size),
            vad_filter=_bool(env, "WHISPER_VAD_FILTER", FasterWhisperSettings.vad_filter),
        ),
        nllb=NllbSettings(
            model=env.get("NLLB_MODEL") or NllbSettings.model,
            device=env.get("NLLB_DEVICE") or NllbSettings.device,
            compute_type=env.get("NLLB_COMPUTE_TYPE") or NllbSettings.compute_type,
            beam_size=_int(env, "NLLB_BEAM_SIZE", NllbSettings.beam_size),
        ),
    )
    if not settings.asr_providers:
        raise ConfigError("ASR_PROVIDERS must name at least one provider")
    if settings.chunk_min_ms <= 0 or settings.chunk_max_ms < settings.chunk_min_ms:
        raise ConfigError("CHUNK_MIN_MS must be positive and not exceed CHUNK_MAX_MS")
    return settings
