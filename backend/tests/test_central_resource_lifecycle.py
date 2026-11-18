"""Central ownership/recovery over real child graphs and authored provider doubles."""

import asyncio
import copy
import json
import shutil
from contextlib import AsyncExitStack

import httpx
import pytest
from test_agentic_retrieval import PLAN, completion
from test_conversations import PORT_PROVIDERS, DelayedEvents, authored_health, send, wait_finished
from test_conversations import chat_core as chat_core

from research_scout.contracts import ConversationRequest
from research_scout.core import ApplicationError, Core, Settings
from research_scout.providers.dataset_service import create_dataset_provider_app
from research_scout.providers.normalization import source
from research_scout.providers.repo_service import create_repo_provider_app
from research_scout.providers.service import create_provider_app
from research_scout.retrieval import RetrievalConfig

AUXILIARY_LIMITS = {"papers": 0, "videos": 0, "datasets": 2, "repos": 3}


async def children_linked(core, conversation_id):
    for _ in range(300):
        saved = await core.conversations.get(conversation_id)
        turn = saved["turns"][0]
        if all(turn["resource_jobs"][lane]["search_id"] for lane in ("datasets", "repos")):
            return turn
        await asyncio.sleep(0.01)
    pytest.fail("Central search did not link its independently saved children.")


@pytest.fixture
async def central_factory(tmp_path):
    resources = []

    async def make(*, pause=False):
        base = tmp_path / str(len(resources))
        stack = AsyncExitStack()
        clients = {}
        for port, app in {
            8120: create_dataset_provider_app("fixture", state_dir=base / "providers"),
            8113: create_provider_app("datacite", "fixture", state_dir=base / "providers"),
            8121: create_repo_provider_app("fixture", state_dir=base / "providers"),
        }.items():
            await stack.enter_async_context(app.router.lifespan_context(app))
            clients[port] = await stack.enter_async_context(
                httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver")
            )
        calls, model_calls, entered = [], [], set()
        release = asyncio.Event()

        async def dispatch(request):
            calls.append((request.method, request.url.port, request.url.path))
            if request.url.port in clients:
                if request.method == "GET":
                    return await clients[request.url.port].get(request.url.path)
                return await clients[request.url.port].post(
                    request.url.path, json=json.loads(request.content)
                )
            assert request.method == "GET", "Disabled literature dispatched provider work"
            return httpx.Response(200, json=authored_health(PORT_PROVIDERS[request.url.port]))

        async def requester(payload):
            model_calls.append(payload)
            assert payload["text"]["format"]["name"] == "SearchPlan"
            return completion({**copy.deepcopy(PLAN), "provider_queries": []})

        client = httpx.AsyncClient(transport=httpx.MockTransport(dispatch))
        core = Core(
            Settings(state_dir=base / "state", model_mode="disabled"),
            client=client,
            retrieval_config=RetrievalConfig(enabled=True, api_key="authored-test-value"),
            retrieval_requester=requester,
        )

        async def dataset_specialist(context, provider, **scope):
            entered.add(provider)
            if pause:
                await release.wait()
            await core.datasets.search_provider(scope["search_id"], provider)

        async def repo_specialist(context, provider, **scope):
            entered.add("github")
            if pause:
                await release.wait()
            await core.repos.search_repositories(scope["search_id"])

        core.datasets.specialist_runner = dataset_specialist
        core.repos.specialist_runner = repo_specialist
        resources.append((core, client, stack))
        return core, calls, model_calls, entered

    yield make
    for core, client, stack in reversed(resources):
        await core.close()
        await client.aclose()
        await stack.aclose()


async def start_auxiliary(core, *, agentic=False):
    conversation = await core.conversations.create(ConversationRequest())
    accepted = await send(
        core,
        conversation,
        "Retrieval augmented generation evaluation",
        source_scope=[],
        modality_limits=AUXILIARY_LIMITS,
        agentic=agentic,
    )
    return conversation, accepted


