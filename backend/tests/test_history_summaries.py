"""History headers avoid hydrating saved research while full reads stay compatible."""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from research_scout.api import create_app
from research_scout.contracts import ConversationRequest
from research_scout.conversations import ConversationStore
from research_scout.core import Core, Settings
from research_scout.store import Store, new_document

RUN_FIELDS = {"id", "question", "provider", "status", "created_at", "mode", "revision"}
CONVERSATION_FIELDS = {"id", "title", "status", "revision", "created_at", "updated_at"}


class UncopyablePayload:
    def __deepcopy__(self, memo):
        raise AssertionError("History summaries must not copy retained payloads")


def header(index):
    return {
        "id": f"saved-{index}",
        "question": f"Question {index}",
        "provider": "openalex",
        "mode": "fixture",
        "status": "SUCCEEDED",
        "revision": index,
        "created_at": f"2026-11-{index:02d}T00:00:00Z",
        "updated_at": f"2026-11-{index:02d}T01:00:00Z",
        "title": f"Exploration {index}",
        "entities": UncopyablePayload(),
        "turns": UncopyablePayload(),
        "_events": UncopyablePayload(),
    }


@pytest.mark.parametrize(
    ("store_type", "fields", "kwargs", "count"),
    [
        (Store, RUN_FIELDS, {}, 12),
        (Store, RUN_FIELDS, {"limit": 2}, 2),
        (ConversationStore, CONVERSATION_FIELDS, {}, 14),
    ],
)
async def test_headers_project_under_lock_without_hydrating_payloads(
    tmp_path, monkeypatch, store_type, fields, kwargs, count
):
    store = store_type(tmp_path)
    try:
        store.runs = {str(index): header(index) for index in range(1, 15)}

        def forbid_public(document):
            raise AssertionError("Header reads must not hydrate public documents")

        monkeypatch.setattr(store, "public", forbid_public)
        async with store.lock:
            pending = asyncio.create_task(store.summaries(**kwargs))
            await asyncio.sleep(0)
            assert not pending.done()
            store.runs["14"]["status"] = "PARTIAL"
        result = await pending
        assert len(result) == count
        assert all(set(item) == fields for item in result)
        assert [item["id"] for item in result] == [
            f"saved-{index}" for index in range(14, 14 - count, -1)
        ]
        assert result[0]["status"] == "PARTIAL"
        result[0]["status"] = "FAILED"
        assert store.runs["14"]["status"] == "PARTIAL"
    finally:
        store.close()


@pytest.fixture
def api(tmp_path):
    attempts = []

    async def offline(request):
        attempts.append(request.url)
        raise httpx.ConnectError("History tests must not dispatch provider requests")

    provider = httpx.AsyncClient(transport=httpx.MockTransport(offline))
    app = create_app(
        Settings(state_dir=tmp_path), core_factory=lambda config: Core(config, client=provider)
    )
    with TestClient(app) as client:
        yield client, app.state.core, attempts
    asyncio.run(provider.aclose())


def test_run_summary_opt_in_limits_and_full_list_compatibility(api, monkeypatch):
    client, core, attempts = api
    saved = []
    for index in range(1, 14):
        document = new_document(
            {"question": f"Question {index}", "provider": "openalex"},
            "fixture",
            f"key-{index}",
            f"request-{index}",
        )
        document.update(status="SUCCEEDED", created_at=header(index)["created_at"])
        saved.append(client.portal.call(core.store.add, document))
    full = list(reversed(saved))
    assert client.get("/api/research-runs").json() == {"runs": full}
    assert client.get("/api/research-runs?summary=false&limit=1").json() == {"runs": full}

    def forbid_public(document):
        raise AssertionError("Summary endpoint must not call the full-list projection")

    with monkeypatch.context() as patch:
        patch.setattr(core.store, "public", forbid_public)
        for suffix, count in (("summary=true", 12), ("summary=true&limit=2", 2)):
            response = client.get(f"/api/research-runs?{suffix}")
            assert response.status_code == 200
            assert response.json() == {
                "runs": [{key: item[key] for key in RUN_FIELDS} for item in full[:count]]
            }
    assert attempts == []


@pytest.mark.parametrize("limit", ["0", "101", "-1", "invalid"])
def test_run_summary_rejects_unbounded_limits(api, limit):
    client, core, attempts = api
    response = client.get(f"/api/research-runs?summary=true&limit={limit}")
    assert response.status_code == 422
    assert core.store.runs == {}
    assert attempts == []


def test_conversation_list_preserves_summary_contract_without_full_public_copy(api, monkeypatch):
    client, core, attempts = api
    saved = [
        client.portal.call(core.conversations.create, ConversationRequest()) for _ in range(2)
    ]
    expected = [
        {key: item[key] for key in CONVERSATION_FIELDS}
        for item in sorted(saved, key=lambda document: document["created_at"], reverse=True)
    ]

    def forbid_public(document):
        raise AssertionError("Conversation list must not hydrate or bound saved turns")

    with monkeypatch.context() as patch:
        patch.setattr(core.conversations.store, "public", forbid_public)
        response = client.get("/api/conversations")
        assert response.status_code == 200
        assert response.json() == {"conversations": expected}
    assert attempts == []
