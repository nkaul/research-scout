"""Dataset catalog doubles verify boundaries, not live suitability or dataset contents."""

import asyncio
import json

import httpx
import pytest
from plan_fixtures import saved_shared_plan

from research_scout.agents.datasets import run_dataset_specialist
from research_scout.contracts import ConversationRequest, now
from research_scout.core import ApplicationError, Core, Settings
from research_scout.dataset_contracts import DatasetCatalogRequest, DatasetSearchRequest
from research_scout.datasets import match_dataset, problem_context
from research_scout.providers.dataset_catalog import (
    datacite_dataset_record,
    fetch_catalog,
    fixture_catalog,
    hugging_face_record,
)
from research_scout.providers.dataset_service import create_dataset_provider_app
from research_scout.providers.service import create_provider_app


def saved_turn():
    return {
        "id": "dataset-context-turn",
        "message": "Find evaluation data for retrieval augmented generation",
        "action": "discover",
        "agentic": True,
        "status": "SUCCEEDED",
        "created_at": now(),
        "providers": ["openalex"],
        "run_ids": [],
        "sources": [],
        "warnings": [],
        "response": "",
        "usage": {"research_attempts": 0, "model_http_attempts": 1, "model_cost_usd": 0},
        "retrieval": saved_shared_plan({
            "status": "completed",
            "intent": "Evaluate retrieval for language model generation",
            "domain": "Machine learning",
            "keywords": ["retrieval", "question answering"],
            "tags": ["RAG"],
            "lexical_query": "retrieval language model evaluation",
            "semantic_query": "Datasets for evaluating retrieved evidence",
        }),
    }


async def seed_context(core):
    saved = await core.conversations.create(ConversationRequest(routing="auto"))
    turn = saved_turn()
    await core.conversations.store.mutate(saved["id"], lambda item: item["turns"].append(turn))
    return saved["id"], turn["id"]


def test_catalog_normalization_preserves_versions_access_and_registered_relationships():
    gated = hugging_face_record(
        {
            "id": "author/questions",
            "sha": "revision123",
            "cardData": {"license": "apache-2.0", "task_categories": ["question-answering"]},
            "gated": "manual",
            "private": False,
        }
    )
    assert gated["access"]["status"] == "gated"
    assert gated["version"] == "revision123"
    assert gated["license"] == "apache-2.0"
    assert gated["doi"] is None
    assert gated["year_basis"] is None
    dated = hugging_face_record(
        {"id": "author/older-data", "sha": "v1", "createdAt": "2011-05-20T00:00:00Z"}
    )
    assert dated["year"] == 2011
    assert dated["year_basis"] == "catalog_created"
    assert hugging_face_record({"id": "../private"}) is None
    row = {
        "id": "10.1234/data",
        "attributes": {
            "doi": "10.1234/data",
            "types": {"resourceTypeGeneral": "Dataset"},
            "titles": [{"title": "Sample data"}],
            "relatedIdentifiers": [
                {
                    "relatedIdentifier": "10.1234/paper",
                    "relatedIdentifierType": "DOI",
                    "relationType": "IsSupplementTo",
                }
            ],
        },
    }
    dataset = datacite_dataset_record(row)
    assert dataset["relationships"][0]["source"] == "registered"
    assert dataset["relationships"][0]["type"] == "IsSupplementTo"
    assert dataset["access"]["status"] == "unknown"
    assert dataset["year_basis"] is None
    row["attributes"]["publicationYear"] = 2014
    assert datacite_dataset_record(row)["year_basis"] == "publication"
    row["attributes"]["types"]["resourceTypeGeneral"] = "Text"
    assert datacite_dataset_record(row) is None


