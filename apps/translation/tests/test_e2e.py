"""End to end with a fake apps/api: capture client -> API ingest proxy -> translation
service (mock ASR, segmenter, glossary, mock MT) -> POST /internal/translation/segments.
"""

from __future__ import annotations

import asyncio
import dataclasses
from pathlib import Path
from typing import Any

import aiohttp
import pytest

from grad_translation.capture.client import CaptureConfig, CaptureStreamer, Superseded
from grad_translation.capture.sources import FileSource
from grad_translation.config import Settings
from grad_translation.server import SERVICE_KEY, create_app

from .helpers import (
    CAPTURE_TOKEN,
    SERVICE_TOKEN,
    FakeApi,
    free_port,
    serve,
    speech_script,
    wait_for,
    write_wav,
)

EXPECTED = [
    (
        "en",
        "Good morning and welcome to the graduation ceremony of the Vietnamese-German University.",
    ),
    ("en", "Please take your seats."),
    ("en", "We are proud of every graduate of the class of 2026!"),
    ("vi", "Xin chúc mừng các tân cử nhân."),
]


def settings_for(api_url: str, **overrides: Any) -> Settings:
    base = Settings(
        api_internal_url=api_url,
        service_token=SERVICE_TOKEN,
        asr_providers=("mock",),
        mt_provider="mock",
        push_backoff_max_s=0.2,
        # Long enough that a reconnect in the tests never splits a sentence.
        disconnect_flush_s=5.0,
    )
    return dataclasses.replace(base, **overrides)


def ws_url(http_url: str, path: str) -> str:
    return http_url.replace("http://", "ws://") + path


def complete(api: FakeApi) -> bool:
    return len(api.stored) == len(EXPECTED) and all(len(s["translations"]) == 3 for s in api.stored.values())


def assert_ceremony_segments(api: FakeApi) -> None:
    segments = [api.stored[k] for k in sorted(api.stored, key=lambda k: k[1])]
    assert [s["sequence"] for s in segments] == list(range(len(EXPECTED))), "gapless from 0"
    assert len({s["sessionId"] for s in segments}) == 1
    assert segments[0]["sessionId"].startswith("ceremony-")
    for segment, (lang, text) in zip(segments, EXPECTED, strict=True):
        assert segment["sourceLanguage"] == lang
        assert segment["sourceText"] == text
        assert segment["endMs"] > segment["startMs"]
        by_lang = {t["language"]: t for t in segment["translations"]}
        assert set(by_lang) == {"de", "en", "vi"}
        assert all(t["status"] == "final" for t in by_lang.values())
        # The spoken language's caption is the transcript itself, credited to the ASR provider.
        assert by_lang[lang] == {"language": lang, "status": "final", "text": text, "provider": "mock"}
        for target, t in by_lang.items():
            if target != lang:
                assert t["text"].startswith(f"[{target}] ")
                assert t["provider"] == "mock"
    starts = [s["startMs"] for s in segments]
    assert starts == sorted(starts), "times run forward along the session timeline"
    # The glossary puts the target-language name in before translation.
    first = {t["language"]: t["text"] for t in segments[0]["translations"]}
    assert "Vietnamesisch-Deutsche Universität" in first["de"]
    assert "Trường Đại học Việt Đức" in first["vi"]


def capture(url: str, *, token: str = CAPTURE_TOKEN, lines: list[str] | None = None) -> CaptureStreamer:
    return CaptureStreamer(
        CaptureConfig(
            url=url,
            token=token,
            buffer_seconds=30,
            status_interval_s=60,
            backoff_max_s=0.2,
            catch_up_speed=50,
            ack_timeout_s=2,
        ),
        out=(lines if lines is not None else []).append,
    )


async def stream(streamer: CaptureStreamer, wav: Path, speed: float = 20.0) -> None:
    await asyncio.wait_for(streamer.run(FileSource(wav, speed=speed)), 30)


async def test_audio_to_posted_segments_through_the_api_proxy(tmp_path: Path) -> None:
    wav = write_wav(tmp_path / "ceremony.wav", speech_script(4))
    api = FakeApi()
    async with serve(api.app()) as api_url:
        app = create_app(settings_for(api_url))
        async with serve(app) as service_url:
            api.translation_ingest_url = ws_url(service_url, "/ingest")
            streamer = capture(ws_url(api_url, "/live/ingest"))
            await stream(streamer, wav)
            await wait_for(lambda: complete(api))
    assert streamer.dropped_samples == 0
    assert streamer.delivered == streamer.captured, "every sample acknowledged"
    assert api.capture_connections == 1 and api.dropped_frames == 0
    assert streamer.session_id is not None and streamer.session_id.startswith("ceremony-")
    assert_ceremony_segments(api)


async def test_capture_survives_a_network_drop(tmp_path: Path) -> None:
    wav = write_wav(tmp_path / "ceremony.wav", speech_script(4))
    api = FakeApi(drop_capture_after_bytes=60_000)  # mid-way through the second utterance
    async with serve(api.app()) as api_url:
        app = create_app(settings_for(api_url))
        async with serve(app) as service_url:
            api.translation_ingest_url = ws_url(service_url, "/ingest")
            streamer = capture(ws_url(api_url, "/live/ingest"))
            await stream(streamer, wav)
            await wait_for(lambda: complete(api))
    assert api.capture_connections == 2
    assert streamer.reconnects == 1
    assert streamer.dropped_samples == 0
    assert streamer.delivered == streamer.captured
    # Same sentences as without the drop: the unacknowledged tail was resent.
    assert_ceremony_segments(api)


