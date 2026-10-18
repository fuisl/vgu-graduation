"""Local GPU ASR with faster-whisper (CTranslate2 Whisper).

Sized for the homelab GPU (6 GB VRAM): `small` by default, int8 weights with
float16 activations on CUDA. `large-v3-turbo` in int8_float16 (about 1.6 GB)
also fits next to NLLB-600M if Vietnamese quality needs it. Weights download
once into ``MODEL_CACHE/whisper`` (a PVC in the cluster) and are reused.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from pathlib import Path
from typing import Any

from ..config import SOURCE_LANGUAGES, FasterWhisperSettings, SourceLanguage
from .base import AsrResult, AsrWord, ProviderUnavailable

log = logging.getLogger(__name__)


def _resolve_device(device: str) -> str:
    if device != "auto":
        return device
    try:
        import ctranslate2

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:  # pragma: no cover - depends on the host
        return "cpu"


def _compute_type(device: str, compute_type: str) -> str:
    if compute_type != "auto":
        return compute_type
    return "int8_float16" if device == "cuda" else "int8"


def pcm_to_float32(pcm: bytes) -> Any:
    """s16le bytes to the float32 numpy array faster-whisper expects."""
    import numpy as np  # installed with faster-whisper

    return np.frombuffer(pcm[: len(pcm) - len(pcm) % 2], dtype="<i2").astype(np.float32) / 32768.0


class FasterWhisperProvider:
    def __init__(self, settings: FasterWhisperSettings, model_cache: Path) -> None:
        self._settings = settings
        self._download_root = model_cache / "whisper"
        self._model: Any = None
        # One inference at a time on the single GPU; CTranslate2 releases the GIL.
        self._lock = threading.Lock()
        self.name = f"faster-whisper:{settings.model}"

    async def load(self) -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as err:
            raise ProviderUnavailable("faster-whisper is not installed (install the `gpu` extra)") from err
        device = _resolve_device(self._settings.device)
        compute = _compute_type(device, self._settings.compute_type)

        def _load() -> Any:
            self._download_root.mkdir(parents=True, exist_ok=True)
            return WhisperModel(
                self._settings.model,
                device=device,
                compute_type=compute,
                download_root=str(self._download_root),
            )

        try:
            self._model = await asyncio.to_thread(_load)
        except Exception as err:
            raise ProviderUnavailable(f"{self.name}: failed to load ({err})") from err
        log.info("asr loaded: %s on %s (%s)", self.name, device, compute)

    def _decode(self, audio: Any, language: str | None, prompt: str | None) -> tuple[list[Any], Any]:
        segments, info = self._model.transcribe(
            audio,
            language=language,
            beam_size=self._settings.beam_size,
            # Live captions can't wait for six temperature fallbacks on a hard chunk.
            temperature=(0.0, 0.4),
            vad_filter=self._settings.vad_filter,
            word_timestamps=True,
            condition_on_previous_text=False,
            initial_prompt=prompt,
        )
        return list(segments), info  # decoding runs lazily while iterating

    def _run(self, pcm: bytes, language: SourceLanguage | None, prompt: str | None) -> AsrResult:
        if self._model is None:
            raise ProviderUnavailable(f"{self.name}: not loaded")
        audio = pcm_to_float32(pcm)
        # A call that timed out keeps running in its thread; don't queue another behind it.
        if not self._lock.acquire(blocking=False):
            raise ProviderUnavailable(f"{self.name}: still busy with an earlier chunk")
        try:
            pieces, info = self._decode(audio, language, prompt)
            detected = info.language
            if detected not in SOURCE_LANGUAGES:
                # The ceremony is English or Vietnamese: take the likelier of the two and redo.
                probs = dict(getattr(info, "all_language_probs", None) or [])
                detected = max(SOURCE_LANGUAGES, key=lambda lang: probs.get(lang, 0.0))
                pieces, info = self._decode(audio, detected, prompt)
        finally:
            self._lock.release()
        words: list[AsrWord] = []
        for piece in pieces:
            for w in piece.words or []:
                text = w.word.strip()
                if not text:
                    continue
                if words and not w.word.startswith(" "):
                    # A sub-word continuation ("Vietnamese" + "-German"): glue it on.
                    prev = words[-1]
                    words[-1] = AsrWord(prev.text + text, prev.start_ms, int(w.end * 1000))
                    continue
                words.append(AsrWord(text=text, start_ms=int(w.start * 1000), end_ms=int(w.end * 1000)))
        text = " ".join(w.text for w in words) or " ".join(p.text.strip() for p in pieces).strip()
        lang: SourceLanguage = "vi" if detected == "vi" else "en"
        return AsrResult(
            text=text,
            language=lang,
            words=words,
            language_probability=getattr(info, "language_probability", None),
        )

    async def transcribe(
        self, pcm: bytes, *, language: SourceLanguage | None, prompt: str | None
    ) -> AsrResult:
        return await asyncio.to_thread(self._run, pcm, language, prompt)

    async def close(self) -> None:
        self._model = None
