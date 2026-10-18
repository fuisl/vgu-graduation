"""Local GPU machine translation: NLLB-200-distilled-600M on CTranslate2.

One multilingual model covers every pair the ceremony needs (en<->vi, en->de,
vi->de), which opus-mt can't do with one checkpoint. In int8_float16 it takes
well under 1 GB of VRAM next to Whisper. The model directory is a CTranslate2
conversion that also holds the tokenizer files; `scripts/fetch-models.sh`
creates it under MODEL_CACHE once, so the pod never converts at start-up.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from pathlib import Path
from typing import Any

from ..config import NllbSettings, SourceLanguage, TargetLanguage
from .base import ProviderUnavailable
from .faster_whisper import _compute_type, _resolve_device

log = logging.getLogger(__name__)

# FLORES-200 codes used by NLLB.
NLLB_CODES: dict[str, str] = {"en": "eng_Latn", "vi": "vie_Latn", "de": "deu_Latn"}


def _auto_tokenizer() -> Any:
    import transformers

    tf: Any = transformers  # partly untyped
    # transformers 4.57 warns about a "Mistral regex" on every NLLB tokenizer load; it is
    # a false positive for this model and would only alarm whoever reads the logs on the day.
    tf.logging.set_verbosity_error()
    return tf.AutoTokenizer


class NllbProvider:
    def __init__(self, settings: NllbSettings, model_cache: Path) -> None:
        self._settings = settings
        model = Path(settings.model)
        self._path = model if model.is_absolute() else model_cache / model
        self._translator: Any = None
        self._tokenizers: dict[str, Any] = {}
        self._tokenizer_lock = threading.Lock()
        self.name = f"nllb:{self._path.name}"

    async def load(self) -> None:
        try:
            import ctranslate2
            import transformers  # noqa: F401 - fail fast if missing
        except ImportError as err:
            raise ProviderUnavailable(
                "ctranslate2/transformers not installed (install the `gpu` extra)"
            ) from err
        if not (self._path / "model.bin").exists():
            raise ProviderUnavailable(
                f"{self.name}: no CTranslate2 model at {self._path} (run scripts/fetch-models.sh)"
            )
        device = _resolve_device(self._settings.device)
        compute = _compute_type(device, self._settings.compute_type)

        def _load() -> Any:
            translator = ctranslate2.Translator(str(self._path), device=device, compute_type=compute)
            # Fail now rather than on the first sentence if the tokenizer files are missing.
            _auto_tokenizer().from_pretrained(str(self._path), src_lang=NLLB_CODES["en"])
            return translator

        try:
            self._translator = await asyncio.to_thread(_load)
        except Exception as err:
            raise ProviderUnavailable(f"{self.name}: failed to load ({err})") from err
        log.info("mt loaded: %s on %s (%s)", self.name, device, compute)

    def _tokenizer(self, source: str) -> Any:
        # The tokenizer's src_lang is mutable state; keep one per source language.
        with self._tokenizer_lock:
            tok = self._tokenizers.get(source)
            if tok is None:
                tok = _auto_tokenizer().from_pretrained(str(self._path), src_lang=NLLB_CODES[source])
                self._tokenizers[source] = tok
            return tok

    def _run(self, text: str, source: SourceLanguage, target: TargetLanguage) -> str:
        if self._translator is None:
            raise ProviderUnavailable(f"{self.name}: not loaded")
        tok = self._tokenizer(source)
        tokens = tok.convert_ids_to_tokens(tok.encode(text))
        target_code = NLLB_CODES[target]
        results = self._translator.translate_batch(
            [tokens],
            target_prefix=[[target_code]],
            beam_size=self._settings.beam_size,
            max_decoding_length=256,
        )
        hypothesis = results[0].hypotheses[0]
        if hypothesis and hypothesis[0] == target_code:
            hypothesis = hypothesis[1:]
        out: str = tok.decode(tok.convert_tokens_to_ids(hypothesis), skip_special_tokens=True)
        return out.strip()

    async def translate(self, text: str, *, source: SourceLanguage, target: TargetLanguage) -> str:
        return await asyncio.to_thread(self._run, text, source, target)

    async def close(self) -> None:
        self._translator = None
