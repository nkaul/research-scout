"""User-selected YouTube counts cross API, core and isolated provider boundaries."""

import hashlib
import json

import httpx
import pytest
from pydantic import ValidationError

from research_scout.contracts import ConversationRequest, ResearchRequest, TurnRequest, now
from research_scout.core import ApplicationError, Core, Settings
from research_scout.providers.journal import atomic_json
from research_scout.providers.normalization import youtube_record
from research_scout.providers.service import create_provider_app


@pytest.mark.parametrize("count", [0, 21, -1, 3.5, True, "15"])
def test_invalid_video_counts_are_rejected_before_dispatch(count):
    for model, fields in [
        (ResearchRequest, {"question": "Authored query", "idempotency_key": "one"}),
        (ConversationRequest, {}),
        (TurnRequest, {"message": "Authored query", "idempotency_key": "one", "expected_revision": 0}),
    ]:
        with pytest.raises(ValidationError):
            model(**fields, video_count=count)


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [2, 15, 20])
async def test_requested_video_count_controls_upstream_and_retained_pool(tmp_path, monkeypatch, count):
    monkeypatch.setenv("SCOUT_YOUTUBE_API_KEY", "authored-video-count-key")
    requested = []

    def transport(request):
        requested.append(int(request.url.params["maxResults"]))
        # Even an overfull response must not exceed the selected retained count.
        rows = [{"id": {"videoId": f"vid{index:08d}"}, "snippet": {
            "title": f"Authored video {index}", "description": "Authored description.",
            "channelTitle": "Authored channel", "publishedAt": "2025-01-01T00:00:00Z",
        }} for index in range(25)]
        return httpx.Response(200, json={"items": rows})

    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as upstream:
        app = create_provider_app("youtube", "live", state_dir=tmp_path, http_client=upstream)
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://youtube") as client:
            if count == 20:
                # Earlier code keyed a nominal 20-record pool but fetched only
                # ten videos. That persisted cache must not cap the new setting.
                legacy_key = "lexical-pool-v1:" + hashlib.sha256(json.dumps({
                    "provider": "youtube", "upstream": app.state.adapter.base_url,
                    "query": "Authored videos", "filters": {"year_from": None, "year_to": None, "resource_type": None}, "limit": 20,
                }, sort_keys=True).encode()).hexdigest()
                rows = [youtube_record({"id": {"videoId": f"old{index:08d}"}, "snippet": {
                    "title": "Old cached video", "description": "Old search snippet.", "publishedAt": "2025-01-01T00:00:00Z",
                }}) for index in range(10)]
                atomic_json(app.state.journal.path("cache", legacy_key), {"observed_at": now(), "records": rows, "provenance": {"transport": "official_rest"}})
            response = await client.post("/operations/search", json={
                "operation_id": "count-search", "run_id": "count-run", "query": "Authored videos",
                "limits": {"per_branch": count, "total": count, "remaining_attempts": 4},
            })
            assert response.status_code == 200
            events = [json.loads(line) for line in response.text.splitlines()]
            records = [event["record"] for event in events if event["kind"] == "source"]
            assert len({row["source_ref"] for row in records}) == count
            assert requested == [count]
            replay = await client.post("/operations/search", json={
                "operation_id": "count-search", "run_id": "count-run", "query": "Authored videos",
                "limits": {"per_branch": count, "total": count, "remaining_attempts": 4},
            })
            assert replay.status_code == 200 and requested == [count]


@pytest.mark.asyncio
async def test_larger_video_count_does_not_expand_other_provider_branches(tmp_path):
    app = create_provider_app("crossref", "fixture", state_dir=tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://provider") as client:
        result = await client.post("/operations/search", json={
            "operation_id": "invalid", "run_id": "invalid", "query": "Authored papers",
            "limits": {"per_branch": 15, "total": 20, "remaining_attempts": 4},
        })
        assert result.status_code == 422 and result.json()["code"] == "RESULT_LIMIT"


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [2, 15])
async def test_core_persists_count_and_forwards_it_without_changing_request_grant(tmp_path, count):
    bodies = []

    def transport(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, content='{"kind":"complete","attempts":0}\n', headers={"content-type": "application/x-ndjson"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        core = Core(Settings(state_dir=tmp_path, mode="fixture"), client=client)
        try:
            run = await core.create(ResearchRequest(question="Authored videos", provider="youtube", video_count=count, idempotency_key="count"), launch=False)
            assert run["video_count"] == count
            await core._search(run["id"])
            assert bodies[0]["limits"] == {"per_branch": count, "total": count, "remaining_attempts": 4}
            assert (await core.get(run["id"]))["plan"]["requested_video_count"] == count
            with pytest.raises(ApplicationError, match="start key belongs"):
                await core.create(ResearchRequest(question="Authored videos", provider="youtube", video_count=count + 1, idempotency_key="count"), launch=False)
        finally:
            await core.close()