async def test_capture_buffers_while_the_translation_service_reconnects(tmp_path: Path) -> None:
    wav = write_wav(tmp_path / "ceremony.wav", speech_script(4))
    api = FakeApi(drop_upstream_after_bytes=100_000)
    async with serve(api.app()) as api_url:
        app = create_app(settings_for(api_url))
        async with serve(app) as service_url:
            api.translation_ingest_url = ws_url(service_url, "/ingest")
            lines: list[str] = []
            streamer = capture(ws_url(api_url, "/live/ingest"), lines=lines)
            await stream(streamer, wav, speed=5.0)
            await wait_for(lambda: complete(api))
    assert api.capture_connections == 1, "the capture socket itself stayed up"
    assert api.upstream_connections == 2
    assert any("translation service unavailable" in line for line in lines)
    assert streamer.delivered == streamer.captured
    assert_ceremony_segments(api)


async def test_service_buffers_segments_while_the_api_is_absent() -> None:
    port = free_port()
    app = create_app(settings_for(f"http://127.0.0.1:{port}"))
    audio = speech_script(4)
    async with serve(app) as service_url:
        # Feed the service directly (as the API proxy would) while nothing listens on the API port.
        async with (
            aiohttp.ClientSession() as http,
            http.ws_connect(
                ws_url(service_url, "/ingest"), headers={"Authorization": f"Bearer {SERVICE_TOKEN}"}
            ) as ws,
        ):
            await ws.send_json({"type": "start", "sessionId": "ceremony"})
            ready = await ws.receive_json()
            assert ready == {"type": "ready", "sessionId": ready["sessionId"], "resumed": False}
            for off in range(0, len(audio), 3_200):
                await ws.send_bytes(audio[off : off + 3_200])
            await ws.send_json({"type": "stop"})
            while (msg := await ws.receive_json())["receivedSamples"] < len(audio) // 2:
                assert msg["type"] == "ack"
        service = app[SERVICE_KEY]
        await wait_for(lambda: service.pusher.pending == 4 and service.pusher.attempts_failed > 0)
        async with aiohttp.ClientSession() as http, http.get(service_url + "/healthz") as resp:
            assert resp.status == 200, "the service keeps running without the API"

        api = FakeApi(fail_next=1)  # the API comes up with its storage still unavailable once
        async with serve(api.app(), port=port):
            await wait_for(lambda: service.pusher.pending == 0, within=10)
    assert_ceremony_segments(api)


async def test_a_newer_capture_client_takes_over(tmp_path: Path) -> None:
    long_wav = write_wav(tmp_path / "long.wav", speech_script(4))
    api = FakeApi()
    async with serve(api.app()) as api_url:
        app = create_app(settings_for(api_url))
        async with serve(app) as service_url:
            api.translation_ingest_url = ws_url(service_url, "/ingest")
            first = capture(ws_url(api_url, "/live/ingest"))
            first_run = asyncio.create_task(first.run(FileSource(long_wav, speed=1.0)))
            await wait_for(lambda: first.state == "live")
            second = capture(ws_url(api_url, "/live/ingest"))
            second_run = asyncio.create_task(second.run(FileSource(long_wav, speed=1.0)))
            with pytest.raises(Superseded):
                await asyncio.wait_for(first_run, 5)
            await wait_for(lambda: second.state == "live")
            second_run.cancel()
            with pytest.raises(asyncio.CancelledError):
                await second_run
    assert api.capture_connections == 2


async def test_capture_straight_to_the_service_for_local_dev(tmp_path: Path) -> None:
    wav = write_wav(tmp_path / "ceremony.wav", speech_script(4))
    api = FakeApi()
    async with serve(api.app()) as api_url:
        app = create_app(settings_for(api_url))
        async with serve(app) as service_url:
            # No API in between: no `status` messages, the service's `ready` opens the stream.
            streamer = capture(ws_url(service_url, "/ingest"), token=SERVICE_TOKEN)
            await stream(streamer, wav)
            await wait_for(lambda: complete(api))
    assert_ceremony_segments(api)


async def test_ingest_requires_the_service_token() -> None:
    app = create_app(settings_for("http://127.0.0.1:1"))
    async with serve(app) as service_url, aiohttp.ClientSession() as http:
        with pytest.raises(aiohttp.WSServerHandshakeError) as err:
            async with http.ws_connect(
                ws_url(service_url, "/ingest"), headers={"Authorization": "Bearer nope"}
            ):
                pass
        assert err.value.status == 401
        async with http.get(service_url + "/readyz") as resp:
            body = await resp.json()
            assert resp.status == 200 and body["status"] == "ready"
            assert SERVICE_TOKEN not in str(body)


async def test_unsupported_audio_format_is_refused() -> None:
    app = create_app(settings_for("http://127.0.0.1:1"))
    async with (
        serve(app) as service_url,
        aiohttp.ClientSession() as http,
        http.ws_connect(
            ws_url(service_url, "/ingest"), headers={"Authorization": f"Bearer {SERVICE_TOKEN}"}
        ) as ws,
    ):
        await ws.send_json({"type": "start", "sampleRate": 48_000})
        msg = await ws.receive_json()
        assert msg["type"] == "error" and msg["code"] == "unsupported_format"
        await ws.receive()
        assert ws.close_code == 4415


async def test_api_rejects_a_wrong_capture_token(tmp_path: Path) -> None:
    wav = write_wav(tmp_path / "short.wav", speech_script(1))
    api = FakeApi()
    async with serve(api.app()) as api_url:
        lines: list[str] = []
        streamer = capture(ws_url(api_url, "/live/ingest"), token="wrong-capture-secret", lines=lines)
        task = asyncio.create_task(streamer.run(FileSource(wav, speed=0)))
        await wait_for(lambda: any("refused the capture token" in line for line in lines))
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert not any("wrong-capture-secret" in line for line in lines), "the token is never printed"
    assert api.posts == []
