"""Crossref query scope and cache-policy contracts using authored HTTP responses."""

import hashlib
import json
from datetime import UTC, datetime

import httpx
import pytest

from research_scout.providers import rest_discovery
from research_scout.providers.journal import atomic_json
from research_scout.providers.normalization import source
from research_scout.providers.service import create_provider_app


class TestEncoder:
    configuration = {
        "model": "test-only-query-policy",
        "revision": "fixture-v1",
        "dimensions": 2,
        "query_mode": "symmetric",
        "document_mode": "symmetric",
        "similarity": "cosine",
    }

    def encode_query(self, text):
        return [1.0, 0.0]

    def encode_documents(self, texts):
        return [[1.0, 0.1] for _ in texts]


def body(provider="crossref", **overrides):
    return {
        "provider": provider,
        "operation_id": "first",
        "run_id": "first-run",
        "query": "marine ecosystem temperature context",
        "filters": {"year_from": 2020, "year_to": 2026},
        "limits": {"per_branch": 10, "total": 20, "remaining_attempts": 4},
        **overrides,
    }


async def search(app, value):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://provider"
    ) as client:
        response = await client.post("/operations/search", json=value)
    assert response.status_code == 200
    return [json.loads(line) for line in response.text.splitlines()]


def old_key(adapter, value):
    scope = {
        "provider": adapter.provider,
        "upstream": adapter.base_url,
        "query": value["query"],
        "filters": {"year_from": None, "year_to": None, "resource_type": None, **value["filters"]},
        "limit": 20,
    }
    return (
        "lexical-pool-v1:" + hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()
    )


@pytest.mark.asyncio
async def test_crossref_bibliographic_policy_invalidates_old_general_query_pool(
    tmp_path, monkeypatch
):
    requests = []

    def upstream(request):
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "message": {
                    "items": [
                        {
                            "DOI": f"10.1234/new-{index}",
                            "title": [f"Marine temperature study {index}"],
                            "published": {"date-parts": [[2025]]},
                            "type": "journal-article",
                        }
                        for index in range(25)
                    ],
                    "next-cursor": "must-not-be-followed",
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as network:
        app = create_provider_app(
            "crossref", "live", state_dir=tmp_path, http_client=network, encoder=TestEncoder()
        )
        app.state.adapter.request_interval = 0
        value = body()
        legacy = source(
            "crossref",
            "10.1234/stale",
            "live",
            title="Old general-metadata match",
            abstract="Old pool",
        )
        legacy_path = app.state.journal.path("cache", old_key(app.state.adapter, value))
        atomic_json(
            legacy_path,
            {
                "records": [legacy],
                "provenance": {"executed_arguments": {"query": value["query"]}},
                "observed_at": datetime.now(UTC).isoformat(),
            },
        )
        events = await search(app, value)
        assert events[-1]["status"] == "succeeded" and events[-1]["count"] == 20
        assert events[-1]["attempts"] == 1 and len(requests) == 1
        assert all(
            event["record"]["source_ref"] != legacy["source_ref"]
            for event in events
            if event["kind"] == "source"
        )
        args = requests[0].url.params
        assert args["query.bibliographic"] == value["query"]
        assert "query" not in args and "query.title" not in args
        assert args["sort"] == "relevance" and args["order"] == "desc"
        assert args["rows"] == "20" and args["offset"] == "0" and "cursor" not in args
        assert args["filter"] == "from-pub-date:2020-01-01,until-pub-date:2026-12-31"
        lexical = next(
            event
            for event in events
            if event.get("kind") == "branch.completed" and event["branch"] == "lexical"
        )
        assert lexical["provenance"]["query_policy"] == rest_discovery.CROSSREF_QUERY_POLICY
        assert lexical["provenance"]["query_scope"] == "bibliographic_metadata"
        assert all(
            event["record"]["abstract"] is None for event in events if event["kind"] == "source"
        )
        repeated = await search(app, body(operation_id="second", run_id="second-run"))
        assert repeated[-1]["attempts"] == 0 and len(requests) == 1
        assert any(event.get("provenance", {}).get("cached_pool") for event in repeated)
        # A later policy does not reinterpret or redispatch an immutable saved operation.
        monkeypatch.setattr(rest_discovery, "CROSSREF_QUERY_POLICY", "future-query-policy")
        replayed = await search(app, value)
        assert all(event["replayed"] for event in replayed) and len(requests) == 1


@pytest.mark.asyncio
async def test_other_provider_existing_pool_keys_remain_compatible(tmp_path):
    def forbidden(_request):
        raise RuntimeError("An unchanged same-provider cached pool needs no external request")

    async with httpx.AsyncClient(transport=httpx.MockTransport(forbidden)) as network:
        app = create_provider_app(
            "semantic_scholar",
            "live",
            state_dir=tmp_path,
            http_client=network,
            encoder=TestEncoder(),
        )
        value = body("semantic_scholar")
        cached = source(
            "semantic_scholar",
            "cached-paper",
            "live",
            title="Marine temperature context",
            year=2025,
        )
        path = app.state.journal.path("cache", old_key(app.state.adapter, value))
        atomic_json(
            path,
            {
                "records": [cached],
                "provenance": {"transport": "official_rest"},
                "observed_at": datetime.now(UTC).isoformat(),
            },
        )
        events = await search(app, value)
    assert events[-1]["status"] == "succeeded" and events[-1]["attempts"] == 0
    assert any(event.get("provenance", {}).get("cached_pool") for event in events)
