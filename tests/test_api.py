"""Application boundary validation, saved reads and MCP capability surface."""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from research_scout.api import create_app
from research_scout.core import Core, Settings


@pytest.fixture
def api(tmp_path):
    attempts = []

    async def offline(request):
        attempts.append(request.url)
        raise httpx.ConnectError("Fixture provider intentionally offline")

    settings = Settings(state_dir=tmp_path)
    provider_client = httpx.AsyncClient(transport=httpx.MockTransport(offline))
    app = create_app(settings, core_factory=lambda config: Core(config, client=provider_client))
    with TestClient(app) as client:
        yield client, app, attempts
    asyncio.run(provider_client.aclose())


@pytest.mark.parametrize(
    "change",
    [
        {"question": "x" * 2001},
        {"question": "研" * 667},  # 2,001 UTF-8 bytes despite fewer than 2,000 characters.
        {"question": '"' * 2000},  # JSON escaping can exceed the fixed context envelope too.
        {"provider": "datacite"},
        {"provider": "unregistered"},
        {"filters": {"year_from": 2026, "year_to": 2020}},
        {"filters": {"country": "not-a-supported-hard-filter"}},
        {"unexpected_model_tool": "shell"},
    ],
)
def test_invalid_start_never_dispatches(api, change):
    client, _, attempts = api
    response = client.post(
        "/api/research-runs",
        json={
            "question": "Authored validation question",
            "provider": "openalex",
            "filters": {},
            "idempotency_key": "boundary-fixture",
            **change,
        },
    )
    assert response.status_code == 422
    assert attempts == []
    assert client.get("/api/research-runs").json() == {"runs": []}


@pytest.mark.parametrize("question", ["a" * 2000, "研" * 666])
def test_supported_question_boundary_is_preserved_exactly(api, monkeypatch, question):
    client, app, attempts = api
    admitted = []

    async def record_admission(request):
        admitted.append(request.question)
        return {"question": request.question, "status": "admitted_for_test"}

    monkeypatch.setattr(app.state.core, "create", record_admission)
    response = client.post(
        "/api/research-runs",
        json={"question": question, "idempotency_key": "supported-input-boundary"},
    )
    assert response.status_code == 202
    assert response.json()["question"] == question
    assert admitted == [question]
    assert attempts == []


def test_unknown_saved_run_does_not_create_research(api):
    client, _, attempts = api
    assert client.get("/api/research-runs/unknown/snapshot").status_code == 404
    assert client.post("/api/research-runs/unknown/exports").status_code == 404
    assert attempts == []


def test_core_starts_without_any_provider_and_reports_each_independently(api):
    client, _, attempts = api
    assert client.get("/health").json()["status"] == "ok"
    assert attempts == []
    providers = client.get("/api/providers").json()["providers"]
    assert len(providers) == 8
    assert all(p["status"] == "unavailable" for p in providers)
    assert len(attempts) == 8  # Explicit local health requests, never research requests.
    assert client.get("/api/research-runs").json() == {"runs": []}


def test_application_mcp_exposes_no_human_mutation_or_filesystem_tools(api):
    _, app, attempts = api
    tools = asyncio.run(app.state.mcp.list_tools())
    assert {tool.name for tool in tools} == {"search_papers", "get_research_run"}
    search = next(tool for tool in tools if tool.name == "search_papers")
    assert set(search.inputSchema["properties"]) == {"run_id"}
    assert attempts == []
