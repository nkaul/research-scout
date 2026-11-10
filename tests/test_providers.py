import asyncio
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
import pytest

from research_scout.providers import create_provider_app
from research_scout.providers.fixtures import FIXTURE_DOIS
from research_scout.providers.normalization import openalex_record


def search_body(**changes):
    return {
        "operation_id": "search-1",
        "run_id": "run-1",
        "provider": "openalex",
        "query": "institutional AI readiness",
        "filters": {},
        "limits": {"per_branch": 10, "total": 20, "remaining_attempts": 8},
        **changes,
    }


async def request(app, path, body):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://provider"
    ) as client:
        return await client.post(path, json=body)


def events(response):
    assert response.status_code == 200, response.text
    return [json.loads(line) for line in response.text.splitlines() if line]


@pytest.mark.asyncio
async def test_fixture_hybrid_overlap_missingness_filter_and_replay(tmp_path):
    app = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
    stream = events(await request(app, "/operations/search", search_body()))
    sources = [event for event in stream if event["kind"] == "source"]
    assert len({s["record"]["source_ref"] for s in sources}) == 6
    assert any(
        s["record"]["record_id"] == "fixture-005" and s["branch"] == "semantic" for s in sources
    )
    assert {s["branch"] for s in sources if s["record"]["record_id"] == "fixture-002"} == {
        "lexical",
        "semantic",
    }
    incomplete = next(s["record"] for s in sources if s["record"]["record_id"] == "fixture-003")
    assert incomplete["authors"] == [] and incomplete["year"] is None
    assert all(s["record"]["mode"] == "fixture" and s["record"]["fictional"] for s in sources)
    assert stream[-1]["attempts"] == 2
    reloaded = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
    replay = events(await request(reloaded, "/operations/search", search_body()))
    assert all(event["replayed"] for event in replay)
    assert replay[-1]["attempts"] == 2
    filtered = events(
        await request(
            reloaded,
            "/operations/search",
            search_body(
                operation_id="filtered", filters={"year_from": 2020, "resource_type": "article"}
            ),
        )
    )
    assert all(event["record"]["year"] >= 2020 for event in filtered if event["kind"] == "source")
    assert all(
        event["record"]["record_id"] not in {"fixture-003", "fixture-004"}
        for event in filtered
        if event["kind"] == "source"
    )


@pytest.mark.asyncio
async def test_first_source_published_before_delayed_semantic(tmp_path):
    app = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0.65)
    first_source = asyncio.Event()
    observed, start = [], time.monotonic()
    payload = json.dumps(search_body()).encode()
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": payload, "more_body": False}
        await asyncio.Future()

    async def send(message):
        if message["type"] == "http.response.body":
            for line in message.get("body", b"").splitlines():
                event = json.loads(line)
                observed.append(event)
                if event["kind"] == "source":
                    first_source.set()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1",
        "method": "POST",
        "path": "/operations/search",
        "raw_path": b"/operations/search",
        "query_string": b"",
        "root_path": "",
        "scheme": "http",
        "headers": [(b"content-type", b"application/json")],
        "server": ("127.0.0.1", 8111),
        "client": ("127.0.0.1", 12345),
    }
    task = asyncio.create_task(app(scope, receive, send))
    await asyncio.wait_for(first_source.wait(), 0.3)
    assert time.monotonic() - start < 0.3
    assert not task.done()
    assert not any(e["kind"] == "branch.completed" and e["branch"] == "semantic" for e in observed)
    await task


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "query,status", [("empty", "empty"), ("fail-semantic", "partial"), ("fail-provider", "failed")]
)
async def test_controlled_fixture_outcomes(tmp_path, query, status):
    app = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
    stream = events(await request(app, "/operations/search", search_body(query=query)))
    assert stream[-1]["status"] == status
    assert all(e["provider"] == "openalex" for e in stream)


@pytest.mark.asyncio
async def test_provider_and_operation_scope_conflicts(tmp_path):
    app = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
    assert (
        await request(app, "/operations/search", search_body(provider="semantic_scholar"))
    ).status_code == 400
    await request(app, "/operations/search", search_body())
    conflict = await request(app, "/operations/search", search_body(query="different"))
    assert conflict.status_code == 409
    assert conflict.json()["error"] == "OPERATION_CONFLICT"
    assert (
        await request(
            app,
            "/operations/metadata",
            {"operation_id": "m", "run_id": "r", "doi": FIXTURE_DOIS["crossref"]},
        )
    ).status_code == 400


