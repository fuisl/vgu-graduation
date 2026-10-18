#!/usr/bin/env bash
# Downloads and converts the local GPU models into MODEL_CACHE, once.
#
#   uv run --extra gpu --with 'torch>=2.4' scripts/fetch-models.sh          # on a laptop
#   MODEL_CACHE=/models scripts/fetch-models.sh                            # inside the GPU image
#
# In the cluster MODEL_CACHE is the `translation-models` PVC, so a pod restart
# during the ceremony never downloads anything. Run it once before the event
# (and after changing WHISPER_MODEL or NLLB_MODEL); it skips what is already there.
#
# - Whisper: faster-whisper fetches ready-made CTranslate2 weights itself.
# - NLLB-200: converted from the official facebook/ checkpoint with CTranslate2's
#   converter, which needs PyTorch only for this one step (not at runtime),
#   hence `--with torch` rather than a locked dependency. The tokenizer files are
#   copied next to model.bin, which is where the provider looks for them.
set -euo pipefail

cache="${MODEL_CACHE:-/models}"
whisper="${WHISPER_MODEL:-small}"
nllb_source="${NLLB_SOURCE:-facebook/nllb-200-distilled-600M}"
nllb_dir="$cache/${NLLB_MODEL:-nllb-200-distilled-600M-ct2-int8}"
nllb_quantization="${NLLB_QUANTIZATION:-int8}"

mkdir -p "$cache/whisper"

echo "whisper: $whisper -> $cache/whisper"
python - "$whisper" "$cache/whisper" <<'PY'
import sys
from faster_whisper import WhisperModel

WhisperModel(sys.argv[1], device="cpu", compute_type="int8", download_root=sys.argv[2])
print("whisper: ok")
PY

if [ -f "$nllb_dir/model.bin" ]; then
  echo "nllb: already converted at $nllb_dir"
else
  echo "nllb: converting $nllb_source ($nllb_quantization) -> $nllb_dir"
  ct2-transformers-converter \
    --model "$nllb_source" \
    --quantization "$nllb_quantization" \
    --output_dir "$nllb_dir" \
    --copy_files tokenizer.json tokenizer_config.json special_tokens_map.json sentencepiece.bpe.model
fi
echo "models ready in $cache"
