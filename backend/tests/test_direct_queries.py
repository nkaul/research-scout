"""Explicit direct mode is independent of AI access/credits and never a fallback."""

import asyncio
import json
from contextlib import AsyncExitStack

import httpx
import pytest
from test_conversations import PORT_PROVIDERS, DelayedEvents, authored_health, send, wait_finished
from test_conversations import chat_core as chat_core
from test_datasets import saved_turn

from research_scout.contracts import ConversationRequest
from research_scout.core import ApplicationError, Core, Settings
from research_scout.dataset_contracts import DatasetSearchRequest
from research_scout.datasets import problem_context
from research_scout.providers.dataset_service import create_dataset_provider_app
from research_scout.providers.repo_service import create_repo_provider_app
from research_scout.providers.service import create_provider_app
from research_scout.repo_contracts import RepoSearchRequest


@pytest.mark.asyncio
async def test_direct_topic_keeps_input_scope_filters_count_and_bypasses_unavailable_ai(chat_core):
    def provider(request):
        name = PORT_PROVIDERS[request.url.port]
        if request.method == "GET":
            return httpx.Response(200, json=authored_health(name))
        assert name in {"arxiv", "crossref"}
        return httpx.Response(200, stream=DelayedEvents(name, 0.001, doi=None))

    core, calls = chat_core(handler=provider)
    for index in range(20):
        await core.generation.reserve_retrieval(f"already-reserved-{index}")
    assert not core.retrieval.readiness()["ready"]

    async def forbidden_model(_payload):
        pytest.fail("Explicit direct mode invoked a hosted model")

    core.retrieval.requester = forbidden_model
    original = "Efficient RAG: exact query + context"
    conversation = await core.conversations.create(
        ConversationRequest(
            source_scope=["arxiv", "crossref"],
            filters={"year_from": 2020, "year_to": 2026},
            video_count=17,
        )
    )
    accepted = await send(core, conversation, original, agentic=False)
    finished = await wait_finished(core, conversation["id"])
    turn = finished["turns"][0]
    assert turn["status"] == "SUCCEEDED" and turn["agentic"] is False
    assert (
        turn["plan"]["query_mode"] == "direct"
        and turn["plan"]["query_origin"] == "user_direct_query"
    )
    assert turn["message"] == original and "retrieval" not in turn
    assert turn["source_scope"] == turn["providers"] == ["arxiv", "crossref"]
    assert turn["video_count"] == 17
    dispatched = [json.loads(request.content) for request in calls if request.method == "POST"]
    assert len(dispatched) == 2
    assert all(body["lexical_query"] == original for body in dispatched)
    assert all(
        body["filters"]["year_from"] == 2020 and body["filters"]["year_to"] == 2026
        for body in dispatched
    )
    children = await asyncio.gather(*(core.get(identity) for identity in turn['run_ids']))
    assert all(child['video_count'] == 17 and child['question'] == original for child in children)
    assert turn["usage"]["model_http_attempts"] == 0
    assert core.generation.economics.get_economics()["reserved"] == 100
    before = len(calls)
    replay = await send(core, conversation, original, agentic=False)
    assert replay["turns"][0]["id"] == accepted["turns"][0]["id"] and len(calls) == before
    with pytest.raises(ApplicationError, match="belongs"):
        await send(core, conversation, original, agentic=True)
    assert len(calls) == before


@pytest.mark.asyncio
async def test_explicit_direct_data_and_repos_keep_raw_context_without_any_model_or_credits(
    tmp_path,
):
    services = {
        8120: create_dataset_provider_app("fixture", state_dir=tmp_path),
        8113: create_provider_app("datacite", "fixture", state_dir=tmp_path),
        8121: create_repo_provider_app("fixture", state_dir=tmp_path),
    }
    requests = []
    async with AsyncExitStack() as stack:
        clients = {}
        for port, app in services.items():
            await stack.enter_async_context(app.router.lifespan_context(app))
            clients[port] = await stack.enter_async_context(
                httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver")
            )

        async def dispatch(request):
            body = json.loads(request.content)
            requests.append(body)
            return await clients[request.url.port].post(request.url.path, json=body)

        client = httpx.AsyncClient(transport=httpx.MockTransport(dispatch))
        core = Core(Settings(state_dir=tmp_path / "core-state"), client=client)
        try:

            async def data_specialist(context, provider, **scope):
                await core.datasets.search_provider(scope["search_id"], provider)

            async def repo_specialist(context, provider, **scope):
                await core.repos.search_repositories(scope["search_id"])

            core.datasets.specialist_runner = data_specialist
            core.repos.specialist_runner = repo_specialist
            conversation = await core.conversations.create(ConversationRequest())
            turn = saved_turn()
            turn.update(
                message="Retrieval augmented generation evaluation", agentic=False, status="FAILED"
            )
            turn['usage']['model_http_attempts'] = 0
            turn.pop("retrieval")
            await core.conversations.store.mutate(
                conversation["id"], lambda row: row["turns"].append(turn)
            )
            data_request = DatasetSearchRequest(
                conversation_id=conversation["id"],
                turn_id=turn["id"],
                idempotency_key="direct-data",
                limit=3,
            )
            repo_request = RepoSearchRequest(
                conversation_id=conversation["id"],
                turn_id=turn["id"],
                idempotency_key="direct-repos",
                limit=2,
            )
            data = await core.datasets.create(data_request)
            repos = await core.repos.create(repo_request)
            await asyncio.gather(core.datasets.tasks[data["id"]], core.repos.tasks[repos["id"]])
            for saved in [await core.datasets.get(data["id"]), await core.repos.get(repos["id"])]:
                assert saved["status"] == "SUCCEEDED" and saved["records"]
                context = saved["context"]
                assert context["query"] == context["canonical_query"] == turn["message"]
                assert (
                    context["query_origin"] == "user_direct_query"
                    and context["origin"] == "saved_direct_query"
                )
                assert context["query_mode"] == "direct"
                assert (
                    context["shared_plan"]
                    is context["resource_query"]
                    is context["context_expansion"]
                    is None
                )
                assert context["assumptions"] == context["tags"] == [] and context["domain"] is None
            assert len(requests) == 3 and all(body["query"] == turn["message"] for body in requests)
            assert core.generation.ledger["entries"] == {}
            assert core.generation.economics.get_economics()["used"] == 0
            await core.datasets.list(conversation["id"], turn["id"])
            await core.repos.list(conversation["id"], turn["id"])
            assert (await core.datasets.create(data_request))["id"] == data["id"]
            assert (await core.repos.create(repo_request))["id"] == repos["id"]
            assert len(requests) == 3
        finally:
            await core.close()
            await client.aclose()


def test_direct_context_never_downgrades_ai_history_or_silently_truncates_long_input():
    turn = saved_turn()
    with pytest.raises(ValueError, match="AI-refined"):
        problem_context({"id": "c"}, {**turn, "agentic": False})
    direct = {key: value for key, value in turn.items() if key != "retrieval"}
    direct.update(agentic=False, message="x" * 401)
    with pytest.raises(ValueError, match="400 characters"):
        problem_context({"id": "c"}, direct)
    direct.update(message="Valid direct query", status="CANCELLED")
    with pytest.raises(ValueError, match="stopped query"):
        problem_context({"id": "c"}, direct)
    with pytest.raises(ValueError, match="AI-refined"):
        problem_context(
            {"id": "c"}, {key: value for key, value in direct.items() if key != "agentic"}
        )
