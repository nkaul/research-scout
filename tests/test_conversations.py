"""Conversation orchestration with real graphs and authored in-process provider contracts."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from research_scout.agents import run_discovery
from research_scout.api import create_app
from research_scout.contracts import (
    ConversationRequest,
    ResearchRequest,
    SourceRecord,
    TurnRequest,
    now,
)
from research_scout.core import ApplicationError, Core, Settings
from research_scout.providers.normalization import source


class DelayedEvents(httpx.AsyncByteStream):
    def __init__(self, provider, delay, doi="10.1234/authored.1"):
        self.provider, self.delay, self.doi = provider, delay, doi

    async def __aiter__(self):
        record = source(
            self.provider,
            "authored-1",
            "fixture",
            title="[FICTIONAL] Agent memory",
            authors=["Authored Author"],
            year=2024,
            doi=self.doi,
            abstract="Authored abstract, not a scientific finding.",
            resource_type="article",
        )
        for event in [
            {"kind": "usage", "attempts": 1},
            {"kind": "branch.started", "branch": "lexical"},
            {"kind": "source", "branch": "lexical", "rank": 1, "record": record},
            {"kind": "branch.completed", "branch": "lexical", "raw_count": 1, "count": 1},
        ]:
            yield (json.dumps(event) + "\n").encode()
        await asyncio.sleep(self.delay)
        yield (
            json.dumps(
                {"kind": "branch.completed", "branch": "semantic", "raw_count": 0, "count": 0}
            )
            + "\n"
        ).encode()
        yield (json.dumps({"kind": "complete", "attempts": 1}) + "\n").encode()


@pytest.fixture
async def chat_core(tmp_path):
    resources = []

    def make(*, handler=None, delay=0.06, state_dir=None):
        calls = []

        async def dispatch(request):
            calls.append(request)
            if handler:
                result = handler(request)
                return await result if hasattr(result, "__await__") else result
            provider = "openalex" if request.url.port == 8111 else "semantic_scholar"
            return httpx.Response(
                200,
                stream=DelayedEvents(provider, delay),
                headers={"content-type": "application/x-ndjson"},
            )

        client = httpx.AsyncClient(transport=httpx.MockTransport(dispatch))
        core = Core(
            Settings(state_dir=state_dir or tmp_path / str(len(resources)), model_mode="disabled"),
            client=client,
        )

        async def agent(**kwargs):
            return await run_discovery(
                **kwargs, search_callback=core.search_papers, mode="disabled"
            )

        core.agent_runner = agent
        resources.append((core, client))
        return core, calls

    yield make
    for core, client in resources:
        await core.close()
        await client.aclose()


async def wait_finished(core, conversation_id):
    for _ in range(300):
        snapshot = await core.conversations.get(conversation_id)
        if snapshot["status"] == "IDLE" and core.active_turn is None:
            return snapshot
        await asyncio.sleep(0.01)
    pytest.fail("Conversation did not reach a terminal saved state.")


async def send(core, conversation, message="Agent memory research", **kwargs):
    return await core.conversations.submit(
        conversation["id"],
        TurnRequest(
            message=message,
            expected_revision=conversation["revision"],
            idempotency_key=kwargs.pop("idempotency_key", "turn-1"),
            **kwargs,
        ),
    )


@pytest.mark.asyncio
async def test_real_turn_graph_progressively_runs_separate_provider_graphs(chat_core):
    core, calls = chat_core(delay=0.12)
    conversation = await core.conversations.create(
        ConversationRequest(providers=["openalex", "semantic_scholar"])
    )
    accepted = await send(core, conversation)
    for _ in range(100):
        snapshot = await core.conversations.get(conversation["id"])
        if snapshot["turns"][0]["sources"]:
            break
        await asyncio.sleep(0.01)
    assert snapshot["status"] == "RUNNING"
    assert len(snapshot["turns"][0]["sources"]) == 1
    finished = await wait_finished(core, conversation["id"])
    turn = finished["turns"][0]
    assert turn["status"] == "SUCCEEDED"
    assert len(turn["run_ids"]) == 2
    assert [item["provider"] for item in turn["sources"]] == ["openalex", "semantic_scholar"]
    assert len({item["source_ref"] for item in turn["sources"]}) == 2
    assert [call.url.port for call in calls] == [8111, 8114]
    assert turn["usage"] == {"research_attempts": 2, "model_http_attempts": 0, "model_cost_usd": 0}
    assert turn["plan"]["generation"] == "disabled"
    assert "Generation is disabled" in turn["response"]
    for run_id in turn["run_ids"]:
        assert (await core.get(run_id))["runtime"]["agent"] == "deterministic-routing"
    events = await core.conversations.store.replay(conversation["id"], accepted["cursor"])
    assert any(event["data"]["type"] == "source.available" for event in events)


@pytest.mark.asyncio
async def test_turn_idempotency_global_admission_and_saved_followup(chat_core):
    core, calls = chat_core(delay=0.1)
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    accepted = await send(core, conversation)
    repeated = await send(core, conversation)
    assert repeated["turns"][0]["id"] == accepted["turns"][0]["id"]
    with pytest.raises(ApplicationError, match="active"):
        await core.create(ResearchRequest(question="Another search", idempotency_key="other"))
    second = await core.conversations.create(ConversationRequest(routing="manual"))
    with pytest.raises(ApplicationError, match="active"):
        await send(core, second)
    finished = await wait_finished(core, conversation["id"])
    before = len(calls)
    await send(core, finished, message="Show source 1", action="saved", idempotency_key="turn-2")
    followed = await wait_finished(core, conversation["id"])
    assert len(calls) == before
    assert followed["turns"][-1]["sources"] == followed["turns"][0]["sources"]
    assert "Provider excerpt" in followed["turns"][-1]["response"]
    with pytest.raises(ApplicationError, match="reload"):
        await send(core, conversation, idempotency_key="stale")
    with pytest.raises(ApplicationError, match="another message"):
        await send(core, conversation, message="Changed request")


@pytest.mark.asyncio
async def test_exact_doi_routes_to_only_its_registry_and_preserves_provenance(chat_core):
    def registry(request):
        body = json.loads(request.content)
        if request.url.path.endswith("agency"):
            assert request.url.port == 8112
            return httpx.Response(
                200,
                json={
                    "provider": "crossref",
                    "mode": "fixture",
                    "attempts": 1,
                    "agency": "datacite",
                },
            )
        assert request.url.port == 8113
        return httpx.Response(
            200,
            json={
                "provider": "datacite",
                "mode": "fixture",
                "attempts": 1,
                "record": source(
                    "datacite",
                    body["doi"],
                    "fixture",
                    title="[FICTIONAL] Dataset",
                    doi=body["doi"],
                    year=2024,
                ),
            },
        )

    core, calls = chat_core(handler=registry)
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation, message="https://doi.org/10.1234/authored.1")
    finished = await wait_finished(core, conversation["id"])
    turn = finished["turns"][0]
    assert turn["action"] == "lookup"
    assert turn["status"] == "SUCCEEDED"
    assert turn["sources"][0]["provider"] == "datacite"
    assert turn["sources"][0]["registry_only"] is True
    assert turn["sources"][0]["run_id"] == ""
    assert turn["usage"]["research_attempts"] == 2
    assert [request.url.port for request in calls] == [8112, 8113]
    assert await core.store.list() == []


@pytest.mark.asyncio
async def test_unresolved_agency_does_not_try_another_provider(chat_core):
    core, calls = chat_core(
        handler=lambda request: httpx.Response(
            200, json={"provider": "crossref", "mode": "fixture", "attempts": 1, "agency": None}
        )
    )
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation, message="10.1234/not-found")
    finished = await wait_finished(core, conversation["id"])
    assert len(calls) == 1
    assert finished["turns"][0]["status"] == "FAILED"
    assert "no blind registry fallback" in finished["turns"][0]["warnings"][0]


@pytest.mark.asyncio
async def test_registry_http_failure_is_not_shown_as_completed_activity(chat_core):
    core, calls = chat_core(
        handler=lambda request: httpx.Response(
            429,
            json={
                "provider": "crossref",
                "mode": "fixture",
                "attempts": 1,
                "code": "UPSTREAM_RATE_LIMIT",
            },
        )
    )
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation, message="10.1234/requested")
    answer = (await wait_finished(core, conversation["id"]))["turns"][0]
    assert len(calls) == 1 and answer["status"] == "FAILED"
    assert answer["activity"][0]["status"] == "failed"
    assert answer["activity"][0]["attempts"] == 1
    assert answer["activity"][0]["error_code"] == "UPSTREAM_RATE_LIMIT"


@pytest.mark.asyncio
@pytest.mark.parametrize("is_oa", [True, False])
async def test_explicit_access_keeps_unpaywall_observations_out_of_research_sources(
    chat_core, is_oa
):
    def access(request):
        assert request.url.port == 8118 and request.url.path == "/operations/access"
        doi = json.loads(request.content)["doi"]
        location = {
            "url": "https://repository.example.org/item",
            "url_for_pdf": "https://repository.example.org/item.pdf",
            "license": "cc-by",
            "version": "acceptedVersion",
            "host_type": "repository",
        }
        observation = {
            "provider": "unpaywall",
            "mode": "fixture",
            "doi": doi,
            "is_oa": is_oa,
            "oa_status": "green" if is_oa else "closed",
            "best_oa_location": location if is_oa else None,
            "oa_locations": [location] if is_oa else [],
            "observed_at": now(),
            "version": "authored-access-v1",
        }
        return httpx.Response(
            200,
            json={"provider": "unpaywall", "mode": "fixture", "attempts": 1, "access": observation},
        )

    core, calls = chat_core(handler=access)
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    accepted = await send(core, conversation, message="10.1234/access", action="access")
    final = await wait_finished(core, conversation["id"])
    turn = final["turns"][0]
    assert turn["status"] == "SUCCEEDED" and turn["sources"] == [] and turn["run_ids"] == []
    assert turn["access"]["is_oa"] is is_oa
    assert turn["activity"][0]["provider"] == "unpaywall"
    assert turn["activity"][0]["operation"] == "access"
    assert turn["activity"][0]["source_count"] == 0
    assert turn["activity"][0]["access_location_count"] == (1 if is_oa else 0)
    assert turn["usage"]["research_attempts"] == 1
    assert "No PDF or full text was downloaded" in turn["response"]
    assert len(calls) == 1
    repeated = await send(core, conversation, message="10.1234/access", action="access")
    assert repeated["turns"][0]["id"] == accepted["turns"][0]["id"]
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_unpaywall_missing_contact_has_zero_attempts_and_no_registry_fallback(chat_core):
    core, calls = chat_core(
        handler=lambda request: httpx.Response(
            503,
            json={
                "provider": "unpaywall",
                "mode": "fixture",
                "attempts": 0,
                "code": "ACCESS_NOT_CONFIGURED",
            },
        )
    )
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation, message="10.1234/access", action="access")
    turn = (await wait_finished(core, conversation["id"]))["turns"][0]
    assert len(calls) == 1 and calls[0].url.port == 8118
    assert turn["status"] == "FAILED" and not turn.get("access") and turn["sources"] == []
    assert turn["usage"]["research_attempts"] == 0
    assert turn["activity"][0]["attempts"] == 0
    assert any("contact email" in warning for warning in turn["warnings"])


@pytest.mark.asyncio
async def test_access_cancellation_before_dispatch_and_unsafe_links_are_rejected(
    chat_core, monkeypatch
):
    core, calls = chat_core(
        handler=lambda request: pytest.fail("Cancellation must fence the access dispatch")
    )
    original = core.conversations._edit

    async def cancel_on_admission(conversation_id, turn_id, edit, kind):
        result = await original(conversation_id, turn_id, edit, kind)
        if kind == "registry.admitted":
            await original(
                conversation_id,
                turn_id,
                lambda turn: turn.update(status="CANCELLED"),
                "turn.cancelled",
            )
        return result

    monkeypatch.setattr(core.conversations, "_edit", cancel_on_admission)
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation, message="10.1234/access", action="access")
    assert (await wait_finished(core, conversation["id"]))["turns"][0]["status"] == "CANCELLED"
    assert calls == []
    from research_scout.contracts import AccessObservation

    with pytest.raises(ValueError, match="HTTP"):
        AccessObservation.model_validate(
            {
                "doi": "10.1234/access",
                "is_oa": True,
                "oa_status": "green",
                "mode": "fixture",
                "version": "v1",
                "observed_at": now(),
                "oa_locations": [{"url": "javascript:alert(1)"}],
            }
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "providers,ports",
    [(["arxiv", "europe_pmc"], [8115, 8117]), (["openaire", "crossref"], [8116, 8112])],
)
async def test_expanded_chat_discovers_only_explicit_selected_providers(
    chat_core, providers, ports
):
    def handler(request):
        provider = json.loads(request.content)["provider"]
        return httpx.Response(
            200,
            stream=DelayedEvents(provider, 0.01),
            headers={"content-type": "application/x-ndjson"},
        )

    core, calls = chat_core(handler=handler)
    conversation = await core.conversations.create(ConversationRequest(providers=providers))
    await send(core, conversation)
    turn = (await wait_finished(core, conversation["id"]))["turns"][0]
    assert turn["status"] == "SUCCEEDED"
    assert [item["provider"] for item in turn["sources"]] == providers
    assert [call.url.port for call in calls] == ports
    assert turn["usage"]["model_http_attempts"] == 0


def test_description_and_version_metadata_survive_without_becoming_abstracts():
    from research_scout.conversations import preview

    record = SourceRecord.model_validate(
        source(
            "openaire",
            "authored-1",
            "fixture",
            title="Authored",
            description="Description " * 200,
            descriptions=["Provider description"],
            provider_identifiers={"original_id": "author-id"},
            published_at="2025-01-01",
            updated_at="2025-02-01",
            version_relationships=[{"relation": "isVersionOf", "id": "authored-family"}],
        )
    )
    record.content_origin = "provider_description"
    display = preview(record.model_dump(), "run-authored")
    assert display["abstract"] is None and display["content_state"] == "description"
    assert display["description"] and display["description_truncated"]
    assert display["content_origin"] == "provider_description"
    assert display["provider_identifiers"] == {"original_id": "author-id"}
    assert display["version_relationships"][0]["relation"] == "isVersionOf"
    abstract = "a" * 1600
    view = preview(source("arxiv", "authored-v2", "fixture", abstract=abstract), "run-authored")
    assert len(view["abstract"]) == 1200 and view["abstract_truncated"]
    assert view["abstract_chars_available"] == 1600
    assert (
        len(
            preview(source("arxiv", "unicode", "fixture", abstract="研" * 1600), "r")[
                "abstract"
            ].encode()
        )
        <= 2400
    )


@pytest.mark.asyncio
async def test_cancel_retains_early_sources_and_fences_second_child(chat_core):
    core, calls = chat_core(delay=0.5)
    conversation = await core.conversations.create(
        ConversationRequest(providers=["openalex", "semantic_scholar"])
    )
    accepted = await send(core, conversation)
    for _ in range(100):
        snapshot = await core.conversations.get(conversation["id"])
        if snapshot["turns"][0]["sources"]:
            break
        await asyncio.sleep(0.01)
    result = await core.conversations.cancel(conversation["id"], accepted["turns"][0]["id"])
    assert result["turns"][0]["status"] == "CANCELLED"
    assert len(result["turns"][0]["sources"]) == 1
    await asyncio.sleep(0.05)
    assert [request.url.port for request in calls] == [8111]
    assert core.active_turn is None


@pytest.mark.asyncio
async def test_saved_conversation_restart_makes_no_external_calls(chat_core, tmp_path):
    core, calls = chat_core(state_dir=tmp_path / "reopen")
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation)
    finished = await wait_finished(core, conversation["id"])
    await core.close()
    reopened, reopened_calls = chat_core(state_dir=tmp_path / "reopen")
    assert await reopened.conversations.get(conversation["id"]) == finished
    assert reopened_calls == []
    assert len(calls) == 1
    assert await reopened.conversations.store.replay(conversation["id"], "bad-cursor") is None


@pytest.mark.asyncio
async def test_interrupted_turn_recovers_without_replaying_a_request(chat_core, tmp_path):
    core, _ = chat_core(state_dir=tmp_path / "interrupted")
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation)
    finished = await wait_finished(core, conversation["id"])

    def interrupted_snapshot(document):
        document["status"] = "RUNNING"
        document["turns"][0]["status"] = "RUNNING"
        document["turns"][0]["_operations"]["openalex"]["status"] = "admitted"

    await core.conversations.store.mutate(conversation["id"], interrupted_snapshot)
    await core.close()
    reopened, calls = chat_core(state_dir=tmp_path / "interrupted")
    recovered = await reopened.conversations.get(conversation["id"])
    assert recovered["status"] == "IDLE"
    assert recovered["turns"][0]["status"] == "INTERRUPTED"
    assert recovered["turns"][0]["sources"] == finished["turns"][0]["sources"]
    assert recovered["revision"] > finished["revision"]
    assert calls == []


@pytest.mark.asyncio
async def test_registry_cannot_return_a_different_doi_or_origin(chat_core):
    def registry(request):
        if request.url.path.endswith("agency"):
            return httpx.Response(
                200,
                json={
                    "provider": "crossref",
                    "mode": "fixture",
                    "attempts": 1,
                    "agency": "datacite",
                },
            )
        return httpx.Response(
            200,
            json={
                "provider": "datacite",
                "mode": "fixture",
                "attempts": 1,
                "record": source("crossref", "10.1234/wrong", "fixture", doi="10.1234/wrong"),
            },
        )

    core, calls = chat_core(handler=registry)
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation, message="10.1234/requested")
    finished = await wait_finished(core, conversation["id"])
    assert len(calls) == 2
    assert finished["turns"][0]["status"] == "FAILED"
    assert finished["turns"][0]["sources"] == []


@pytest.mark.asyncio
async def test_cancel_between_child_admission_and_link_never_dispatches(chat_core, monkeypatch):
    core, calls = chat_core()
    original = core.conversations._edit

    async def interrupt_link(conversation_id, turn_id, edit, kind):
        if kind == "provider.admitted":
            raise asyncio.CancelledError
        return await original(conversation_id, turn_id, edit, kind)

    monkeypatch.setattr(core.conversations, "_edit", interrupt_link)
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation)
    finished = await wait_finished(core, conversation["id"])
    assert finished["turns"][0]["status"] == "INTERRUPTED", finished["turns"][0]["warnings"]
    assert calls == []
    children = await core.store.list()
    assert len(children) == 1
    assert children[0]["status"] == "CANCELLED"
    assert children[0]["usage"]["research_attempts"] == 0


@pytest.mark.asyncio
async def test_one_provider_failure_preserves_other_provider_results(chat_core):
    def partial(request):
        if request.url.port == 8111:
            raise httpx.ConnectError("Authored outage")
        return httpx.Response(
            200,
            stream=DelayedEvents("semantic_scholar", 0.01),
            headers={"content-type": "application/x-ndjson"},
        )

    core, calls = chat_core(handler=partial)
    conversation = await core.conversations.create(
        ConversationRequest(providers=["openalex", "semantic_scholar"])
    )
    await send(core, conversation)
    finished = await wait_finished(core, conversation["id"])
    turn = finished["turns"][0]
    assert turn["status"] == "PARTIAL"
    assert [item["provider"] for item in turn["sources"]] == ["semantic_scholar"]
    assert [call.url.port for call in calls] == [8111, 8114]
    assert any("OpenAlex" in warning for warning in turn["warnings"])


def test_chat_api_validation_and_saved_reads_do_not_query_providers(tmp_path):
    app = create_app(Settings(state_dir=tmp_path))
    with TestClient(app) as client:
        created = client.post("/api/conversations", json={}).json()
        assert created["routing"] == "auto"
        conversation_id = created["id"]
        assert client.get(f"/api/conversations/{conversation_id}").json()["turns"] == []
        assert client.get("/api/conversations").json()["conversations"][0]["id"] == conversation_id
        assert client.get("/api/conversations/unknown").status_code == 404
        assert client.get(f"/api/conversations/{conversation_id}/turns/unknown").status_code == 404
        assert (
            client.post(f"/api/conversations/{conversation_id}/turns/unknown/cancel").status_code
            == 404
        )
        for change in [
            {"message": "研" * 667},
            {"providers": ["openalex", "openalex"]},
            {"action": "shell"},
            {"action": "lookup", "message": "not a DOI"},
        ]:
            response = client.post(
                f"/api/conversations/{conversation_id}/turns",
                json={
                    "message": "Research agents",
                    "expected_revision": 0,
                    "idempotency_key": "invalid",
                    **change,
                },
            )
            assert response.status_code == 422
        assert client.get(f"/api/conversations/{conversation_id}").json()["turns"] == []


@pytest.mark.asyncio
async def test_cancelled_access_does_not_publish_a_late_provider_observation(chat_core):
    entered = asyncio.Event()

    async def delayed(request):
        entered.set()
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            # Upstream may finish after local cancellation; do not publish it.
            pass
        return httpx.Response(
            200,
            json={
                "provider": "unpaywall",
                "mode": "fixture",
                "attempts": 1,
                "access": {
                    "provider": "unpaywall",
                    "mode": "fixture",
                    "doi": "10.1234/access",
                    "is_oa": True,
                    "oa_status": "green",
                    "best_oa_location": {"url": "https://late.example.org/record"},
                    "oa_locations": [{"url": "https://late.example.org/record"}],
                    "observed_at": now(),
                    "version": "late-access-v1",
                },
            },
        )

    core, calls = chat_core(handler=delayed)
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    accepted = await send(core, conversation, message="10.1234/access", action="access")
    await asyncio.wait_for(entered.wait(), timeout=1)
    await core.conversations.cancel(conversation["id"], accepted["turns"][0]["id"])
    final = await wait_finished(core, conversation["id"])
    turn = final["turns"][0]
    assert turn["status"] == "CANCELLED"
    assert not turn.get("access") and turn["sources"] == []
    assert len(calls) == 1
    private = await core.conversations._turn(conversation["id"], turn["id"])
    assert next(iter(private["_operations"].values()))["hold"] == 1
    repeated = await send(core, conversation, message="10.1234/access", action="access")
    assert repeated["turns"][0]["status"] == "CANCELLED" and len(calls) == 1


@pytest.mark.asyncio
async def test_access_response_for_another_doi_is_rejected_without_links(chat_core):
    core, calls = chat_core(
        handler=lambda request: httpx.Response(
            200,
            json={
                "provider": "unpaywall",
                "mode": "fixture",
                "attempts": 1,
                "access": {
                    "provider": "unpaywall",
                    "mode": "fixture",
                    "doi": "10.1234/other",
                    "is_oa": True,
                    "oa_status": "green",
                    "best_oa_location": {"url": "https://wrong.example.org/record"},
                    "oa_locations": [{"url": "https://wrong.example.org/record"}],
                    "observed_at": now(),
                    "version": "foreign-access-v1",
                },
            },
        )
    )
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await send(core, conversation, message="10.1234/requested", action="access")
    turn = (await wait_finished(core, conversation["id"]))["turns"][0]
    assert turn["status"] == "FAILED" and not turn.get("access") and turn["sources"] == []
    assert turn["usage"]["research_attempts"] == 1 and len(calls) == 1
    assert turn["activity"][0]["status"] == "failed"
    assert turn["activity"][0]["error_code"] == "INVALID_ACCESS_OBSERVATION"


def test_automatic_contract_default_and_advanced_manual_compatibility():
    assert ConversationRequest().routing == "auto"
    assert ConversationRequest().providers is None
    assert ConversationRequest(providers=["openalex"]).routing == "manual"
    assert ConversationRequest(routing="manual").providers is None
    with pytest.raises(ValidationError, match="omit the manual provider list"):
        ConversationRequest(routing="auto", providers=["openalex"])
    with pytest.raises(ValidationError):
        ConversationRequest(routing="manual", providers=["openalex", "crossref", "arxiv"])
    with pytest.raises(ValidationError, match="omit the manual provider list"):
        TurnRequest(
            message="Question",
            routing="auto",
            providers=["arxiv"],
            idempotency_key="invalid",
            expected_revision=0,
        )


PORT_PROVIDERS = {
    8111: "openalex",
    8112: "crossref",
    8113: "datacite",
    8114: "semantic_scholar",
    8115: "arxiv",
    8116: "openaire",
    8117: "europe_pmc",
    8118: "unpaywall",
}


def authored_health(provider, *, mode="fixture", **changes):
    return {
        "provider": provider,
        "mode": mode,
        "status": "ok",
        "access_configured": True,
        "readiness": "fixture" if mode == "fixture" else "configured_unverified",
        "access_method": "fixture" if mode == "fixture" else "public_anonymous",
        "capabilities": {
            "search": provider not in {"datacite", "unpaywall"},
            "access": provider == "unpaywall",
        },
        **changes,
    }


@pytest.mark.asyncio
async def test_auto_progressively_discovers_four_sources_and_enriches_unique_dois(chat_core):
    def automatic(request):
        provider = PORT_PROVIDERS[request.url.port]
        if request.method == "GET":
            assert request.url.path == "/health"
            return httpx.Response(200, json=authored_health(provider))
        if provider == "unpaywall":
            body = json.loads(request.content)
            return httpx.Response(
                200,
                json={
                    "provider": provider,
                    "mode": "fixture",
                    "attempts": 1,
                    "access": {
                        "provider": provider,
                        "mode": "fixture",
                        "doi": body["doi"],
                        "is_oa": True,
                        "oa_status": "green",
                        "oa_locations": [],
                        "best_oa_location": None,
                        "observed_at": now(),
                        "version": "v1",
                    },
                },
            )
        # Two providers agree on one DOI; another two supply distinct papers.
        doi = "10.1234/shared" if provider in {"openalex", "crossref"} else f"10.1234/{provider}"
        return httpx.Response(
            200,
            stream=DelayedEvents(provider, 0.08, doi),
            headers={"content-type": "application/x-ndjson"},
        )

    core, calls = chat_core(handler=automatic)
    conversation = await core.conversations.create(ConversationRequest())
    assert conversation["routing"] == "auto" and conversation["providers"] == []
    accepted = await send(core, conversation)
    for _ in range(100):
        snapshot = await core.conversations.get(conversation["id"])
        if snapshot["turns"][0]["papers"]:
            break
        await asyncio.sleep(0.005)
    assert snapshot["status"] == "RUNNING" and snapshot["turns"][0]["papers"]
    turn = (await wait_finished(core, conversation["id"]))["turns"][0]
    assert turn["status"] == "SUCCEEDED"
    assert turn["routing"] == "auto"
    assert turn["providers"] == ["openalex", "crossref", "arxiv", "openaire"]
    assert len(turn["sources"]) == 4 and len(turn["papers"]) == 3
    assert turn["sources"][0]["observation_reference"] and "abstract" not in turn["sources"][0]
    assert turn["papers"][0]["representative"]["abstract"]
    private = await core.conversations._turn(conversation["id"], turn["id"])
    assert private["sources"][0]["abstract"]
    shared = next(paper for paper in turn["papers"] if paper["doi"] == "10.1234/shared")
    assert shared["providers"] == ["openalex", "crossref"]
    assert len(shared["observations"]) == 2
    assert all(paper["access"]["status"] == "succeeded" for paper in turn["papers"])
    assert len([call for call in calls if call.method == "GET"]) == 8
    searches = [call for call in calls if call.url.path == "/operations/search"]
    assert [PORT_PROVIDERS[call.url.port] for call in searches] == turn["providers"]
    access = [call for call in calls if call.url.path == "/operations/access"]
    assert len(access) == 3
    assert len({json.loads(call.content)["operation_id"] for call in access}) == 3
    assert len({json.loads(call.content)["doi"] for call in access}) == 3
    assert turn["usage"]["research_attempts"] == 7 and turn["usage"]["model_http_attempts"] == 0
    assert (
        next(item for item in turn["source_plan"] if item["provider"] == "datacite")["status"]
        == "metadata_only"
    )
    assert (
        next(item for item in turn["source_plan"] if item["provider"] == "unpaywall")["role"]
        == "access"
    )
    before = len(calls)
    assert (await send(core, conversation))["turns"][0]["id"] == accepted["turns"][0]["id"]
    await core.conversations.get(conversation["id"])
    assert len(calls) == before  # Replay and saved views never rediscover/enrich.


@pytest.mark.asyncio
async def test_auto_eligibility_skips_blocked_limited_and_fixture_for_ai(chat_core):
    def health_only(request):
        assert request.method == "GET" and request.url.path == "/health"
        provider = PORT_PROVIDERS[request.url.port]
        mode = "fixture" if provider == "openalex" else "live"
        changes = {}
        if provider == "semantic_scholar":
            changes = {"last_error": "UPSTREAM_RATE_LIMIT", "access_method": "api_key"}
        if provider == "unpaywall":
            changes = {"access_configured": False, "blocked_reason": "Contact email required."}
        return httpx.Response(200, json=authored_health(provider, mode=mode, **changes))

    core, calls = chat_core(handler=health_only)
    core.settings.provider_modes = {
        provider: "fixture" if provider == "openalex" else "live"
        for provider in PORT_PROVIDERS.values()
    }
    selected, eligible, plan = await core.conversations._automatic_sources(
        "Cancer immunotherapy clinical trials", {}, agentic=True
    )
    assert "openalex" not in eligible and "semantic_scholar" not in eligible
    assert selected[:2] == ["europe_pmc", "crossref"]
    assert len(selected) <= 4 and set(selected) <= set(eligible)
    statuses = {item["provider"]: item for item in plan}
    assert "live observations" in statuses["openalex"]["reason"]
    assert "UPSTREAM_RATE_LIMIT" in statuses["semantic_scholar"]["reason"]
    assert statuses["unpaywall"]["status"] == "skipped"
    assert all(call.method == "GET" for call in calls)


@pytest.mark.asyncio
async def test_historical_missing_routing_stays_manual_and_turn_override_is_explicit(chat_core):
    core, calls = chat_core()
    conversation = await core.conversations.create(ConversationRequest(routing="manual"))
    await core.conversations.store.mutate(
        conversation["id"], lambda document: document.pop("routing"), "legacy.fixture"
    )
    conversation = await core.conversations.get(conversation["id"])
    await send(core, conversation)
    final = await wait_finished(core, conversation["id"])
    assert final["turns"][0]["routing"] == "manual"
    assert final["turns"][0]["providers"] == ["openalex"] and len(calls) == 1
    assert all(call.method == "POST" for call in calls)


@pytest.mark.asyncio
async def test_automatic_all_unavailable_has_no_research_or_model_dispatch(chat_core):
    def unavailable(request):
        assert request.method == "GET"
        raise httpx.ConnectError("Authored offline local service")

    core, calls = chat_core(handler=unavailable)
    conversation = await core.conversations.create(ConversationRequest())
    await send(core, conversation)
    turn = (await wait_finished(core, conversation["id"]))["turns"][0]
    assert turn["providers"] == [] and turn["sources"] == [] and turn["papers"] == []
    assert turn["usage"]["research_attempts"] == 0 and len(calls) == 8
    assert all(item["status"] == "skipped" for item in turn["source_plan"])
    assert core.generation.ledger["entries"] == {}


@pytest.mark.asyncio
async def test_large_auto_history_is_bounded_and_single_saved_turn_restores_data(chat_core):
    from research_scout.federation import buildpapers

    core, calls = chat_core()
    conversation = await core.conversations.create(ConversationRequest())
    turns = []
    for turn_index in range(5):
        sources = [
            {
                "source_ref": f"openalex:{index}",
                "record_id": str(index),
                "provider": "openalex",
                "version": "v1",
                "run_id": f"run-{turn_index}",
                "title": "Authored Unicode paper " + "研" * 100,
                "abstract": "研" * 800,
                "description": "究" * 800,
                "doi": f"10.1234/{index}",
                "year": 2024,
                "mode": "fixture",
                "content_state": "abstract",
                "abstract_chars_available": 800,
            }
            for index in range(80)
        ]
        turns.append(
            {
                "id": f"saved-{turn_index}",
                "action": "discover",
                "routing": "auto",
                "message": "Authored saved-history bound",
                "status": "SUCCEEDED",
                "providers": ["openalex"],
                "sources": sources,
                "papers": buildpapers(sources),
                "run_ids": [f"run-{turn_index}"],
                "warnings": [],
                "response": "Saved authored data",
                "usage": {"model_http_attempts": 9, "research_attempts": 8},
                "_operations": {},
                "retrieval": {
                    "status": "completed",
                    "llm_requests": [
                        {
                            "step": str(index),
                            "status": "response_received",
                            "body": {"input": "研" * 12_000},
                        }
                        for index in range(9)
                    ],
                    "assessments": [],
                    "source_requests": [],
                },
            }
        )
    await core.conversations.store.mutate(
        conversation["id"], lambda document: document.update(turns=turns), "authored.history"
    )
    snapshot = await core.conversations.get(conversation["id"])
    assert len(json.dumps(snapshot).encode()) < 3 * 1024 * 1024
    assert any(turn.get("history_compacted") for turn in snapshot["turns"])
    assert snapshot["turns"][0]["saved_result_counts"]["papers"] == 80
    restored = await core.conversations.get_turn(conversation["id"], "saved-0")
    assert len(restored["papers"]) == 80
    assert restored["papers"][0]["representative"]["abstract"] == "研" * 800
    assert restored["retrieval"]["llm_requests"][0]["body"]["input"] == "研" * 12_000
    private = await core.conversations.get(conversation["id"], private=True)
    assert private["turns"][0]["sources"][0]["abstract"] == "研" * 800
    assert len(private["turns"][0]["papers"]) == 80 and calls == []


@pytest.mark.asyncio
async def test_cancel_auto_enrichment_fences_late_access_and_pending_projection(chat_core):
    entered = asyncio.Event()

    async def handler(request):
        provider = PORT_PROVIDERS[request.url.port]
        if request.method == "GET":
            return httpx.Response(200, json=authored_health(provider))
        if provider != "unpaywall":
            return httpx.Response(
                200,
                stream=DelayedEvents(provider, 0),
                headers={"content-type": "application/x-ndjson"},
            )
        entered.set()
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            pass  # The external reply can arrive after local cancellation.
        body = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "provider": provider,
                "mode": "fixture",
                "attempts": 1,
                "access": {
                    "provider": provider,
                    "mode": "fixture",
                    "doi": body["doi"],
                    "is_oa": True,
                    "oa_status": "green",
                    "oa_locations": [],
                    "observed_at": now(),
                    "version": "late-v1",
                },
            },
        )

    core, calls = chat_core(handler=handler)
    conversation = await core.conversations.create(ConversationRequest())
    accepted = await send(core, conversation)
    await asyncio.wait_for(entered.wait(), timeout=3)
    turn_id = accepted["turns"][0]["id"]
    await core.conversations.cancel(conversation["id"], turn_id)
    turn = (await wait_finished(core, conversation["id"]))["turns"][0]
    assert turn["status"] == "CANCELLED" and turn["papers"]
    assert all(
        paper["access"]["status"] == "failed" and "observation" not in paper["access"]
        for paper in turn["papers"]
    )
    private = await core.conversations._turn(conversation["id"], turn_id)
    operation = next(
        operation
        for operation in private["_operations"].values()
        if operation["operation"] == "access"
    )
    assert operation["hold"] == 1 and operation["attempts"] == 0
    assert len([call for call in calls if call.url.path.endswith("/access")]) == 1


def test_auto_access_recovery_stops_display_without_releasing_unknown_grant():
    from research_scout.conversations import ConversationStore

    document = {
        "status": "RUNNING",
        "revision": 2,
        "turns": [
            {
                "status": "RUNNING",
                "routing": "auto",
                "warnings": [],
                "papers": [{"paper_id": "doi:10.1234/held", "access": {"status": "running"}}],
                "_federation_access": ["10.1234/held"],
                "_operations": {"op": {"provider": "unpaywall", "attempts": 0, "hold": 1}},
            }
        ],
    }
    assert ConversationStore._recover(None, document)
    turn = document["turns"][0]
    assert turn["status"] == "INTERRUPTED" and turn["papers"][0]["access"]["status"] == "failed"
    assert turn["_operations"]["op"]["hold"] == 1
    assert turn["_federation_access"] == ["10.1234/held"]
