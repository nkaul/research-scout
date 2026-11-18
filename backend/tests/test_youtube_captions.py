"""Authored caption transport doubles; no live transcript-quality claim."""

import asyncio
import threading
from types import SimpleNamespace

import httpx
import pytest
from requests import Response, Session

from research_scout.contracts import SourceRecord
from research_scout.providers import youtube_captions
from research_scout.providers.journal import atomic_json
from research_scout.providers.service import create_provider_app


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,status,attempts", [("available", "available", 3), ("blocked", "blocked", 1), ("missing", "unavailable", 1), ("origin", "error", 2), ("origin_port", "error", 2), ("origin_credentials", "error", 2), ("limit", "error", 3)])
async def test_public_caption_reads_are_bounded_and_sanitize_failures(monkeypatch, mode, status, attempts):
    counted, sent = [], []

    async def reserve():
        counted.append(1)

    def send(_self, request, **_kwargs):
        assert "X-Goog-Api-Key" not in request.headers
        sent.append(request.url)
        response = Response()
        response.status_code, response._content = 200, b"authored"
        return response

    monkeypatch.setattr(Session, "send", send)

    class Fetched:
        language, language_code, is_generated = "English", "en", True

        def __iter__(self):
            return iter([SimpleNamespace(text="An authored caption", start=12, duration=3)])

    class API:
        def __init__(self, http_client):
            self.client = http_client

        def list(self, _id):
            self.client.get("https://www.youtube.com/watch?v=abcdEF_12-3")
            if mode in {"blocked", "missing"}:
                raise type("RequestBlocked" if mode == "blocked" else "TranscriptsDisabled", (Exception,), {})("secret transport error must never appear")
            self.client.post("https://www.youtube.com/youtubei/v1/player")
            return self

        def find_transcript(self, _languages):
            return self

        def fetch(self):
            target = {
                "origin": "https://evil.example/captions",
                "origin_port": "https://www.youtube.com:8443/api/timedtext",
                "origin_credentials": "https://untrusted:credentials@www.youtube.com/api/timedtext",
            }.get(mode, "https://www.youtube.com/api/timedtext")
            self.client.get(target)
            if mode == "limit":
                self.client.get("https://www.youtube.com/api/timedtext")
            return Fetched()

    monkeypatch.setattr(youtube_captions, "YouTubeTranscriptApi", API)
    result = await youtube_captions.fetch_public_captions("abcdEF_12-3", reserve)
    assert result["status"] == status
    assert len(counted) == len(sent) == attempts
    assert "secret transport" not in str(result) and "evil.example" not in str(result)
    if status == "available":
        assert result["segments"][0]["start"] == 12 and result["is_generated"]
    else:
        assert result["segments"] == []


def test_caption_payload_has_finite_time_and_length_bounds():
    rows = [SimpleNamespace(text="x" * 2200, start=0, duration=1)]
    rows += [SimpleNamespace(text="invalid", start=float("nan"), duration=2)]
    rows += [SimpleNamespace(text="valid", start=i, duration=1) for i in range(700)]
    segments, truncated = youtube_captions.bounded_segments(rows)
    assert truncated and len(segments) == 600 and len(segments[0]["text"]) == 2000
    assert all(row["text"] != "invalid" for row in segments)


def test_malformed_caption_rows_do_not_hide_valid_rows_and_scanning_is_finite():
    rows = [
        SimpleNamespace(text="bad timing", start=None, duration=1),
        SimpleNamespace(text=None, start=0, duration=1),
        SimpleNamespace(text="valid caption", start=4, duration=2),
    ]
    segments, truncated = youtube_captions.bounded_segments(rows)
    assert segments == [{"text": "valid caption", "start": 4.0, "duration": 2.0}]
    assert truncated
    inspected = []

    def malformed_stream():
        for index in range(10000):
            inspected.append(index)
            yield SimpleNamespace(text="", start=0, duration=0)

    segments, truncated = youtube_captions.bounded_segments(malformed_stream())
    assert segments == [] and truncated and len(inspected) == 1201


@pytest.mark.asyncio
async def test_cancellation_finishes_admitted_request_without_dispatching_another(monkeypatch):
    started, release = threading.Event(), threading.Event()
    events = []

    async def reserve():
        events.append("admitted")

    def send(_self, _request, **_kwargs):
        events.append("sent")
        started.set()
        assert release.wait(timeout=2)
        events.append("finished")
        response = Response()
        response.status_code, response._content = 200, b"authored"
        return response

    class API:
        def __init__(self, http_client):
            self.client = http_client

        def list(self, _id):
            self.client.get("https://www.youtube.com/watch?v=abcdEF_12-3")
            self.client.post("https://www.youtube.com/youtubei/v1/player")
            pytest.fail("A cancelled worker reached the second request")

    monkeypatch.setattr(Session, "send", send)
    monkeypatch.setattr(youtube_captions, "YouTubeTranscriptApi", API)
    task = asyncio.create_task(youtube_captions.fetch_public_captions("abcdEF_12-3", reserve))
    try:
        assert await asyncio.to_thread(started.wait, 1)
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done()  # journal owner must not finish before the admitted call
    finally:
        release.set()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(task, 1)
    events.append("journal owner resumed")
    await asyncio.sleep(0)
    assert events == ["admitted", "sent", "finished", "journal owner resumed"]