@pytest.mark.asyncio
async def test_public_requests_use_dataset_filter_and_bounded_metadata_not_file_downloads():
    calls = []

    async def upstream(request):
        calls.append(request)
        if request.url.host == "api.datacite.org":
            assert "types.resourceTypeGeneral:Dataset" in request.url.params["query"]
            assert "publicationYear:[2021 TO 2026]" in request.url.params["query"]
            return httpx.Response(200, json={"data": []})
        assert request.url.path == "/api/datasets"
        assert request.url.params["search"] == "retrieval"
        assert "cardData" in request.url.params.get_list("expand")
        assert "full" not in request.url.params
        return httpx.Response(200, json=[])

    request = DatasetCatalogRequest(
        run_id="r",
        operation_id="r:dataset",
        query="retrieval OR *:*",
        limit=5,
        year_from=2021,
        year_to=2026,
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        await fetch_catalog("datacite", request, client)
        await fetch_catalog("hugging_face", request, client)
    assert len(calls) == 2
    assert all(request.method == "GET" for request in calls)


@pytest.mark.asyncio
async def test_provider_receipt_replay_makes_one_catalog_call_and_conflicting_scope_rejected(
    tmp_path,
):
    calls = []

    async def upstream(request):
        calls.append(request)
        return httpx.Response(
            200, json=[{"id": "example/retrieval", "sha": "v1", "gated": False, "private": False}]
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as upstream_client:
        app = create_dataset_provider_app("live", state_dir=tmp_path, http_client=upstream_client)
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://testserver"
            ) as client,
        ):
            body = {"run_id": "r", "operation_id": "op:1", "query": "retrieval", "limit": 3}
            first = await client.post("/operations/datasets", json=body)
            second = await client.post("/operations/datasets", json=body)
            assert first.status_code == second.status_code == 200
            assert first.json() == second.json()
            assert first.json()["records"][0]["provider"] == "hugging_face"
            assert len(calls) == 1
            conflict = await client.post(
                "/operations/datasets", json={**body, "query": "other scope"}
            )
            assert conflict.status_code == 409
            assert len(calls) == 1
            generic = await client.post(
                "/operations/datasets",
                json={
                    **body,
                    "operation_id": "op:generic",
                    "query": "model performance research quality",
                },
            )
            assert generic.json()["status"] == "failed"
            assert generic.json()["error"]["code"] == "INSUFFICIENT_QUERY"
            assert generic.json()["attempts"] == 0
            assert len(calls) == 1


@pytest.mark.asyncio
async def test_datacite_existing_registry_service_exposes_separate_dataset_operation(tmp_path):
    app = create_provider_app("datacite", "fixture", state_dir=tmp_path)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client,
    ):
        assert (await client.get("/health")).json()["capabilities"]["datasets"]
        result = await client.post(
            "/operations/datasets",
            json={"run_id": "data", "operation_id": "data:one", "query": "retrieval"},
        )
        assert result.status_code == 200
        assert all(row["resource_type"] == "dataset" for row in result.json()["records"])
        assert len(result.json()["records"]) == 3


def test_context_rejects_unplanned_or_direct_search_and_match_stays_metadata_only():
    turn = saved_turn()
    context = problem_context({"id": "c", "filters": {}}, turn)
    row = fixture_catalog(
        "hugging_face", DatasetCatalogRequest(run_id="r", operation_id="r:q", query="retrieval")
    )["records"][0]
    matched = match_dataset(row, context)
    assert matched["status"] == "candidate"
    assert matched["model_reviewed"] is False
    assert any("not been profiled" in item for item in matched["missing_constraints"])
    turn["agentic"] = False
    with pytest.raises(ValueError, match="AI-refined"):
        problem_context({"id": "c"}, turn)
    turn["agentic"] = True
    turn["retrieval"]["status"] = "planning"
    with pytest.raises(ValueError, match="AI-refined"):
        problem_context({"id": "c"}, turn)


@pytest.mark.asyncio
async def test_actual_deepagents_dataset_specialist_invokes_only_bound_catalog_once():
    calls = []

    async def catalog():
        calls.append("hugging_face")
        return {"provider": "hugging_face", "status": "succeeded", "record_count": 3}

    context = problem_context({"id": "c", "filters": {}}, saved_turn())
    await run_dataset_specialist(
        context,
        "hugging_face",
        mcp_url="http://127.0.0.1:8100/mcp/",
        search_id="test",
        callback=catalog,
    )
    assert calls == ["hugging_face"]