@pytest.mark.asyncio
async def test_central_retry_reuses_children_and_cancel_joins_them(central_factory):
    core, calls, model_calls, entered = await central_factory(pause=True)
    conversation, accepted = await start_auxiliary(core)
    turn = await children_linked(core, conversation["id"])
    repeated = await send(
        core,
        conversation,
        "Retrieval augmented generation evaluation",
        source_scope=[],
        modality_limits=AUXILIARY_LIMITS,
    )
    assert repeated["turns"][0]["id"] == accepted["turns"][0]["id"]
    assert len(core.datasets.store.runs) == len(core.repos.store.runs) == 1
    for _ in range(300):
        if entered == {"hugging_face", "datacite", "github"}:
            break
        await asyncio.sleep(0.01)
    assert entered == {"hugging_face", "datacite", "github"}
    with pytest.raises(ApplicationError, match="another message"):
        await send(
            core,
            conversation,
            "Retrieval augmented generation evaluation",
            source_scope=[],
            modality_limits={**AUXILIARY_LIMITS, "repos": 4},
        )
    stopped = await core.conversations.cancel(conversation["id"], turn["id"])
    assert stopped["turns"][0]["status"] == "CANCELLED"
    for lane, manager in (("datasets", core.datasets), ("repos", core.repos)):
        identity = turn["resource_jobs"][lane]["search_id"]
        assert (await manager.get(identity))["status"] == "CANCELLED"
        assert manager.tasks[identity].done()
        assert stopped["turns"][0]["resource_jobs"][lane]["status"] == "CANCELLED"
    assert not [call for call in calls if call[0] == "POST"] and model_calls == []
    assert core.generation.economics.get_economics()["used"] == 0


@pytest.mark.asyncio
async def test_cancel_finds_durable_child_before_parent_link(central_factory, monkeypatch):
    core, calls, _, _ = await central_factory(pause=True)
    admitted = asyncio.Event()
    hold = asyncio.Event()
    create = core.datasets.create
    saved_children = []

    async def before_link(request, *, launch=True):
        saved = await create(request, launch=launch)
        saved_children.append(saved["id"])
        admitted.set()
        await hold.wait()
        return saved

    monkeypatch.setattr(core.datasets, "create", before_link)
    conversation, accepted = await start_auxiliary(core)
    await asyncio.wait_for(admitted.wait(), timeout=3)
    before = await core.conversations.get(conversation["id"])
    assert before["turns"][0]["resource_jobs"]["datasets"]["search_id"] is None
    await core.conversations.cancel(conversation["id"], accepted["turns"][0]["id"])
    assert (await core.datasets.get(saved_children[0]))["status"] == "CANCELLED"
    assert core.datasets.tasks == {} and core.repos.store.runs == {}
    assert not [call for call in calls if call[0] == "POST"]


@pytest.mark.asyncio
async def test_restart_terminalizes_parent_jobs_and_children_without_replay(
    central_factory,
    tmp_path,
):
    core, _, _, _ = await central_factory(pause=True)
    conversation, _ = await start_auxiliary(core)
    turn = await children_linked(core, conversation["id"])
    snapshot_path = tmp_path / "crash-snapshot"
    for name in ("conversations", "dataset-searches", "repo-searches"):
        target = snapshot_path / name
        target.mkdir(parents=True)
        for source_path in (core.settings.state_dir / name).glob("*.json"):
            shutil.copy2(source_path, target / source_path.name)
    calls = []

    async def forbidden(request):
        calls.append(request)
        pytest.fail("Restart replayed provider work")

    async with httpx.AsyncClient(transport=httpx.MockTransport(forbidden)) as client:
        recovered = Core(Settings(state_dir=snapshot_path, model_mode="disabled"), client=client)
        try:
            saved = await recovered.conversations.get(conversation["id"])
            restored_turn = saved["turns"][0]
            assert restored_turn["status"] == "INTERRUPTED"
            assert all(
                restored_turn["resource_jobs"][lane]["status"] == "INTERRUPTED"
                for lane in ("datasets", "repos")
            )
            for lane, manager in (("datasets", recovered.datasets), ("repos", recovered.repos)):
                assert (await manager.get(turn["resource_jobs"][lane]["search_id"]))[
                    "status"
                ] == "INTERRUPTED"
                assert manager.tasks == {}
            assert recovered.conversations.tasks == {} and calls == []
        finally:
            await recovered.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("agentic", [False, True])
