"""Project membership is durable local organization, never another retrieval call."""

import asyncio
import copy
from functools import partial

import httpx
import pytest
from fastapi.testclient import TestClient

from research_scout.api import create_app
from research_scout.contracts import ConversationRequest, ResearchRequest, now
from research_scout.core import Core, Settings
from research_scout.projects import ConceptCreate, ResearchProjects


@pytest.fixture
def projects_api(tmp_path):
    attempts = []

    async def offline(request):
        attempts.append(str(request.url))
        raise httpx.ConnectError("Project tests must not call a provider")

    provider = httpx.AsyncClient(transport=httpx.MockTransport(offline))
    config = Settings(state_dir=tmp_path)
    app = create_app(config, core_factory=lambda settings: Core(settings, client=provider))
    with TestClient(app) as client:
        yield client, app, attempts
    asyncio.run(provider.aclose())


def seed_run(client, app, provider="openalex", *, doi="10.1234/shared", count=1):
    core = app.state.core
    run = client.portal.call(
        partial(
            core.create,
            ResearchRequest(
                question="An authored context engineering question",
                provider=provider,
                idempotency_key=f"project-run-{provider}-{len(core.store.runs)}",
            ),
            launch=False,
        )
    )
    sources = [
        {
            "source_ref": f"{provider}:saved-{index}",
            "provider": provider,
            "record_id": f"saved-{index}",
            "version": "v1",
            "title": f"{provider} saved title {index}",
            "year": 2026,
            "doi": doi,
            "authors": ["Example Researcher"],
            "url": "https://example.org/saved-paper",
            "abstract": "An exact saved provider abstract.",
            "resource_type": "video" if provider == "youtube" else "article",
            "mode": "fixture",
            "observed_at": now(),
            "eligible": True,
        }
        for index in range(count)
    ]

    def update(document):
        document.update(status="SUCCEEDED", entities=sources)
        document["_observations"] = {f"{s['source_ref']}@v1": copy.deepcopy(s) for s in sources}

    client.portal.call(core.store.mutate, run["id"], update)
    return run["id"], sources


def seed_conversation(client, app, runs=(), *, messages=("First research question",)):
    manager = app.state.core.conversations
    conversation = client.portal.call(manager.create, ConversationRequest())
    turns = [
        {
            "id": f"turn-{index}",
            "message": message,
            "status": "SUCCEEDED",
            "action": "discover",
            "sources": [],
            "papers": [],
            "run_ids": list(runs),
            "warnings": [],
            "created_at": now(),
            "filters": {"year_from": 2020 + index},
            "providers": ["openalex"] if index == 0 else ["youtube"],
            "source_scope": ["openalex"] if index == 0 else ["youtube"],
            "routing": "auto" if index == 0 else "manual",
            "usage": {"research_attempts": 0, "model_http_attempts": 0, "model_cost_usd": 0},
        }
        for index, message in enumerate(messages)
    ]
    client.portal.call(
        manager.store.mutate, conversation["id"], lambda doc: doc.update(turns=turns)
    )
    return conversation["id"]


def new_project(client, name="Context engineering"):
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()


def test_create_projects_and_concepts_are_idempotent_bounded_and_local(projects_api):
    client, _, attempts = projects_api
    assert client.get("/api/projects").json() == {"projects": []}
    project = new_project(client, "  Context engineering  ")
    assert project["name"] == "Context engineering"
    assert new_project(client)["id"] == project["id"]
    path = f"/api/projects/{project['id']}"
    first = client.post(f"{path}/concepts", json={"name": "Retrieval quality"}).json()
    duplicate = client.post(f"{path}/concepts", json={"name": "retrieval quality"}).json()
    assert first == duplicate
    assert len(client.get("/api/projects").json()["projects"]) == 1
    assert client.post("/api/projects", json={"name": "   "}).status_code == 422
    assert client.post("/api/projects", json={"name": "x" * 121}).status_code == 422
    assert client.post("/api/projects", json={"name": "Hidden\ncontrols"}).status_code == 422
    assert (
        client.post(
            "/api/projects", json={"name": "Context engineering", "execute": True}
        ).status_code
        == 422
    )
    assert client.get("/api/projects/missing").status_code == 404
    assert attempts == []


def test_query_contexts_retain_exact_turns_filters_and_multiple_queries(projects_api):
    client, app, attempts = projects_api
    project = new_project(client)
    path = f"/api/projects/{project['id']}"
    concept = client.post(f"{path}/concepts", json={"name": "Context selection"}).json()[
        "concepts"
    ][0]
    conversation = seed_conversation(client, app, messages=("First question", "Follow-up question"))
    client.portal.call(
        app.state.core.conversations.store.mutate,
        conversation,
        lambda doc: doc.update(filters={"year_from": 2040}),
    )
    first = client.post(
        f"{path}/queries",
        json={"conversation_id": conversation, "turn_id": "turn-0", "concept_ids": [concept["id"]]},
    ).json()
    second = client.post(f"{path}/queries", json={"conversation_id": conversation}).json()
    assert [item["question"] for item in second["queries"]] == [
        "First question",
        "Follow-up question",
    ]
    assert second["queries"][0] == first["queries"][0]
    assert second["queries"][0]["filters"] == {"year_from": 2020}
    assert second["queries"][1]["filters"] == {"year_from": 2021}
    assert second["queries"][0]["providers"] == ["openalex"]
    assert second["queries"][0]["source_scope"] == ["openalex"]
    assert second["queries"][0]["routing"] == "auto"
    assert client.post(f"{path}/queries", json={"conversation_id": conversation}).json() == second
    assert (
        client.post(
            f"{path}/queries", json={"conversation_id": conversation, "concept_ids": ["foreign"]}
        ).status_code
        == 422
    )
    assert client.get(path).json() == second
    assert (
        client.post(
            f"{path}/queries", json={"conversation_id": conversation, "turn_id": "unknown"}
        ).status_code
        == 404
    )
    empty = seed_conversation(client, app, messages=())
    assert client.post(f"{path}/queries", json={"conversation_id": empty}).status_code == 409
    assert attempts == []


