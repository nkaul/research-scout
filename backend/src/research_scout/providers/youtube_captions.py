"""Explicit, bounded public-caption reads; no account cookies, proxies or model calls."""

import asyncio
import math
import re
import threading
from concurrent.futures import TimeoutError as FutureTimeoutError
from datetime import UTC, datetime
from urllib.parse import urlsplit

from requests import Session
from youtube_transcript_api import YouTubeTranscriptApi

from .journal import ProviderError

ADMISSION_TIMEOUT_SECONDS = 5


def bounded_segments(rows):
    result, size, truncated = [], 0, False
    for index, row in enumerate(rows):
        # Malformed rows must not turn an otherwise usable transcript into an
        # error, or allow an unbounded scan before reaching the retained limit.
        if index >= 1200:
            truncated = True
            break
        try:
            text = row.text.strip() if isinstance(row.text, str) else ""
            start, duration = float(row.start), float(row.duration)
        except (AttributeError, TypeError, ValueError, OverflowError):
            truncated = True
            continue
        if len(text) > 2000:
            text, truncated = text[:2000], True
        if not text or not all(math.isfinite(v) and v >= 0 for v in (start, duration)):
            truncated = True
            continue
        if len(result) >= 600 or size + len(text) > 60000:
            truncated = True
            break
        result.append({"text": text, "start": start, "duration": duration})
        size += len(text)
    return result, truncated


async def fetch_public_captions(video_id, before_call=None):
    if not re.fullmatch(r"[\w-]{11}", video_id, re.ASCII):
        raise ProviderError("INVALID_VIDEO_ID", "A valid saved YouTube video is required.", 422)
    loop = asyncio.get_running_loop()
    stopped = threading.Event()

    class BoundedSession(Session):
        def __init__(self):
            super().__init__()
            self.trust_env = False
            self.attempts = 0

        def send(self, request, **kwargs):
            url = urlsplit(request.url)
            if (
                url.scheme != "https"
                or url.hostname not in {"www.youtube.com", "youtube.com"}
                or url.username is not None
                or url.password is not None
                or url.port not in {None, 443}
            ):
                raise ProviderError("CAPTION_ORIGIN", "Caption request origin was rejected.")
            if stopped.is_set():
                raise ProviderError("CAPTION_CANCELLED", "The caption request was cancelled.")
            if self.attempts >= 3:
                raise ProviderError("CAPTION_LIMIT", "The public-caption request limit was reached.")
            if before_call:
                admission = asyncio.run_coroutine_threadsafe(before_call(), loop)
                try:
                    admission.result(timeout=ADMISSION_TIMEOUT_SECONDS)
                except FutureTimeoutError:
                    admission.cancel()
                    raise ProviderError(
                        "CAPTION_ADMISSION_TIMEOUT",
                        "Caption request admission timed out; no request was sent.",
                    ) from None
            # Cancellation can arrive while durable admission is waiting. A
            # conservative reservation may remain, but no new HTTP call follows.
            if stopped.is_set():
                raise ProviderError("CAPTION_CANCELLED", "The caption request was cancelled.")
            self.attempts += 1
            kwargs["timeout"] = (2, 4)
            return super().send(request, **kwargs)

    def read():
        base = {"origin": "public_youtube_captions", "observed_at": datetime.now(UTC).isoformat()}
        try:
            with BoundedSession() as client:
                api = YouTubeTranscriptApi(http_client=client)
                tracks = api.list(video_id)
                try:
                    track = tracks.find_transcript(["en", "en-US", "en-GB"])
                except Exception as exc:
                    if type(exc).__name__ != "NoTranscriptFound":
                        raise
                    track = next(iter(tracks))
                fetched = track.fetch()
                segments, truncated = bounded_segments(fetched)
                return {**base, "status": "available" if segments else "unavailable",
                        "language": fetched.language, "language_code": fetched.language_code,
                        "is_generated": fetched.is_generated, "segments": segments,
                        "truncated": truncated, "message": "Public captions; not verified against the video."}
        except Exception as exc:  # never expose transport URLs, tokens or upstream error text
            name = type(exc).__name__
            blocked = name in {"RequestBlocked", "IpBlocked", "AgeRestricted", "PoTokenRequired"}
            missing = name in {"TranscriptsDisabled", "NoTranscriptFound", "VideoUnavailable", "VideoUnplayable", "StopIteration"}
            exhausted = isinstance(exc, ProviderError) and exc.code in {"ATTEMPT_LIMIT", "CAPTION_LIMIT", "UPSTREAM_QUOTA_LIMIT"}
            return {**base, "status": "blocked" if blocked else "unavailable" if missing else "error",
                    "code": exc.code if isinstance(exc, ProviderError) else name,
                    "segments": [], "truncated": False,
                    "message": "YouTube blocked this public-caption request. Open the video on YouTube to check its transcript." if blocked else "The caption request reached its request allowance. Saved video metadata remains available." if exhausted else "A public transcript could not be retrieved. Open the video on YouTube to check caption availability."}

    worker = asyncio.create_task(asyncio.to_thread(read))
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        stopped.set()
        # Cancelling to_thread does not stop its thread. Wait for the admitted
        # in-flight request to finish before the caller closes its journal; the
        # worker's fence prevents subsequent requests or admission callbacks.
        while not worker.done():
            try:
                await asyncio.shield(worker)
            except asyncio.CancelledError:
                stopped.set()
        raise
