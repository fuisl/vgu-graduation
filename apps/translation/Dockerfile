# apps/translation container images. The build context is this directory: the
# service shares no code with the Node workspace, only the wire contract.
#
#   docker build --target gpu  -t grad-translation      apps/translation   # production (default)
#   docker build --target mock -t grad-translation:mock apps/translation   # no GPU, fake captions
#
# Both run the same service; only the installed providers and their defaults
# differ. Model weights are never baked in: they live on the `translation-models`
# PVC at MODEL_CACHE, filled once by scripts/fetch-models.sh.

ARG UV_VERSION=0.10.5
FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# --- mock: slim image, mock providers only (local dev, CI, a cluster without a GPU) ---
FROM python:3.12-slim AS mock
COPY --from=uv /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev
RUN useradd --system --uid 1001 --no-create-home grad
USER grad
ENV PATH=/app/.venv/bin:$PATH \
    PORT=8000 \
    ASR_PROVIDERS=mock \
    MT_PROVIDER=mock
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/healthz' % os.environ.get('PORT', '8000'), timeout=2)"
CMD ["grad-translation"]

# --- gpu: CUDA 12 + cuDNN 9 runtime, faster-whisper and NLLB on CTranslate2 ---
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 AS gpu
COPY --from=uv /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON_INSTALL_DIR=/opt/python \
    UV_PYTHON=3.12
WORKDIR /app
COPY pyproject.toml uv.lock README.md .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv python install 3.12 && uv sync --frozen --no-dev --extra gpu --no-install-project
COPY src ./src
COPY scripts ./scripts
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --extra gpu
RUN useradd --system --uid 1001 --no-create-home grad && mkdir -p /models && chown grad /models
USER grad
ENV PATH=/app/.venv/bin:$PATH \
    PORT=8000 \
    MODEL_CACHE=/models \
    HF_HOME=/models/hf \
    ASR_PROVIDERS=faster-whisper \
    MT_PROVIDER=nllb \
    WHISPER_MODEL=small
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=120s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/healthz' % os.environ.get('PORT', '8000'), timeout=2)"
CMD ["grad-translation"]
