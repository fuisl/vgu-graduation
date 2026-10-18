"""JSON control messages on the ingest WebSocket.

The authoritative protocol lives in packages/contract/src/translation.ts
(`ingestControlMessageSchema`, `ingestServiceMessageSchema`) and use-cases.md
§6.2; README "Ingest protocol" summarises it. Audio travels as binary frames of
raw PCM (16 kHz mono s16le) and the API relays every frame verbatim.

Into the service (from the capture client, through the API):
  start  {sessionId?, sourceLanguage?, sampleRate?, channels?, encoding?}
         Sent first; the API replays the last one after every reconnect. A new
         start mid-stream updates the language (omitted = detect en/vi).
  stop   the speaker is done: close the open sentence now.
  gap    {samples} audio the client had to drop (its buffer overflowed): the
         timeline skips ahead and the open sentence closes.
Out of the service (relayed to the capture client):
  ready  {sessionId, resumed} once the connection is attached to a session.
  ack    {receivedSamples} audio samples received on this connection so far,
         about every 250 ms, so the client can resend what a drop swallowed.
  error  {code, message} before the service closes the socket.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .audio import CHANNELS, ENCODING, SAMPLE_RATE
from .config import SOURCE_LANGUAGES, SourceLanguage

# WebSocket close codes (4000-4999 are application-defined).
CLOSE_REPLACED = 4001  # same meaning as the API's: a newer ingest connection took over
CLOSE_BAD_MESSAGE = 4400
CLOSE_UNSUPPORTED_FORMAT = 4415
CLOSE_SHUTTING_DOWN = 1001

MAX_SESSION_ID = 100


class ProtocolError(ValueError):
    def __init__(self, code: str, message: str, close_code: int = CLOSE_BAD_MESSAGE) -> None:
        super().__init__(message)
        self.code = code
        self.close_code = close_code


@dataclass(frozen=True)
class Start:
    session: str | None = None
    language: SourceLanguage | None = None


@dataclass(frozen=True)
class Stop:
    pass


@dataclass(frozen=True)
class Gap:
    samples: int


Control = Start | Stop | Gap


def parse_json(raw: str) -> dict[str, Any] | None:
    """A JSON object with a string `type`, or None for anything else (ignored, like the API does)."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("type"), str):
        return None
    return data


def parse_start(data: dict[str, Any]) -> Start:
    rate = data.get("sampleRate", SAMPLE_RATE)
    channels = data.get("channels", CHANNELS)
    encoding = data.get("encoding", ENCODING)
    if rate != SAMPLE_RATE or channels != CHANNELS or encoding != ENCODING:
        raise ProtocolError(
            "unsupported_format",
            f"audio must be {SAMPLE_RATE} Hz, {CHANNELS} channel, {ENCODING}",
            CLOSE_UNSUPPORTED_FORMAT,
        )
    session = data.get("sessionId")
    if session is not None and (not isinstance(session, str) or not 1 <= len(session) <= MAX_SESSION_ID):
        raise ProtocolError("bad_message", "sessionId must be a string of 1 to 100 characters")
    language = data.get("sourceLanguage")
    if language is not None and language not in SOURCE_LANGUAGES:
        raise ProtocolError("bad_message", "sourceLanguage must be en or vi (omit it to detect)")
    lang: SourceLanguage | None = None if language is None else ("vi" if language == "vi" else "en")
    return Start(session=session, language=lang)


def parse_control(data: dict[str, Any]) -> Control | None:
    """The control message, or None for a type this service doesn't know (forward compatible)."""
    kind = data["type"]
    if kind == "start":
        return parse_start(data)
    if kind == "stop":
        return Stop()
    if kind == "gap":
        samples = data.get("samples")
        if not isinstance(samples, int) or isinstance(samples, bool) or samples < 0:
            raise ProtocolError("bad_message", "gap.samples must be a non-negative integer")
        return Gap(samples)
    return None


def encode(message: dict[str, Any]) -> str:
    return json.dumps(message, separators=(",", ":"), ensure_ascii=False)


def error(code: str, message: str) -> str:
    return encode({"type": "error", "code": code, "message": message})
