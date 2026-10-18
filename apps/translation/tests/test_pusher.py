from __future__ import annotations

from typing import Any

from aiohttp import web

from grad_translation.pusher import SegmentPusher

from .helpers import SERVICE_TOKEN, FakeApi, free_port, serve, wait_for


def payload(seq: int, text: str = "Hi.") -> dict[str, Any]:
    return {
        "sessionId": "s-1",
        "sequence": seq,
        "startMs": 0,
        "endMs": 10,
        "sourceLanguage": "en",
        "sourceText": text,
        "translations": [],
    }


async def test_retries_through_api_errors_in_order() -> None:
    api = FakeApi(fail_next=3)
    async with serve(api.app()) as url:
        pusher = SegmentPusher(
            url + "/internal/translation/segments", SERVICE_TOKEN, backoff_base_s=0.01, backoff_max_s=0.02
        )
        pusher.start()
        for seq in range(3):
            pusher.submit(payload(seq))
        await wait_for(lambda: pusher.pending == 0)
        await pusher.close()
    assert [p["sequence"] for p in api.posts] == [0, 1, 2]
    assert pusher.attempts_failed == 3 and pusher.sent == 3


async def test_resubmitting_a_sequence_replaces_the_queued_post() -> None:
    pusher = SegmentPusher("http://127.0.0.1:1/x", None, max_pending=10)
    pusher.submit(payload(0, "first"))
    pusher.submit(payload(1))
    pusher.submit(payload(0, "second"))
    assert pusher.pending == 2
    assert next(iter(pusher._pending.values()))["sourceText"] == "second"


async def test_queue_is_bounded_while_the_api_is_absent() -> None:
    pusher = SegmentPusher(
        f"http://127.0.0.1:{free_port()}/x", None, max_pending=5, backoff_base_s=0.01, backoff_max_s=0.02
    )
    pusher.start()
    for seq in range(12):
        pusher.submit(payload(seq))
    await wait_for(lambda: pusher.attempts_failed >= 2)
    assert pusher.pending == 5
    assert pusher.dropped == 7
    assert [k[1] for k in pusher._pending] == [7, 8, 9, 10, 11], "the newest are kept"
    assert pusher.last_error is not None
    await pusher.close()


async def test_rejected_payloads_are_dropped_not_retried_forever() -> None:
    hits = 0

    async def reject(request: web.Request) -> web.Response:
        nonlocal hits
        hits += 1
        return web.json_response({"error": "Bad Request", "message": "nope"}, status=422)

    app = web.Application()
    app.router.add_post("/x", reject)
    async with serve(app) as url:
        pusher = SegmentPusher(url + "/x", SERVICE_TOKEN, backoff_base_s=0.01)
        pusher.start()
        pusher.submit(payload(0))
        await wait_for(lambda: pusher.pending == 0)
        await pusher.close()
    assert hits == 1 and pusher.dropped == 1


async def test_wrong_token_keeps_retrying_and_never_logs_it(caplog: Any) -> None:
    api = FakeApi()
    async with serve(api.app()) as url:
        pusher = SegmentPusher(
            url + "/internal/translation/segments", "wrong-secret", backoff_base_s=0.01, backoff_max_s=0.02
        )
        pusher.start()
        pusher.submit(payload(0))
        await wait_for(lambda: api.unauthorized >= 2)
        assert pusher.pending == 1
        await pusher.close()
    assert "wrong-secret" not in caplog.text
    assert "SERVICE_TOKEN" in caplog.text
