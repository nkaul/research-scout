#!/usr/bin/env python3
"""Connect only OpenAlex using MCP OAuth discovery and a localhost PKCE callback."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import webbrowser
from urllib.parse import parse_qs, urlsplit

from dotenv import load_dotenv

from research_scout.providers.oauth import credential_path, openalex_session


async def connect(port: int, open_browser: bool) -> None:
    loop = asyncio.get_running_loop()
    callback = loop.create_future()

    async def receive(reader, writer):
        try:
            raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
            method, target, _ = raw.split(b"\r\n", 1)[0].decode("ascii").split(" ")
            parsed = urlsplit(target)
            values = parse_qs(parsed.query)
            good = method == "GET" and parsed.path == "/callback" and values.get("code")
            if good and not callback.done():
                callback.set_result((values["code"][0], (values.get("state") or [None])[0]))
            body = (
                b"Research Scout received the callback. Return to the terminal."
                if good
                else b"Invalid OAuth callback."
            )
            writer.write(
                b"HTTP/1.1 "
                + (b"200 OK" if good else b"400 Bad Request")
                + b"\r\nContent-Type: text/plain\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
                + body
            )
            await writer.drain()
        except (TimeoutError, ValueError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            pass
        finally:
            writer.close()
            await writer.wait_closed()

    async def redirect(url):
        print("Open this OpenAlex sign-in URL in your browser:", flush=True)
        print(url, flush=True)
        if open_browser:
            webbrowser.open(url)

    async def receive_callback():
        return await asyncio.wait_for(callback, 180)

    async with await asyncio.start_server(receive, "127.0.0.1", port, limit=8192):
        async with openalex_session(
            redirect_handler=redirect,
            callback_handler=receive_callback,
            redirect_uri=f"http://127.0.0.1:{port}/callback",
        ) as session:
            tools = await session.list_tools()
            names = {tool.name for tool in tools.tools}
            if not {"search_works", "get_work"} <= names:
                raise RuntimeError("Required read-only tools are not advertised.")
    print(
        json.dumps(
            {
                "connected": True,
                "provider": "openalex",
                "credentials_file": str(credential_path()),
                "required_tools_present": True,
            }
        )
    )


def main():
    from pathlib import Path

    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8489)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose an unprivileged localhost callback port.")
    logging.getLogger("mcp").setLevel(logging.CRITICAL)
    try:
        asyncio.run(connect(args.port, not args.no_browser))
    except Exception:
        print(
            json.dumps(
                {
                    "connected": False,
                    "provider": "openalex",
                    "error": "OAuth connection did not complete. Check sign-in/callback availability and retry explicitly.",
                }
            )
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