@pytest.mark.asyncio
async def test_admission_timeout_cancels_the_callback_and_never_dispatches(monkeypatch):
    cancelled = asyncio.Event()

    async def reserve():
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    class API:
        def __init__(self, http_client):
            self.client = http_client

        def list(self, _id):
            self.client.get("https://www.youtube.com/watch?v=abcdEF_12-3")

    def unexpected_send(*_args, **_kwargs):
        pytest.fail("A request was dispatched without admission")

    monkeypatch.setattr(Session, "send", unexpected_send)
    monkeypatch.setattr(youtube_captions, "YouTubeTranscriptApi", API)
    monkeypatch.setattr(youtube_captions, "ADMISSION_TIMEOUT_SECONDS", 0.01)
    result = await youtube_captions.fetch_public_captions("abcdEF_12-3", reserve)
    await asyncio.wait_for(cancelled.wait(), 1)
    assert result["status"] == "error" and result["code"] == "CAPTION_ADMISSION_TIMEOUT"
    assert result["segments"] == []


@pytest.mark.asyncio
async def test_cancellation_during_admission_does_not_send_after_reservation(monkeypatch):
    started, release = asyncio.Event(), asyncio.Event()
    events = []

    async def reserve():
        started.set()
        await release.wait()
        events.append("conservative reservation completed")

    class API:
        def __init__(self, http_client):
            self.client = http_client

        def list(self, _id):
            self.client.get("https://www.youtube.com/watch?v=abcdEF_12-3")

    def unexpected_send(*_args, **_kwargs):
        pytest.fail("A cancelled request was sent after admission")

    monkeypatch.setattr(Session, "send", unexpected_send)
    monkeypatch.setattr(youtube_captions, "YouTubeTranscriptApi", API)
    task = asyncio.create_task(youtube_captions.fetch_public_captions("abcdEF_12-3", reserve))
    await asyncio.wait_for(started.wait(), 1)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(task, 1)
    events.append("journal owner resumed")
    assert events == ["conservative reservation completed", "journal owner resumed"]


@pytest.mark.asyncio
async def test_youtube_metadata_and_captions_are_separate_and_cache_outcomes(tmp_path, monkeypatch):
    monkeypatch.setenv("SCOUT_YOUTUBE_API_KEY", "authored-key")
    calls = []

    async def transport(request):
        calls.append(request.url.path)
        assert request.url.path == "/youtube/v3/videos"
        assert request.headers["x-goog-api-key"] == "authored-key"
        return httpx.Response(200, json={"items": [{"id": "abcdEF_12-3", "snippet": {
            "title": "Authored video", "description": "Authored description",
            "channelTitle": "Authored channel", "publishedAt": "2025-01-01T00:00:00Z",
            "thumbnails": {"high": {"url": "https://i.ytimg.com/vi/abcdEF_12-3/hqdefault.jpg"}}
        }}]})

    caption_calls = []

    async def captions(_id, reserve):
        caption_calls.append(_id)
        await reserve()
        return {"status": "blocked", "origin": "public_youtube_captions", "segments": [],
                "truncated": False, "message": "Authored blocked outcome"}

    monkeypatch.setattr(youtube_captions, "fetch_public_captions", captions)
    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as upstream:
        app = create_provider_app("youtube", "live", state_dir=tmp_path, http_client=upstream)
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://youtube") as client:
            body = {"operation_id": "caption-one", "run_id": "video-run", "record_id": "abcdEF_12-3", "remaining_attempts": 4}
            first = await client.post("/operations/details", json=body)
            assert first.status_code == 200
            result = first.json()
            record = SourceRecord.model_validate(result["record"])
            assert record.description == "Authored description"
            assert record.transcript is None and result["attempts"] == 1
            assert record.content_origin == "youtube_video_details"
            caption = await client.post("/operations/transcript", json={**body, "operation_id": "caption-only"})
            assert caption.json()["transcript"]["status"] == "blocked"
            assert caption.json()["attempts"] == 1
            cached_caption = await client.post("/operations/transcript", json={**body, "operation_id": "caption-retry"})
            assert cached_caption.json()["attempts"] == 0
            assert 0 < cached_caption.json()["retry_after_seconds"] <= 300
            assert record.thumbnail_url.startswith("https://i.ytimg.com/")
            second = await client.post("/operations/details", json={**body, "operation_id": "caption-two"})
            assert second.json()["attempts"] == 0 and len(calls) == 1
            assert "authored-key" not in first.text
            assert len(caption_calls) == 1
            key = "live:transcript:abcdEF_12-3"
            expired = app.state.journal.read("cache", key)
            expired["cache_observed_at"] = "2000-01-01T00:00:00+00:00"
            atomic_json(app.state.journal.path("cache", key), expired)
            retried = await client.post("/operations/transcript", json={**body, "operation_id": "caption-after-cooldown"})
            assert retried.json()["attempts"] == 1 and len(caption_calls) == 2
            assert len(calls) == 1  # caption retry never re-fetches video metadata