@pytest.mark.asyncio
async def test_operation_grant_and_run_ceiling_survive_restart(tmp_path):
    app = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
    one = search_body(limits={"per_branch": 10, "total": 20, "remaining_attempts": 1})
    stream = events(await request(app, "/operations/search", one))
    assert stream[-1]["attempts"] == 1
    assert stream[-1]["status"] == "partial"
    for index in range(4):
        app = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
        stream = events(
            await request(app, "/operations/search", search_body(operation_id=f"extra-{index}"))
        )
    assert stream[-1]["attempts"] == 1
    exhausted = events(
        await request(app, "/operations/search", search_body(operation_id="exhausted"))
    )
    assert exhausted[-1]["attempts"] == 0 and exhausted[-1]["status"] == "failed"


@pytest.mark.asyncio
async def test_interrupted_operation_is_not_redispatched(tmp_path):
    app = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
    value = search_body()
    value.update(provider="openalex", mode="fixture")
    # Use request normalization so fingerprint is identical to the HTTP operation.
    from research_scout.providers.service import Search

    value = Search(**search_body()).model_dump()
    value.update(provider="openalex", mode="fixture")
    await app.state.journal.begin(value, "search")
    response = await request(
        create_provider_app("openalex", state_dir=tmp_path), "/operations/search", search_body()
    )
    assert response.status_code == 409 and response.json()["error"] == "OPERATION_UNCERTAIN"


@pytest.mark.asyncio
async def test_separate_registry_observations_and_cached_zero_grant(tmp_path):
    crossref = create_provider_app("crossref", state_dir=tmp_path)
    datacite = create_provider_app("datacite", state_dir=tmp_path)
    body = {
        "operation_id": "agency",
        "run_id": "r",
        "doi": FIXTURE_DOIS["datacite"],
        "remaining_attempts": 1,
    }
    assert (await request(crossref, "/operations/agency", body)).json()["agency"] == "datacite"
    dc = await request(datacite, "/operations/metadata", {**body, "operation_id": "dc"})
    assert dc.json()["record"]["provider"] == "datacite"
    assert dc.json()["record"]["resource_type"] == "Dataset"
    cached = await request(
        datacite,
        "/operations/metadata",
        {**body, "operation_id": "dc-cache", "remaining_attempts": 0},
    )
    assert cached.json()["cached"] and cached.json()["attempts"] == 0
    miss = await request(
        crossref, "/operations/metadata", {**body, "operation_id": "crossref-miss"}
    )
    assert miss.status_code == 404  # No implicit DataCite dispatch.


