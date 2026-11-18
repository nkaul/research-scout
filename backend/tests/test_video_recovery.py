"""Explicit video metadata/caption operations, using authored in-process transports."""

import asyncio
from contextlib import asynccontextmanager

import httpx
import pytest

from research_scout.contracts import ResearchRequest, SelectionRequest, SourceRecord
from research_scout.core import ApplicationError, Core, Settings
from research_scout.providers.normalization import source

VIDEO_ID = "abcdEF_12-3"


def video_record(**updates):
    return SourceRecord.model_validate(source(
        "youtube", VIDEO_ID, "fixture", title="Authored video", authors=["Authored channel"],
        resource_type="video", description="Short search description.",
        url=f"https://www.youtube.com/watch?v={VIDEO_ID}",
        content_origin="youtube_search_snippet", **updates,
    )).model_dump()


@asynccontextmanager
async def video_core(tmp_path, handler):
    calls = []

    async def transport(request):
        calls.append(request)
        return handler(request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        core = Core(Settings(state_dir=tmp_path, mode="fixture", provider_urls={"youtube": "http://127.0.0.1:8119"}), client=client)
        try:
            run = await core.create(ResearchRequest(question="Authored video recovery", provider="youtube", idempotency_key="recovery"), launch=False)
            await core._observe(run["id"], video_record())
            yield core, run["id"], calls
        finally:
            await core.close()


def reply(**payload):
    return httpx.Response(200, json={"provider": "youtube", "mode": "fixture", "attempts": 1, **payload})


@pytest.mark.asyncio
@pytest.mark.parametrize("captions_first", [False, True])
async def test_separate_actions_preserve_metadata_captions_and_exact_saved_choice(tmp_path, captions_first):
    full = {**video_record(), "description": "Full authored description.", "content_origin": "youtube_video_details", "version": "metadata-v2"}
    caption = {"status": "available", "origin": "authored_fixture_captions", "segments": [{"text": "Authored caption.", "start": 2, "duration": 1}]}

    def transport(request):
        if request.url.path == "/operations/details":
            return reply(record=full)
        assert request.url.path == "/operations/transcript"
        return reply(transcript=caption)

    async with video_core(tmp_path, transport) as (core, run_id, calls):
        ref = f"youtube:{VIDEO_ID}"
        saved = await core.get(run_id)
        await core.select(run_id, ref, SelectionRequest(state="included", reason="Keep exact version", expected_revision=saved["revision"]))
        chosen = (await core.get(run_id))["selections"][ref]["source_snapshot"]
        first, second = (core.transcript, core.details) if captions_first else (core.details, core.transcript)
        await asyncio.gather(first(run_id, ref), second(run_id, ref))
        result = await core.get(run_id)
        record = result["entities"][0]
        assert record["description"] == full["description"]
        assert record["transcript"]["segments"][0]["text"] == "Authored caption."
        assert record["details_loaded"]
        assert result["selections"][ref]["source_snapshot"] == chosen
        assert len(calls) == 2
        await core.transcript(run_id, ref)
        assert len(calls) == 2  # an available saved transcript needs no retry
        assert result["usage"]["research_attempts"] == 2


@pytest.mark.asyncio
async def test_caption_only_observation_survives_a_late_discovery_record(tmp_path):
    caption = {"status": "available", "origin": "authored_fixture_captions", "segments": [{"text": "Keep these saved captions.", "start": 0, "duration": 1}]}
    async with video_core(tmp_path, lambda _request: reply(transcript=caption)) as (core, run_id, _calls):
        ref = f"youtube:{VIDEO_ID}"
        saved = await core.transcript(run_id, ref)
        assert not saved["entities"][0]["details_loaded"]
        await core._observe(run_id, video_record())
        after = await core.get(run_id)
        assert after["entities"][0]["transcript"]["segments"][0]["text"] == "Keep these saved captions."
        assert not after["entities"][0].get("details_loaded")


@pytest.mark.asyncio
async def test_legacy_details_loaded_snippet_can_recover_and_retry_failed_captions(tmp_path):
    statuses = iter(["error", "available"])

    def transport(request):
        if request.url.path == "/operations/details":
            return reply(record={**video_record(), "description": "Recovered full description.", "content_origin": "youtube_video_details", "version": "complete"})
        status = next(statuses)
        return reply(transcript={"status": status, "origin": "authored_fixture_captions", "segments": []})

    async with video_core(tmp_path, transport) as (core, run_id, calls):
        ref = f"youtube:{VIDEO_ID}"
        await core.store.mutate(run_id, lambda doc: doc["entities"][0].update(details_loaded=True), "fixture.legacy")
        await core.details(run_id, ref)
        await core.transcript(run_id, ref)
        result = await core.transcript(run_id, ref)
        assert result["entities"][0]["description"] == "Recovered full description."
        assert result["entities"][0]["transcript"]["status"] == "available"
        assert len(calls) == 3


@pytest.mark.asyncio
async def test_cached_caption_failure_explains_cooldown_without_replacing_saved_metadata(tmp_path):
    def transport(_request):
        return httpx.Response(200, json={"provider": "youtube", "mode": "fixture", "attempts": 0, "cached": True, "retry_after_seconds": 240, "transcript": {"status": "blocked", "origin": "public_youtube_captions", "segments": []}})

    async with video_core(tmp_path, transport) as (core, run_id, _calls):
        before = (await core.get(run_id))["entities"]
        with pytest.raises(ApplicationError, match="Retry in 240 seconds") as error:
            await core.transcript(run_id, f"youtube:{VIDEO_ID}")
        assert error.value.status == 429
        after = await core.get(run_id)
        assert after["entities"] == before
        assert after["usage"]["research_attempts"] == 0
        assert not any(after["usage"]["reserved_by_provider"].values())


@pytest.mark.asyncio
async def test_malformed_caption_reply_retains_saved_source_and_settles_usage(tmp_path):
    async with video_core(tmp_path, lambda _request: reply(transcript={"status": "invented"})) as (core, run_id, _calls):
        before = (await core.get(run_id))["entities"]
        with pytest.raises(ApplicationError, match="malformed"):
            await core.transcript(run_id, f"youtube:{VIDEO_ID}")
        after = await core.get(run_id)
        assert after["entities"] == before and after["usage"]["research_attempts"] == 1


@pytest.mark.asyncio
async def test_exhausted_caption_allowance_is_not_a_revision_conflict(tmp_path):
    async with video_core(tmp_path, lambda _request: pytest.fail("No request after exhaustion")) as (core, run_id, calls):
        def exhausted(doc):
            doc["usage"]["by_provider"]["youtube"] = 8
            doc["usage"]["research_attempts"] = 8

        await core.store.mutate(run_id, exhausted, "fixture.exhausted")
        with pytest.raises(ApplicationError, match="allowance is exhausted") as error:
            await core.transcript(run_id, f"youtube:{VIDEO_ID}")
        assert error.value.status == 429
        assert calls == []