@pytest.mark.asyncio
async def test_progressive_independent_catalogs_idempotency_saved_reads_and_cancel(tmp_path):
    gate = asyncio.Event()
    dispatched = []

    async def upstream(request):
        provider = "hugging_face" if request.url.port == 8120 else "datacite"
        dispatched.append(provider)
        if provider == "datacite":
            await gate.wait()
        body = DatasetCatalogRequest.model_validate(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "provider": provider,
                "mode": "fixture",
                "status": "succeeded",
                "attempts": 1,
                **fixture_catalog(provider, body),
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    core = Core(Settings(state_dir=tmp_path), client=client)

    async def specialist(context, provider, **scope):
        await core.datasets.search_provider(scope["search_id"], provider)

    core.datasets.specialist_runner = specialist
    try:
        conversation_id, turn_id = await seed_context(core)
        request = DatasetSearchRequest(
            conversation_id=conversation_id, turn_id=turn_id, idempotency_key="datasets-one"
        )
        saved = await core.datasets.create(request)
        for _ in range(100):
            current = await core.datasets.get(saved["id"])
            if current["records"]:
                break
            await asyncio.sleep(0.01)
        assert current["status"] == "RUNNING"
        assert len(current["records"]) == 3
        assert current["provider_activity"][1]["status"] == "running"
        assert current["revision"] > saved["revision"]
        replay = await core.datasets.create(request)
        assert replay["id"] == saved["id"]
        assert sorted(dispatched) == ["datacite", "hugging_face"]
        assert len(await core.datasets.list(conversation_id, turn_id)) == 1
        assert await core.datasets.list("wrong", turn_id) == []
        cancelled = await core.datasets.cancel(saved["id"])
        assert cancelled["status"] == "CANCELLED"
        gate.set()
        await asyncio.sleep(0.01)
        after = await core.datasets.get(saved["id"])
        assert len(after["records"]) == 3
        assert after["usage"]["model_http_attempts"] == 0
        assert len(dispatched) == 2
        with pytest.raises(ApplicationError, match="different"):
            await core.datasets.create(request.model_copy(update={"limit": 5}))
    finally:
        await core.close()
        await client.aclose()


@pytest.mark.asyncio
async def test_partial_catalog_failure_does_not_drop_other_provider_or_change_research(tmp_path):
    async def upstream(request):
        provider = "hugging_face" if request.url.port == 8120 else "datacite"
        body = DatasetCatalogRequest.model_validate(json.loads(request.content))
        if provider == "datacite":
            return httpx.Response(429)
        return httpx.Response(
            200,
            json={
                "provider": provider,
                "mode": "fixture",
                "status": "succeeded",
                "attempts": 1,
                **fixture_catalog(provider, body),
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    core = Core(Settings(state_dir=tmp_path), client=client)

    async def specialist(context, provider, **scope):
        await core.datasets.search_provider(scope["search_id"], provider)

    core.datasets.specialist_runner = specialist
    try:
        cid, tid = await seed_context(core)
        before = await core.conversations.get(cid, private=True)
        created = await core.datasets.create(
            DatasetSearchRequest(conversation_id=cid, turn_id=tid, idempotency_key="partial")
        )
        await core.datasets.tasks[created["id"]]
        saved = await core.datasets.get(created["id"])
        assert saved["status"] == "PARTIAL"
        assert len(saved["records"]) == 3
        assert any(row["status"] == "failed" for row in saved["provider_activity"])
        assert before == await core.conversations.get(cid, private=True)
    finally:
        await core.close()
        await client.aclose()


def test_matching_does_not_promote_generic_context_or_substring_rag_hits():
    context = problem_context({"id": "c"}, saved_turn())
    context["keywords"] = ["context", "model", "RAG"]
    context["tags"] = []
    unrelated = {
        "title": "Fragile pharmacy context models",
        "description": "COVID biologics",
        "tags": [],
        "tasks": [],
    }
    assert match_dataset(unrelated, context)["status"] == "unknown"
    context["keywords"] = ["language models"]
    related = {
        "title": "Language-model evaluation data",
        "description": "",
        "tags": [],
        "tasks": [],
    }
    assert match_dataset(related, context)["status"] == "candidate"
    context["keywords"] = ["model performance", "research quality"]
    misleading = {
        "title": "Pharmacy COVID biologics model performance and research quality",
        "description": "Clinical observations only",
        "tags": [],
        "tasks": [],
    }
    assert match_dataset(misleading, context)["status"] == "unknown"


def test_context_uses_the_selected_turn_filters_not_later_conversation_preferences():
    turn = saved_turn()
    turn["filters"] = {"year_from": 2018, "year_to": 2020}
    context = problem_context({"id": "c", "filters": {"year_from": 2025, "year_to": 2026}}, turn)
    assert context["filters"] == turn["filters"]
    assert context["literature_filters"] == turn["filters"]
    turn["action"] = "lookup"
    with pytest.raises(ValueError):
        problem_context({"id": "c"}, turn)
    turn["action"] = "discover"
    turn["retrieval"].pop("intent")
    with pytest.raises(ValueError):
        problem_context({"id": "c"}, turn)


@pytest.mark.asyncio
async def test_api_rejects_raw_question_and_saved_reads_never_admit_a_search(tmp_path):
    from research_scout.api import create_app

    calls = []

    async def no_provider(request):
        calls.append(str(request.url))
        raise httpx.ConnectError("No provider access admitted")

    client = httpx.AsyncClient(transport=httpx.MockTransport(no_provider))
    app = create_app(
        Settings(state_dir=tmp_path), core_factory=lambda settings: Core(settings, client=client)
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as api,
    ):
        assert (await api.get("/api/dataset-searches")).json() == {"searches": []}
        result = await api.post(
            "/api/dataset-searches", json={"question": "Raw query", "idempotency_key": "raw"}
        )
        assert result.status_code == 422
        cid, tid = await seed_context(app.state.core)
        # A non-agentic turn cannot masquerade as a dataset intent.
        await app.state.core.conversations.store.mutate(
            cid, lambda item: item["turns"][0].update(agentic=False)
        )
        result = await api.post(
            "/api/dataset-searches",
            json={"conversation_id": cid, "turn_id": tid, "idempotency_key": "raw"},
        )
        assert result.status_code == 409
        assert (await api.get("/api/dataset-searches", params={"conversation_id": cid})).json() == {
            "searches": []
        }
        assert calls == []
    await client.aclose()


@pytest.mark.asyncio
async def test_real_dataset_graph_application_mcp_and_catalog_receipts(tmp_path):
    import socket

    import uvicorn

    from research_scout.api import create_app

    calls = []

    async def catalog(request):
        provider = "hugging_face" if request.url.port == 8120 else "datacite"
        calls.append(provider)
        body = DatasetCatalogRequest.model_validate(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "provider": provider,
                "mode": "fixture",
                "status": "succeeded",
                "attempts": 1,
                **fixture_catalog(provider, body),
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(catalog))
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    settings = Settings(state_dir=tmp_path, core_url=f"http://127.0.0.1:{port}")
    app = create_app(settings, core_factory=lambda config: Core(config, client=client))
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    task = asyncio.create_task(server.serve())
    try:
        for _ in range(200):
            if server.started:
                break
            if task.done():
                task.result()
            await asyncio.sleep(0.01)
        assert server.started
        cid, tid = await seed_context(app.state.core)
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", trust_env=False) as api:
            result = await api.post(
                "/api/dataset-searches",
                json={"conversation_id": cid, "turn_id": tid, "idempotency_key": "real-mcp"},
            )
            assert result.status_code == 202
            search_id = result.json()["id"]
            await app.state.core.datasets.tasks[search_id]
            saved = (await api.get(f"/api/dataset-searches/{search_id}")).json()
            assert saved["status"] == "SUCCEEDED"
            assert len(saved["records"]) == 6
            assert saved["usage"]["model_http_attempts"] == 0
            assert sorted(calls) == ["datacite", "hugging_face"]
            # Explicit idempotent retry and reads must preserve original network attempts.
            replay = await api.post(
                "/api/dataset-searches",
                json={"conversation_id": cid, "turn_id": tid, "idempotency_key": "real-mcp"},
            )
            assert replay.json()["id"] == search_id
            assert len(calls) == 2
            assert saved["context"]["origin"] == "saved_agentic_retrieval_plan"
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, timeout=5)
        await client.aclose()


@pytest.mark.asyncio
async def test_dataset_retry_is_pinned_before_parent_refinement_or_failure(tmp_path):
    gate = asyncio.Event()
    core = Core(Settings(state_dir=tmp_path))

    async def no_dispatch(context, provider, **scope):
        await gate.wait()

    core.datasets.specialist_runner = no_dispatch
    try:
        cid, tid = await seed_context(core)
        request = DatasetSearchRequest(
            conversation_id=cid, turn_id=tid, idempotency_key="pinned-context"
        )
        initial = await core.datasets.create(request)
        original = initial["context"]["fingerprint"]

        def mutate_parent(item):
            item["turns"][0]["retrieval"].update(
                lexical_query="A later refined provider query", status="failed"
            )

        await core.conversations.store.mutate(cid, mutate_parent)
        replay = await core.datasets.create(request)
        assert replay["id"] == initial["id"]
        assert replay["context"]["fingerprint"] == original
        assert replay["context"]["query"] == initial["context"]["query"]
        assert replay["usage"]["catalog_attempts"] == 0
        with pytest.raises(ApplicationError, match="different"):
            await core.datasets.create(request.model_copy(update={"providers": ["datacite"]}))
        with pytest.raises(ApplicationError, match="AI-refined"):
            await core.datasets.create(
                request.model_copy(update={"idempotency_key": "new-context"})
            )
    finally:
        await core.close()


@pytest.mark.asyncio
async def test_dataset_catalogs_do_not_inherit_recent_literature_filters(tmp_path):
    calls = []

    async def upstream(request):
        body = DatasetCatalogRequest.model_validate(json.loads(request.content))
        calls.append(body)
        assert body.year_from is None and body.year_to is None
        provider = "hugging_face" if request.url.port == 8120 else "datacite"
        payload = fixture_catalog(provider, body)
        # A useful catalog dataset can be older than the paper search window.
        for row in payload["records"]:
            row["year"] = 2010
            row["year_basis"] = "catalog_created" if provider == "hugging_face" else "publication"
        return httpx.Response(
            200,
            json={
                "provider": provider,
                "mode": "fixture",
                "status": "succeeded",
                "attempts": 1,
                **payload,
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    core = Core(Settings(state_dir=tmp_path), client=client)

    async def specialist(context, provider, **scope):
        await core.datasets.search_provider(scope["search_id"], provider)

    core.datasets.specialist_runner = specialist
    try:
        cid, tid = await seed_context(core)
        await core.conversations.store.mutate(
            cid, lambda item: item["turns"][0].update(filters={"year_from": 2025, "year_to": 2026})
        )
        created = await core.datasets.create(
            DatasetSearchRequest(
                conversation_id=cid, turn_id=tid, idempotency_key="literature-window"
            )
        )
        await core.datasets.tasks[created["id"]]
        saved = await core.datasets.get(created["id"])
        assert saved["status"] == "SUCCEEDED"
        assert len(calls) == 2
        assert len(saved["records"]) == 6
        assert all(row["year"] == 2010 for row in saved["records"])
        assert saved["context"]["literature_filters"] == {"year_from": 2025, "year_to": 2026}
        assert all(row["match"]["missing_constraints"] for row in saved["records"])
    finally:
        await core.close()
        await client.aclose()


def test_registered_resource_dates_do_not_imply_observation_coverage():
    from research_scout.dataset_contracts import DatasetRecord

    row = {
        "id": "10.1234/resource-dates",
        "attributes": {
            "doi": "10.1234/resource-dates",
            "types": {"resourceTypeGeneral": "Dataset"},
            "titles": [{"title": "A versioned dataset record"}],
            "publicationYear": 2020,
            "dates": [
                {
                    "date": "2026-11-14",
                    "dateType": "Updated",
                    "dateInformation": "Metadata correction",
                },
                {"date": "2020-02-01", "dateType": "Created"},
            ],
        },
    }
    record = DatasetRecord.model_validate(datacite_dataset_record(row))
    assert record.resource_dates == [
        {"date": "2026-11-14", "dateType": "Updated", "dateInformation": "Metadata correction"},
        {"date": "2020-02-01", "dateType": "Created"},
    ]
    assert record.coverage_dates == []
    assert record.year == 2020 and record.year_basis == "publication"
    assert any(
        "time/geographic suitability" in value
        for value in match_dataset(record.model_dump(), problem_context({"id": "c"}, saved_turn()))[
            "missing_constraints"
        ]
    )


def test_datacite_query_keeps_meaningful_phrases_without_boolean_text_or_broad_or():
    from research_scout.providers.dataset_catalog import catalog_query
    from research_scout.providers.journal import ProviderError

    request = DatasetCatalogRequest(
        run_id="r", operation_id="r:phrases", query='"context engineering" AND "language models"'
    )
    shaped, params = catalog_query("datacite", request)
    assert (
        shaped
        == 'types.resourceTypeGeneral:Dataset AND ("context engineering" AND "language models")'
    )
    assert '"and"' not in shaped and " OR " not in shaped
    assert dict(params)["query"] == shaped
    assert dict(params)["page[size]"] == "10"
    with pytest.raises(ProviderError, match="informative"):
        catalog_query(
            "datacite",
            request.model_copy(
                update={"query": "model performance research quality", "keywords": []}
            ),
        )


def test_hf_mirror_owner_is_not_invented_as_original_creator_or_publisher():
    row = {
        "id": "mirror/account-data",
        "author": "mirror-account",
        "sha": "revision",
        "description": "A public mirror of an external dataset",
        "gated": False,
        "private": False,
        "cardData": {"license": "cc-by-4.0"},
    }
    record = hugging_face_record(row)
    assert record["catalog_owner"] == "mirror-account"
    assert record["publisher"] is None
    assert record["authors"] == []
    row["cardData"]["creators"] = ["Explicitly reported original curator"]
    assert hugging_face_record(row)["authors"] == ["Explicitly reported original curator"]
