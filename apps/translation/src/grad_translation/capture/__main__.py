"""`grad-capture`: the venue capture client for the AV laptop.

    grad-capture --url wss://api.grad26.fuisloy.dev/live/ingest --token-file ~/.grad-capture-token
    grad-capture --list-devices
    grad-capture --url ws://localhost:8000/ingest --file speech.wav     # local testing

The token comes from --token-file or CAPTURE_TOKEN, never from the command
line (shell history, process list), and is never printed. While running, type
`en`, `vi` or `auto` and Enter to tell the service who is speaking.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import os
import sys
import threading
from pathlib import Path
from typing import Literal, cast

from .client import EXIT_SUPERSEDED, CaptureConfig, CaptureStreamer, Superseded
from .sources import AudioSource, DeviceSource, FileSource


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="grad-capture", description="Stream venue audio to the GRAD '26 API.")
    p.add_argument("--url", help="WebSocket URL of the API's /live/ingest (env CAPTURE_URL)")
    p.add_argument(
        "--token-file", type=Path, help="file holding the capture service token (or CAPTURE_TOKEN)"
    )
    p.add_argument("--session", default=os.environ.get("CAPTURE_SESSION", "ceremony"), help="session label")
    p.add_argument("--language", choices=["auto", "en", "vi"], default="auto", help="spoken language")
    p.add_argument("--buffer-seconds", type=float, default=10.0, help="audio kept for resending (default 10)")
    src = p.add_argument_group("input")
    src.add_argument(
        "--device", help="input device index or name (see --list-devices); default input if unset"
    )
    src.add_argument("--channels", type=int, help="channels to open on the device (default: up to 2)")
    src.add_argument("--channel", type=int, help="use only this input channel (1-based) instead of a downmix")
    src.add_argument("--list-devices", action="store_true", help="list audio devices and exit")
    src.add_argument("--file", type=Path, help="stream a WAV or raw s16le file instead of a device")
    src.add_argument("--loop", action="store_true", help="with --file: repeat forever")
    src.add_argument("--speed", type=float, default=1.0, help="with --file: playback speed, 0 = unpaced")
    p.add_argument("--status-every", type=float, default=5.0, help="seconds between status lines")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


def _token(args: argparse.Namespace) -> str | None:
    if args.token_file:
        return args.token_file.expanduser().read_text(encoding="utf-8").strip() or None
    return os.environ.get("CAPTURE_TOKEN") or None


async def _keyboard(streamer: CaptureStreamer) -> None:
    """Operator commands on stdin: en / vi / auto."""
    loop = asyncio.get_running_loop()
    lines: asyncio.Queue[str] = asyncio.Queue()

    def reader() -> None:  # a daemon thread, so a pending readline never blocks exit
        for line in sys.stdin:
            loop.call_soon_threadsafe(lines.put_nowait, line)

    threading.Thread(target=reader, name="stdin", daemon=True).start()
    while True:
        cmd = (await lines.get()).strip().lower()
        if cmd in ("en", "vi", "auto"):
            await streamer.set_language(cast(Literal["auto", "en", "vi"], cmd))
        elif cmd:
            print("[capture] commands: en | vi | auto", file=sys.stderr)


async def _run(args: argparse.Namespace, url: str) -> int:
    source: AudioSource
    if args.file:
        source = FileSource(args.file, speed=args.speed, loop=args.loop)
    else:
        device: str | int | None = int(args.device) if args.device and args.device.isdigit() else args.device
        source = DeviceSource(device, channels=args.channels, channel=args.channel)
    config = CaptureConfig(
        url=url,
        token=_token(args),
        session=args.session,
        language=args.language,
        buffer_seconds=args.buffer_seconds,
        status_interval_s=args.status_every,
    )
    if not config.token:
        print(
            "[capture] warning: no token (CAPTURE_TOKEN or --token-file); the API will refuse it",
            file=sys.stderr,
        )
    streamer = CaptureStreamer(config)
    keyboard = asyncio.create_task(_keyboard(streamer)) if sys.stdin.isatty() else None
    print(
        f"[capture] streaming {'file ' + str(args.file) if args.file else 'live input'} to {url}",
        file=sys.stderr,
    )
    try:
        await streamer.run(source)
    except Superseded:
        print("[capture] another capture client took over the input; exiting", file=sys.stderr)
        return EXIT_SUPERSEDED
    except Exception as err:  # the audio input failed (device unplugged, unreadable file)
        print(f"[capture] stopped: {type(err).__name__}: {err}; restart grad-capture", file=sys.stderr)
        return 1
    finally:
        if keyboard is not None:
            keyboard.cancel()
    return 0


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="[capture] %(message)s")
    if args.list_devices:
        print(DeviceSource.list_devices())
        return
    url = args.url or os.environ.get("CAPTURE_URL")
    if not url:
        print("grad-capture: --url (or CAPTURE_URL) is required", file=sys.stderr)
        raise SystemExit(2)
    code = 130
    with contextlib.suppress(KeyboardInterrupt):
        code = asyncio.run(_run(args, url))
    raise SystemExit(code)


if __name__ == "__main__":
    main()