async def test_auxiliary_only_search_has_one_shared_ai_plan_or_no_model(
    central_factory,
    agentic,
):
    core, calls, model_calls, _ = await central_factory()
    conversation, _ = await start_auxiliary(core, agentic=agentic)
    saved = await wait_finished(core, conversation["id"])
    turn = saved["turns"][0]
    assert turn["status"] == "SUCCEEDED", json.dumps(
        {"warnings": turn["warnings"], "jobs": turn["resource_jobs"]}, indent=2
    )
    assert turn["providers"] == [] and turn["source_scope"] == []
    assert turn["run_ids"] == [] and turn["sources"] == []
    assert turn["resource_jobs"]["papers"]["status"] == "DISABLED"
    assert turn["resource_jobs"]["videos"]["status"] == "DISABLED"
    for lane, manager in (("datasets", core.datasets), ("repos", core.repos)):
        job = turn["resource_jobs"][lane]
        child = await manager.get(job["search_id"])
        assert child["status"] == job["status"] == "SUCCEEDED"
        assert job["record_count"] == len(child["records"]) > 0
        assert child["usage"]["model_http_attempts"] == 0
        assert child["context"]["query_mode"] == ("ai" if agentic else "direct")
    posts = [port for method, port, _ in calls if method == "POST"]
    assert sorted(posts) == [8113, 8120, 8121]
    assert len(model_calls) == turn["usage"]["model_http_attempts"] == int(agentic)
    economics = core.generation.economics.get_economics()
    assert economics["used"] == int(agentic) and economics["reserved"] == 0
    before = (len(calls), len(model_calls))
    await core.conversations.get(conversation["id"])
    await core.datasets.list(conversation["id"], turn["id"])
    await core.repos.list(conversation["id"], turn["id"])
    assert (len(calls), len(model_calls)) == before
    if agentic:
        content = json.loads(model_calls[0]["input"][0]["content"][0]["text"])
        assert content["eligible_providers"] == []
        assert turn["retrieval"]["provider_queries"] == []


@pytest.mark.asyncio
async def test_parent_failure_retains_auxiliary_success_as_partial(central_factory, monkeypatch):
    core, _, _, _ = await central_factory()

    async def failed_after_children(*_args):
        raise RuntimeError("Authored local projection failure")

    monkeypatch.setattr(core.federation, "enrich_turn", failed_after_children)
    conversation, _ = await start_auxiliary(core)
    saved = await wait_finished(core, conversation["id"])
    turn = saved["turns"][0]
    assert turn["status"] == "PARTIAL" and turn["sources"] == [], (
        turn["warnings"],
        turn["resource_jobs"],
    )
    assert all(turn["resource_jobs"][lane]["record_count"] > 0 for lane in ("datasets", "repos"))
    assert all(
        turn["resource_jobs"][lane]["status"] == "SUCCEEDED" for lane in ("datasets", "repos")
    )


@pytest.mark.asyncio
async def test_plan_only_ai_is_ready_and_completes_with_one_available_credit(central_factory):
    core, _, model_calls, _ = await central_factory()
    for index in range(11):
        await core.generation.reserve_retrieval(
            f"authored-prior-reservation-{index}", provider_count=4
        )
    assert core.generation.economics.get_economics()["remaining"] == 1
    assert core.retrieval.readiness()["ready"] is True
    conversation, _ = await start_auxiliary(core, agentic=True)
    saved = await wait_finished(core, conversation["id"])
    turn = saved["turns"][0]
    assert turn["status"] == "SUCCEEDED"
    assert turn["retrieval"]["max_model_calls"] == 1
    assert turn["usage"]["model_http_attempts"] == len(model_calls) == 1
    entry = core.generation.ledger["entries"][f"{conversation['id']}:{turn['id']}:retrieval"]
    assert entry["provider_count"] == 0 and entry["max_http_attempts"] == 1
    economics = core.generation.economics.get_economics()
    assert (economics["used"], economics["reserved"], economics["remaining"]) == (1, 99, 0)