def test_run_query_and_request_errors_never_create_work(projects_api):
    client, app, attempts = projects_api
    run_id, _ = seed_run(client, app)
    path = f"/api/projects/{new_project(client)['id']}"
    saved = client.post(f"{path}/queries", json={"run_id": run_id}).json()
    assert saved["queries"][0]["run_id"] == run_id
    for body in [
        {},
        {"run_id": run_id, "conversation_id": "another"},
        {"run_id": run_id, "turn_id": "wrong"},
        {"run_id": "../../etc"},
    ]:
        assert client.post(f"{path}/queries", json=body).status_code == 422
    assert client.post(f"{path}/queries", json={"conversation_id": "unknown"}).status_code == 404
    assert client.get(path).json() == saved
    assert attempts == []


def test_papers_deduplicate_doi_with_immutable_provider_observations(projects_api):
    client, app, attempts = projects_api
    first_run, first_sources = seed_run(client, app, doi="https://doi.org/10.1234/SHARED")
    second_run, second_sources = seed_run(client, app, "crossref")
    path = f"/api/projects/{new_project(client)['id']}/resources"
    first = {"run_id": first_run, "source_ref": first_sources[0]["source_ref"], "version": "v1"}
    saved = client.post(path, json=first).json()
    assert client.post(path, json=first).json() == saved
    second = client.post(
        path, json={"run_id": second_run, "source_ref": second_sources[0]["source_ref"]}
    ).json()
    assert len(second["resources"]) == 1
    resource = second["resources"][0]
    assert resource["identity"] == "doi:10.1234/shared"
    assert resource["title"] == first_sources[0]["title"]
    assert [item["source"]["title"] for item in resource["observations"]] == [
        first_sources[0]["title"],
        second_sources[0]["title"],
    ]
    assert client.portal.call(app.state.core.get, first_run)["selections"] == {}
    assert attempts == []


def test_resource_version_is_exact_and_unknown_or_foreign_refs_cannot_be_saved(projects_api):
    client, app, attempts = projects_api
    run_id, sources = seed_run(client, app)
    source = sources[0]
    old = copy.deepcopy(source)

    def update(run):
        run["entities"][0] = {**source, "version": "v2", "abstract": "New provider details"}

    client.portal.call(app.state.core.store.mutate, run_id, update)
    project = new_project(client)
    path = f"/api/projects/{project['id']}"
    requested = {"run_id": run_id, "source_ref": source["source_ref"], "version": "v1"}
    saved = client.post(f"{path}/resources", json=requested).json()
    assert saved["resources"][0]["observations"][0]["source"] == old
    newer = client.post(f"{path}/resources", json={**requested, "version": "v2"}).json()
    assert len(newer["resources"]) == 1
    assert [item["version"] for item in newer["resources"][0]["observations"]] == ["v1", "v2"]
    assert newer["resources"][0]["observations"][0]["source"] == old
    for change, status in [
        ({"run_id": "unknown"}, 404),
        ({"source_ref": "openalex:unknown"}, 404),
        ({"version": "v99"}, 404),
        ({"version": True}, 422),
        ({"concept_ids": ["foreign"]}, 422),
    ]:
        assert client.post(f"{path}/resources", json={**requested, **change}).status_code == status
    foreign = seed_conversation(client, app)
    assert (
        client.post(f"{path}/resources", json={**requested, "conversation_id": foreign}).status_code
        == 422
    )
    assert client.get(path).json() == newer
    assert attempts == []


def test_project_resources_are_separate_from_three_source_run_shortlist(projects_api):
    client, app, attempts = projects_api
    run_id, sources = seed_run(client, app, "youtube", count=5)
    conversation = seed_conversation(client, app, [run_id])
    project = new_project(client)
    path = f"/api/projects/{project['id']}"
    for source in sources:
        result = client.post(
            f"{path}/resources",
            json={
                "run_id": run_id,
                "source_ref": source["source_ref"],
                "conversation_id": conversation,
            },
        )
        assert result.status_code == 200
    resources = result.json()["resources"]
    assert len(resources) == 5
    assert all(item["kind"] == "video" and item["doi"] is None for item in resources)
    assert client.portal.call(app.state.core.get, run_id)["selections"] == {}
    assert attempts == []


def test_project_store_ownership_restart_and_concurrent_updates(projects_api):
    client, app, attempts = projects_api
    project = new_project(client)
    store = app.state.projects
    with pytest.raises(RuntimeError, match="Another writer"):
        ResearchProjects(store.path, app.state.core)

    async def concurrent():
        await asyncio.gather(
            *(
                store.add_concept(project["id"], ConceptCreate(name=f"Concept {index}"))
                for index in range(12)
            )
        )

    client.portal.call(concurrent)
    before = client.get(f"/api/projects/{project['id']}").json()
    assert len(before["concepts"]) == 12
    store.close()
    app.state.projects = ResearchProjects(store.path, app.state.core)
    after = client.get(f"/api/projects/{project['id']}").json()
    assert after == before
    assert oct((store.path / f"{project['id']}.json").stat().st_mode & 0o777) == "0o600"
    assert not list(store.path.glob(".pending-*"))
    assert attempts == []
