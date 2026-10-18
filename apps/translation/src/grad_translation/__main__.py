"""`python -m grad_translation` / `grad-translation`: run the service."""

from __future__ import annotations

import logging
import sys

from aiohttp import web

from .config import ConfigError, load_settings
from .server import create_app


def main() -> None:
    try:
        settings = load_settings()
    except ConfigError as err:
        print(f"grad-translation: configuration error: {err}", file=sys.stderr)
        raise SystemExit(2) from err
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("grad_translation")
    if "mock" in settings.asr_providers or settings.mt_provider == "mock":
        log.warning("mock providers in use: captions are fake (fine for local dev and tests only)")
    if not settings.service_token:
        log.warning("SERVICE_TOKEN is unset: ingest is unauthenticated and the API will refuse segment posts")
    log.info(
        "listening on %s:%d; asr=%s mt=%s targets=%s api=%s",
        settings.host,
        settings.port,
        ",".join(settings.asr_providers),
        settings.mt_provider,
        ",".join(settings.target_languages),
        settings.api_internal_url,
    )
    web.run_app(create_app(settings), host=settings.host, port=settings.port, print=None)


if __name__ == "__main__":
    main()