@pytest.mark.asyncio
async def test_live_registry_routes_use_only_selected_fake_upstream(tmp_path):
    called = []

    def upstream(request):
        called.append(str(request.url))
        if request.url.host == "api.crossref.org":
            if request.url.path.endswith("/agency"):
                return httpx.Response(200, json={"message": {"agency": {"id": "datacite"}}})
            return httpx.Response(
                200,
                json={
                    "message": {
                        "DOI": "10.1234/example",
                        "title": ["Registry supplied title"],
                        "author": [{"given": "A", "family": "B"}],
                        "published": {"date-parts": [[2024]]},
                    }
                },
            )
        return httpx.Response(
            200,
            json={
                "data": {
                    "id": "10.1234/example",
                    "attributes": {
                        "doi": "10.1234/example",
                        "titles": [{"title": "Independent DataCite title"}],
                        "publicationYear": 2023,
                        "creators": [{"name": "C"}],
                        "types": {"resourceTypeGeneral": "Dataset"},
                    },
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        cr = create_provider_app("crossref", "live", state_dir=tmp_path, http_client=client)
        dc = create_provider_app("datacite", "live", state_dir=tmp_path, http_client=client)
        body = {
            "operation_id": "agency",
            "run_id": "r",
            "doi": "https://doi.org/10.1234/EXAMPLE",
            "remaining_attempts": 1,
        }
        assert (await request(cr, "/operations/agency", body)).json()["agency"] == "datacite"
        cr_record = (
            await request(cr, "/operations/metadata", {**body, "operation_id": "cr"})
        ).json()["record"]
        dc_record = (
            await request(dc, "/operations/metadata", {**body, "operation_id": "dc"})
        ).json()["record"]
        assert cr_record["title"] != dc_record["title"]
        assert [httpx.URL(url).host for url in called] == [
            "api.crossref.org",
            "api.crossref.org",
            "api.datacite.org",
        ]
        assert len(called) == 3


@pytest.mark.asyncio
async def test_live_semantic_scholar_never_fakes_semantic_or_switches_provider(tmp_path):
    called = []

    def upstream(request):
        called.append(request)
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "paperId": "p1",
                        "title": "Metadata title",
                        "authors": [],
                        "year": 2024,
                        "externalIds": {},
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        app = create_provider_app(
            "semantic_scholar", "live", state_dir=tmp_path, http_client=client
        )
        stream = events(
            await request(app, "/operations/search", search_body(provider="semantic_scholar"))
        )
        assert stream[-1]["status"] == "partial" and stream[-1]["attempts"] == 1
        assert any(e.get("error") == "SEMANTIC_UNAVAILABLE" for e in stream)
        assert len(called) == 1 and called[0].url.host == "api.semanticscholar.org"


@pytest.mark.asyncio
async def test_native_mcp_schema_checked_and_two_bounded_tools(tmp_path):
    calls = []
    properties = {
        name: {} for name in ("query", "limit", "rerank", "from_year", "to_year", "types")
    }
    properties["mode"] = {"enum": ["keyword", "semantic"]}

    class Session:
        async def list_tools(self):
            return SimpleNamespace(
                tools=[SimpleNamespace(name="search_works", inputSchema={"properties": properties})]
            )

        async def call_tool(self, name, arguments):
            calls.append((name, arguments))
            return SimpleNamespace(
                isError=False,
                structuredContent={
                    "results": [
                        {
                            "id": "W1",
                            "title": "Original provider title",
                            "year": 2024,
                            "authors": ["A", "+12 more"],
                            "type": "article",
                        },
                        {"title": "Missing identity"},
                    ],
                    "canonical_oql": "recorded oql",
                },
                content=[],
            )

    @asynccontextmanager
    async def factory():
        yield Session()

    app = create_provider_app("openalex", "live", state_dir=tmp_path, mcp_factory=factory)
    stream = events(
        await request(app, "/operations/search", search_body(filters={"year_from": 2020}))
    )
    assert len(calls) == 2
    assert {args["mode"] for _, args in calls} == {"keyword", "semantic"}
    assert all(
        args["rerank"] is False and args["limit"] == 10 and args["from_year"] == 2020
        for _, args in calls
    )
    assert stream[-1]["attempts"] == 2 and stream[-1]["status"] == "partial"
    row = next(e["record"] for e in stream if e["kind"] == "source")
    assert row["authors"] == ["A"] and "authors" in row["truncated_fields"]
    assert row["query_provenance"]["canonical_oql"] == "recorded oql"


@pytest.mark.asyncio
async def test_missing_mcp_schema_does_not_call_research_tool(tmp_path):
    @asynccontextmanager
    async def factory():
        class Session:
            async def list_tools(self):
                return SimpleNamespace(tools=[])

            async def call_tool(self, *_):
                pytest.fail("Unadvertised tool must not be called")

        yield Session()

    app = create_provider_app("openalex", "live", state_dir=tmp_path, mcp_factory=factory)
    stream = events(await request(app, "/operations/search", search_body()))
    assert stream[-1]["attempts"] == 0 and stream[-1]["status"] == "failed"


def test_provider_missing_metadata_does_not_create_values():
    row = openalex_record(
        {"id": "W2", "title": None, "authors": [], "primary_location": {"source": None}}
    )
    assert row["title"] is None and row["year"] is None and row["doi"] is None
    assert "title" in row["missing_fields"]


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_vectors", [False, True])
async def test_configured_local_encoder_requires_compatible_vectors(tmp_path, bad_vectors):
    class TestOnlyEncoder:
        def __init__(self):
            self.configuration = {
                "model": "test-only-fixed-vectors",
                "revision": "fixture-1",
                "dimensions": 2,
                "query_mode": "query",
                "document_mode": "document",
                "similarity": "cosine",
            }

        def encode_query(self, text):
            return [1.0, 0.0]

        def encode_documents(self, texts):
            return [[0.0] if bad_vectors else [0.0, 1.0] for _ in texts]

    def upstream(_request):
        return httpx.Response(
            200,
            json={
                "data": [
                    {"paperId": f"p{i}", "title": f"Test record {i}", "year": 2024}
                    for i in range(20)
                ]
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    app = create_provider_app(
        "semantic_scholar",
        "live",
        state_dir=tmp_path,
        http_client=client,
        encoder=TestOnlyEncoder(),
    )
    stream = events(
        await request(app, "/operations/search", search_body(provider="semantic_scholar"))
    )
    assert stream[-1]["attempts"] == 1
    assert stream[-1]["status"] == ("partial" if bad_vectors else "succeeded")
    if bad_vectors:
        assert any(e.get("error") == "ENCODER_INVALID" for e in stream)
    else:
        semantic = next(
            e for e in stream if e["kind"] == "branch.completed" and e["branch"] == "semantic"
        )
        assert semantic["provenance"]["embedding_texts"] == 21
        assert semantic["provenance"]["scope"] == "fetched_lexical_pool_only"
        assert stream[-1]["count"] == 20
        usage = next(e for e in stream if e["kind"] == "usage")
        assert usage["embedding_batches"] == 2 and usage["embedding_texts"] == 21
        await request(
            app,
            "/operations/search",
            search_body(provider="semantic_scholar", operation_id="second-pool"),
        )
        reloaded = create_provider_app(
            "semantic_scholar",
            "live",
            state_dir=tmp_path,
            http_client=client,
            encoder=TestOnlyEncoder(),
        )
        limited = events(
            await request(
                reloaded,
                "/operations/search",
                search_body(provider="semantic_scholar", operation_id="third-pool"),
            )
        )
        assert limited[-1]["status"] == "partial"
        assert any(e.get("error") == "EMBEDDING_LIMIT" for e in limited)
    await client.aclose()


@pytest.mark.asyncio
async def test_native_raw_limits_do_not_overfetch_or_discard_semantic_capacity(tmp_path):
    properties = {name: {} for name in ("query", "limit", "rerank")}
    properties["mode"] = {"enum": ["keyword", "semantic"]}

    class Session:
        async def list_tools(self):
            return SimpleNamespace(
                tools=[SimpleNamespace(name="search_works", inputSchema={"properties": properties})]
            )

        async def call_tool(self, _, arguments):
            base = 100 if arguments["mode"] == "keyword" else 200
            return SimpleNamespace(
                isError=False,
                structuredContent={
                    "results": [
                        {"id": f"W{base + i}", "title": "Test metadata", "year": 2024}
                        for i in range(15)
                    ]
                },
                content=[],
            )

    @asynccontextmanager
    async def factory():
        yield Session()

    app = create_provider_app("openalex", "live", state_dir=tmp_path, mcp_factory=factory)
    stream = events(await request(app, "/operations/search", search_body()))
    assert stream[-1]["count"] == 20
    counts = [e["raw_count"] for e in stream if e["kind"] == "branch.completed"]
    assert counts == [10, 10]


@pytest.mark.asyncio
async def test_zero_grant_never_constructs_upstream_session(tmp_path):
    @asynccontextmanager
    async def forbidden_session():
        pytest.fail("Zero-grant work must not construct a provider connection")
        yield

    app = create_provider_app("openalex", "live", state_dir=tmp_path, mcp_factory=forbidden_session)
    body = search_body(limits={"per_branch": 10, "total": 20, "remaining_attempts": 0})
    stream = events(await request(app, "/operations/search", body))
    assert stream[-1]["attempts"] == 0
    detail = await request(
        app,
        "/operations/details",
        {"operation_id": "detail", "run_id": "run-1", "record_id": "W1", "remaining_attempts": 0},
    )
    assert detail.status_code == 429 and detail.json()["attempts"] == 0


@pytest.mark.asyncio
async def test_local_semantic_dependency_failure_finishes_without_hanging(tmp_path):
    class UnusedEncoder:
        @property
        def configuration(self):
            pytest.fail("Failed retrieval must not start encoding")

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(429))
    ) as client:
        app = create_provider_app(
            "semantic_scholar",
            "live",
            state_dir=tmp_path,
            http_client=client,
            encoder=UnusedEncoder(),
        )
        response = await asyncio.wait_for(
            request(app, "/operations/search", search_body(provider="semantic_scholar")), 2
        )
    stream = events(response)
    assert stream[-1]["status"] == "failed" and stream[-1]["attempts"] == 1
    assert {e["error"] for e in stream if e["kind"] == "branch.failed"} == {
        "UPSTREAM_RATE_LIMIT",
        "CANDIDATE_POOL_UNAVAILABLE",
    }


@pytest.mark.asyncio
async def test_provider_lifespan_enforces_writer_and_preserves_restart_receipts(tmp_path):
    first = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
    contender = create_provider_app("openalex", state_dir=tmp_path, fixture_delay=0)
    other_provider = create_provider_app("datacite", state_dir=tmp_path)
    other_mode = create_provider_app("openalex", "live", state_dir=tmp_path)
    async with first.router.lifespan_context(first):
        stream = events(await request(first, "/operations/search", search_body()))
        assert stream[-1]["attempts"] == 2
        with pytest.raises(RuntimeError, match="Another provider writer"):
            async with contender.router.lifespan_context(contender):
                pytest.fail("A duplicate state owner must not start")
        async with (
            other_provider.router.lifespan_context(other_provider),
            other_mode.router.lifespan_context(other_mode),
        ):
            assert other_provider.state.journal._writer is not None
            assert other_mode.state.journal._writer is not None
    assert first.state.journal._writer is None
    async with contender.router.lifespan_context(contender):
        replay = events(await request(contender, "/operations/search", search_body()))
        assert replay[-1]["attempts"] == 2
        assert all(event["replayed"] for event in replay)
        assert contender.state.journal.read("runs", "run-1")["attempts"] == 2
    assert contender.state.journal._writer is None
    with pytest.raises(ValueError, match="simulated shutdown"):
        async with first.router.lifespan_context(first):
            raise ValueError("simulated shutdown")
    async with contender.router.lifespan_context(contender):
        assert contender.state.journal._writer is not None


def test_provider_writer_lock_excludes_real_second_process_and_releases(tmp_path):
    from research_scout.providers.journal import Journal

    directory = tmp_path / "provider-state"
    owner = Journal(directory, 8)
    child = (
        "from pathlib import Path\n"
        "from research_scout.providers.journal import Journal\n"
        f"journal = Journal(Path({str(directory)!r}), 8)\n"
        "try:\n"
        "    journal.acquire_writer()\n"
        "except RuntimeError:\n"
        "    print('locked')\n"
        "else:\n"
        "    print('owned')\n"
        "    journal.close()\n"
    )
    owner.acquire_writer()
    try:
        blocked = subprocess.run(
            [sys.executable, "-c", child], capture_output=True, text=True, timeout=10, check=True
        )
        assert blocked.stdout.strip() == "locked"
    finally:
        owner.close()
    restarted = subprocess.run(
        [sys.executable, "-c", child], capture_output=True, text=True, timeout=10, check=True
    )
    assert restarted.stdout.strip() == "owned"


def test_atomic_json_uses_unique_files_and_cleans_failed_publication(tmp_path, monkeypatch):
    from research_scout.providers import journal as journal_module

    original = journal_module.tempfile.mkstemp
    names = []

    def tracked(*args, **kwargs):
        descriptor, name = original(*args, **kwargs)
        names.append(name)
        return descriptor, name

    monkeypatch.setattr(journal_module.tempfile, "mkstemp", tracked)
    target = tmp_path / "shared-cache.json"
    with ThreadPoolExecutor(max_workers=4) as workers:
        list(
            workers.map(
                lambda value: journal_module.atomic_json(target, {"value": value}), range(12)
            )
        )
    assert len(names) == len(set(names)) == 12
    assert json.loads(target.read_text())["value"] in range(12)
    previous = target.read_text()
    with pytest.raises(ValueError):
        journal_module.atomic_json(target, {"invalid": float("nan")})
    assert target.read_text() == previous
    assert sorted(path.name for path in tmp_path.iterdir()) == ["shared-cache.json"]
