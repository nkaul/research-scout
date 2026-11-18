"""Authored YouTube payloads prove transport, bounds and saved integration, not live access."""

import json

import httpx
import pytest

from research_scout.contracts import ResearchRequest, SourceRecord
from research_scout.providers.journal import ProviderError
from research_scout.providers.normalization import youtube_record
from research_scout.providers.service import create_provider_app
from research_scout.settings import child_environment

RAW = {
    "id": {"videoId": "abcdEF_12-3"},
    "snippet": {
        "title": "Context &amp; retrieval",
        "description": "A video description, not a transcript.",
        "channelTitle": "Authored Channel",
        "channelId": "UC" + "a" * 22,
        "publishedAt": "2025-07-03T12:00:00Z",
    },
}


def body():
    return {
        "operation_id": "youtube-search",
        "run_id": "youtube-run",
        "provider": "youtube",
        "query": "retrieval augmented generation tutorial",
        "filters": {"year_from": 2023, "year_to": 2025},
        "limits": {"per_branch": 10, "total": 10, "remaining_attempts": 4},
    }


def test_youtube_normalization_and_contracts():
    row = youtube_record(RAW)
    assert row["resource_type"] == "video" and row["abstract"] is None and row["doi"] is None
    assert row["description"] == RAW["snippet"]["description"] and row["year"] == 2025
    assert row["title"] == "Context & retrieval" and row["authors"] == ["Authored Channel"]
    assert row["url"] == "https://www.youtube.com/watch?v=abcdEF_12-3"
    assert row["provider_identifiers"]["youtube_channel_id"] == RAW["snippet"]["channelId"]
    assert SourceRecord.model_validate(row).provider == "youtube"
    assert (
        ResearchRequest(
            question="video lecture", provider="youtube", idempotency_key="one"
        ).provider
        == "youtube"
    )
    with pytest.raises(ProviderError):
        youtube_record({**RAW, "id": {"videoId": "../bad?secret"}})
    assert (
        youtube_record({**RAW, "snippet": {**RAW["snippet"], "publishedAt": "not a date"}})["year"]
        is None
    )


@pytest.mark.asyncio
async def test_youtube_one_bounded_page_key_header_filters_and_zero_call_replay(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("SCOUT_YOUTUBE_API_KEY", "authored-youtube-key")
    requests = []

    async def upstream(request):
        requests.append(request)
        assert request.headers["x-goog-api-key"] == "authored-youtube-key"
        assert "key" not in request.url.params
        return httpx.Response(200, json={"items": [RAW]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as upstream_client:
        app = create_provider_app(
            "youtube", "live", state_dir=tmp_path, http_client=upstream_client
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://youtube"
        ) as client:
            health = (await client.get("/health")).json()
            assert health["access_configured"] and health["capabilities"]["details"]
            response = await client.post("/operations/search", json=body())
            assert response.status_code == 200
            events = [json.loads(line) for line in response.text.splitlines()]
            rows = [e["record"] for e in events if e["kind"] == "source"]
            assert rows and rows[0]["description"] == RAW["snippet"]["description"]
            assert "authored-youtube-key" not in response.text
            before = len(requests)
            replay = await client.post("/operations/search", json=body())
            assert replay.status_code == 200
            assert len(requests) == before == 1
            params = requests[0].url.params
            assert (
                params["type"] == "video"
                and params["part"] == "snippet"
                and params["maxResults"] == "10"
            )
            assert params["publishedAfter"] == "2023-01-01T00:00:00Z"
            assert params["publishedBefore"] == "2026-01-01T00:00:00Z"


@pytest.mark.asyncio
async def test_missing_key_health_and_search_make_no_upstream_attempt(tmp_path, monkeypatch):
    monkeypatch.delenv("SCOUT_YOUTUBE_API_KEY", raising=False)
    calls = []

    async def upstream(request):
        calls.append(request)
        raise AssertionError("No key must mean no upstream call")

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as upstream_client:
        app = create_provider_app(
            "youtube", "live", state_dir=tmp_path, http_client=upstream_client
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://youtube"
        ) as client:
            h = (await client.get("/health")).json()
            assert not h["access_configured"] and h["readiness"] == "needs_access"
            assert h["access_method"] == "api_key"
            r = await client.post("/operations/search", json=body())
            assert "ACCESS_NOT_CONFIGURED" in r.text and not calls
            events = [json.loads(line) for line in r.text.splitlines()]
            assert not any(e.get("attempts", 0) for e in events)


@pytest.mark.asyncio
async def test_quota_error_is_sanitized_without_retry(tmp_path, monkeypatch):
    monkeypatch.setenv("SCOUT_YOUTUBE_API_KEY", "authored-private-value")
    calls = []

    async def upstream(request):
        calls.append(request)
        return httpx.Response(
            403,
            json={
                "error": {
                    "message": "authored-private-value",
                    "errors": [{"reason": "quotaExceeded"}],
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as upstream_client:
        app = create_provider_app(
            "youtube", "live", state_dir=tmp_path, http_client=upstream_client
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://youtube"
        ) as client:
            r = await client.post("/operations/search", json=body())
            assert len(calls) == 1 and "UPSTREAM_QUOTA_EXHAUSTED" in r.text
            assert "authored-private-value" not in r.text


def test_youtube_key_stays_in_only_its_process():
    env = {
        "SCOUT_MODE": "live",
        "SCOUT_YOUTUBE_API_KEY": "authored-secret",
        "OPENAI_API_KEY": "authored-model-secret",
    }
    assert child_environment("youtube", env)["SCOUT_YOUTUBE_API_KEY"] == "authored-secret"
    for service in ["core", "frontend", "openalex", "crossref", "unpaywall"]:
        assert "SCOUT_YOUTUBE_API_KEY" not in child_environment(service, env)


@pytest.mark.asyncio
async def test_automatic_video_type_scope_and_missing_access_are_preflight_only(tmp_path):
    from research_scout.core import PROVIDERS, Core, Settings

    ports = {data[2]: name for name, data in PROVIDERS.items()}
    missing = False
    calls = []

    async def health(request):
        calls.append(request)
        provider = ports[request.url.port]
        return httpx.Response(
            200,
            json={
                "provider": provider,
                "mode": "fixture",
                "status": "ok",
                "access_configured": not (missing and provider == "youtube"),
                "blocked_reason": "Configure SCOUT_YOUTUBE_API_KEY."
                if missing and provider == "youtube"
                else None,
                "capabilities": {"search": provider not in {"datacite", "unpaywall"}},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(health)) as client:
        core = Core(Settings(state_dir=tmp_path, mode="fixture"), client=client)
        try:
            selected, eligible, plan = await core.conversations._automatic_sources(
                "Video lectures", {"resource_type": "video"}
            )
            assert selected == eligible == ["youtube"]
            assert all(
                p["status"] == "skipped"
                for p in plan
                if p["role"] == "discovery" and p["provider"] != "youtube"
            )
            selected, _, _ = await core.conversations._automatic_sources(
                "Video tutorials about retrieval augmented generation", {}
            )
            assert "youtube" in selected and "europe_pmc" not in selected
            selected, _, _ = await core.conversations._automatic_sources(
                "Protein genetics video lectures", {}
            )
            assert "youtube" in selected and "europe_pmc" in selected
            missing = True
            selected, eligible, plan = await core.conversations._automatic_sources(
                "Video lectures", {}
            )
            assert "youtube" not in selected and "youtube" not in eligible
            assert next(p for p in plan if p["provider"] == "youtube")["status"] == "skipped"
            assert all(r.method == "GET" and r.url.path == "/health" for r in calls)
        finally:
            await core.close()