@pytest.mark.asyncio
async def test_manual_paper_limit_caps_progressive_canonical_results_across_providers(chat_core):
    def provider(request):
        name = PORT_PROVIDERS[request.url.port]
        if request.method == "GET":
            return httpx.Response(200, json=authored_health(name))
        return httpx.Response(200, stream=DelayedEvents(name, 0.02, doi=None))

    core, calls = chat_core(handler=provider)
    conversation = await core.conversations.create(
        ConversationRequest(routing="manual", providers=["crossref", "arxiv"])
    )
    accepted = await send(
        core,
        conversation,
        modality_limits={"papers": 1, "videos": 0, "datasets": 0, "repos": 0},
    )
    saved = await wait_finished(core, conversation["id"])
    turn = saved["turns"][0]
    assert turn["status"] == "SUCCEEDED" and turn["routing"] == "manual"
    assert len(turn["sources"]) == 2 and len(turn["papers"]) == 1
    assert len(turn["result_selection"]["overflow_paper_ids"]) == 1
    job = turn["resource_jobs"]["papers"]
    assert job["record_count"] == 1 and job["eligible_count"] == 2
    events = await core.conversations.store.replay(conversation["id"], accepted["cursor"])
    snapshots = [event["data"].get("snapshot") for event in events]
    progressive = [snapshot["turns"][0] for snapshot in snapshots if snapshot and snapshot["turns"]]
    assert progressive and all(len(item["papers"]) <= 1 for item in progressive)
    dispatched = [json.loads(request.content) for request in calls if request.method == "POST"]
    assert len(dispatched) == 2 and all(body["limits"]["total"] == 1 for body in dispatched)
    assert {body["provider"] for body in dispatched} == {"arxiv", "crossref"}


@pytest.mark.asyncio
async def test_off_lane_raw_observation_does_not_claim_visible_central_success(chat_core):
    def provider(request):
        if request.method == "GET":
            return httpx.Response(200, json=authored_health("openalex"))
        record = source(
            "openalex",
            "dataset-only",
            "fixture",
            title="[FICTIONAL] Evaluation dataset",
            resource_type="dataset",
            abstract="Authored dataset metadata for an isolated category test.",
            year=2024,
        )
        events = [
            {"kind": "usage", "attempts": 1},
            {"kind": "branch.started", "branch": "lexical"},
            {"kind": "source", "branch": "lexical", "rank": 1, "record": record},
            {"kind": "branch.completed", "branch": "lexical", "count": 1},
            {"kind": "branch.completed", "branch": "semantic", "count": 0},
            {"kind": "complete", "attempts": 1},
        ]
        return httpx.Response(200, text="\n".join(json.dumps(event) for event in events))

    core, _ = chat_core(handler=provider)
    conversation = await core.conversations.create(
        ConversationRequest(routing="manual", providers=["openalex"])
    )
    await send(
        core,
        conversation,
        modality_limits={"papers": 1, "videos": 0, "datasets": 0, "repos": 0},
    )
    saved = await wait_finished(core, conversation["id"])
    turn = saved["turns"][0]
    assert len(turn["sources"]) == 1 and turn["sources"][0]["resource_type"] == "dataset"
    assert turn["papers"] == []
    assert turn["resource_jobs"]["papers"]["record_count"] == 0
    assert turn["resource_jobs"]["papers"]["status"] == "EMPTY"
    assert turn["resource_jobs"]["datasets"]["status"] == "DISABLED"
    assert turn["status"] == "EMPTY"
