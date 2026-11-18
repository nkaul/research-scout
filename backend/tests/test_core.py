"""Core/state contracts using authored records and injected provider/model doubles.

These tests do not claim a real Deep Agents or provider integration. That protocol
path has its own test layer. All HTTP here uses an in-process MockTransport.
"""

import asyncio
import copy
import json

import httpx
import pytest

from research_scout.contracts import ResearchRequest, SelectionRequest, SourceRecord
from research_scout.core import ApplicationError, Core, Settings
from research_scout.providers.normalization import source
from research_scout.store import Store

URLS = {
    "openalex": "http://127.0.0.1:8111",
    "crossref": "http://127.0.0.1:8112",
    "datacite": "http://127.0.0.1:8113",
    "semantic_scholar": "http://127.0.0.1:8114",
}


def observation(index=1, *, provider="openalex", year=2024, title=None, doi=None, ranks=None):
    raw = source(
        provider,
        f"authored-{index}",
        "fixture",
        title=title or f"[AUTHORED FICTIONAL] Source {index}",
        authors=["Fictional Author"],
        year=year,
        venue="Fictional Journal",
        doi=doi or f"10.1234/authored.{index}",
        url=f"https://example.org/authored/{provider}/{index}",
        abstract="Authored software fixture; not an actual research paper.",
        resource_type="article",
    )
    raw["branch_ranks"] = ranks or {"lexical": index}
    return SourceRecord.model_validate(raw).model_dump()


def registry_record(doi, *, provider, title="[AUTHORED FICTIONAL] Registry record", year=2024):
    return SourceRecord.model_validate(
        source(
            provider,
            doi,
            "fixture",
            title=title,
            year=year,
            authors=["Fictional Registry Author"],
            doi=doi,
            resource_type="Dataset" if provider == "datacite" else "article",
            url=f"https://example.org/authored/registry/{provider}",
        )
    ).model_dump()


def provider_response(provider, **payload):
    return httpx.Response(
        200, json={"provider": provider, "mode": "fixture", "attempts": 1, **payload}
    )


def stream_response(records=None, *, semantic_failure=False):
    records = records if records is not None else [observation()]
    events = [{"kind": "usage", "attempts": 1}, {"kind": "branch.started", "branch": "lexical"}]
    events += [
        {"kind": "source", "branch": "lexical", "rank": i + 1, "record": record}
        for i, record in enumerate(records)
    ]
    events += [
        {
            "kind": "branch.completed",
            "branch": "lexical",
            "raw_count": len(records),
            "count": len(records),
        },
        {"kind": "usage", "attempts": 2},
        {"kind": "branch.started", "branch": "semantic"},
        {
            "kind": "branch.failed" if semantic_failure else "branch.completed",
            "branch": "semantic",
            "code": "AUTHORED_FAILURE",
            "raw_count": 0,
            "count": 0,
        },
        {"kind": "complete", "attempts": 2},
    ]
    return httpx.Response(
        200,
        content="\n".join(json.dumps(event) for event in events),
        headers={"content-type": "application/x-ndjson"},
    )


@pytest.fixture
async def core_factory(tmp_path):
    resources = []

    def factory(handler=None, *, state_dir=None, agent_runner=None, event_limit=64):
        calls = []

        async def transport(request):
            calls.append(request)
            if handler is None:
                raise AssertionError("This saved-state operation must make no provider HTTP call")
            result = handler(request)
            if hasattr(result, "__await__"):
                result = await result
            return result

        client = httpx.AsyncClient(transport=httpx.MockTransport(transport), trust_env=False)
        settings = Settings(
            state_dir=state_dir or tmp_path / f"instance-{len(resources)}",
            mode="fixture",
            provider_urls=URLS,
            event_limit=event_limit,
        )
        core = Core(settings, client=client, agent_runner=agent_runner)
        resources.append((core, client))
        return core, calls

    yield factory
    for core, client in reversed(resources):
        await core.close()
        await client.aclose()


async def create(core, *, key="test-key", provider="openalex", filters=None):
    return await core.create(
        ResearchRequest(
            question="Find institutional AI readiness studies",
            provider=provider,
            filters=filters or {},
            idempotency_key=key,
        ),
        launch=False,
    )


async def add(core, run_id, *records):
    for record in records:
        await core._observe(run_id, record)
    return await core.get(run_id)


async def select(core, run_id, ref, *, state="included", reason="Human reviewed this fixture"):
    run = await core.get(run_id)
    return await core.select(
        run_id,
        ref,
        SelectionRequest(
            state=state,
            reason=reason,
            expected_revision=run["revision"],
        ),
    )


@pytest.mark.asyncio
async def test_single_writer_rejects_second_state_owner(core_factory):
    core, _ = core_factory()
    with pytest.raises(RuntimeError, match="writer"):
        Store(core.store.path)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "provider,port", [("crossref", 8112), ("arxiv", 8115), ("openaire", 8116), ("europe_pmc", 8117)]
)
async def test_new_discovery_routes_keep_twenty_record_pool_and_filter_scope(
    core_factory, provider, port
):
    records = [observation(index, provider=provider) for index in range(1, 21)]
    core, calls = core_factory(lambda request: stream_response(records))
    run = await create(core, provider=provider, filters={"year_from": 2020})
    await core.store.mutate(run["id"], lambda document: document.update(status="RUNNING"))
    await core._search(run["id"])
    saved = await core.get(run["id"])
    assert len(saved["entities"]) == 20
    assert all(
        record["provider"] == provider and record["eligible"] for record in saved["entities"]
    )
    assert len(calls) == 1 and calls[0].url.port == port
    assert saved["plan"]["raw_per_branch"] == 20
    assert "candidate pool" in saved["plan"]["semantic_scope"]
    assert saved["usage"]["research_attempts"] == 2


@pytest.mark.asyncio
async def test_restart_retains_records_and_marks_interrupted_without_research(core_factory):
    first, calls = core_factory()
    run = await create(first)
    await add(first, run["id"], observation())
    await first._reserve(run["id"], "openalex", 4, "interrupted-operation")
    await first.store.mutate(run["id"], lambda d: d.update(status="RUNNING"))
    await first.close()
    second, restarted_calls = core_factory(state_dir=first.settings.state_dir)
    restored = await second.get(run["id"])
    assert restored["status"] == "INTERRUPTED"
    assert len(restored["entities"]) == 1
    assert all(op["status"] == "interrupted" for op in restored["operations"].values())
    assert restored["usage"]["reserved_by_provider"]["openalex"] == 4
    assert calls == restarted_calls == []
    with pytest.raises(ApplicationError, match="not active"):
        await second.search_papers(run["id"])


@pytest.mark.asyncio
async def test_completed_run_and_replay_cursor_survive_restart(core_factory):
    first, _ = core_factory()
    run = await create(first)
    await first.store.mutate(run["id"], lambda d: d.update(status="SUCCEEDED"))
    saved = await first.get(run["id"])
    await first.close()
    second, calls = core_factory(state_dir=first.settings.state_dir)
    restored = await second.get(run["id"])
    assert restored["status"] == "SUCCEEDED"
    assert restored["cursor"] == saved["cursor"]
    assert await second.store.replay(run["id"], saved["cursor"]) == []
    assert calls == []


@pytest.mark.asyncio
async def test_same_start_key_reuses_run_and_changed_request_conflicts(core_factory):
    core, calls = core_factory()
    first = await create(core)
    again = await create(core)
    assert again["id"] == first["id"]
    assert len(await core.store.list()) == 1
    with pytest.raises(ApplicationError, match="different request"):
        await create(core, provider="semantic_scholar")
    assert calls == []


@pytest.mark.asyncio
async def test_one_active_run_does_not_prevent_saved_reads_or_cancelled_replacement(core_factory):
    core, calls = core_factory()
    first = await create(core)
    with pytest.raises(ApplicationError, match="already active"):
        await create(core, key="second-key")
    assert (await core.get(first["id"]))["id"] == first["id"]
    await core.cancel(first["id"])
    second = await create(core, key="second-key")
    assert second["id"] != first["id"]
    assert calls == []


@pytest.mark.asyncio
async def test_missing_required_filter_is_not_published_as_an_eligible_source(core_factory):
    core, _ = core_factory()
    run = await create(core, filters={"year_from": 2020, "resource_type": "article"})
    await add(core, run["id"], observation(1, year=None), observation(2, year=2024))
    visible = await core.get(run["id"])
    raw = await core.get(run["id"], private=True)
    assert [entity["record_id"] for entity in visible["entities"]] == ["authored-2"]
    rejected = next(e for e in raw["entities"] if e["record_id"] == "authored-1")
    assert not rejected["eligible"] and rejected["filter_warnings"]
    with pytest.raises(ApplicationError, match="filters"):
        await select(core, run["id"], rejected["source_ref"])


@pytest.mark.asyncio
async def test_same_provider_identity_accumulates_branch_contributions_once(core_factory):
    core, _ = core_factory()
    run = await create(core)
    record = observation(1, ranks={"lexical": 2})
    semantic = {**record, "branch_ranks": {"semantic": 1}}
    await add(core, run["id"], record, semantic, semantic)
    entities = (await core.get(run["id"]))["entities"]
    assert len(entities) == 1
    assert entities[0]["branch_ranks"] == {"lexical": 2, "semantic": 1}
    assert entities[0]["rank_score"] > 0


@pytest.mark.asyncio
async def test_effective_ranks_exclude_filtered_hits_and_update_without_rewriting_raw_ranks(
    core_factory,
):
    core, _ = core_factory()
    run = await create(core, filters={"year_from": 2020})
    excluded = observation(1, year=2018, ranks={"lexical": 1})
    second = observation(2, ranks={"lexical": 2})
    third = observation(3, ranks={"lexical": 3, "semantic": 1})
    await add(core, run["id"], excluded, second, third)
    rows = {e["source_ref"]: e for e in (await core.get(run["id"]))["entities"]}
    assert rows[second["source_ref"]]["branch_ranks"]["lexical"] == 2
    assert rows[second["source_ref"]]["eligible_branch_ranks"]["lexical"] == 1
    assert rows[third["source_ref"]]["rank_score"] > rows[second["source_ref"]]["rank_score"]
    await add(core, run["id"], observation(1, year=2025, ranks={"lexical": 1}))
    after = {e["source_ref"]: e for e in (await core.get(run["id"]))["entities"]}
    assert after[second["source_ref"]]["version"] == second["version"]
    assert after[second["source_ref"]]["branch_ranks"]["lexical"] == 2
    assert after[second["source_ref"]]["eligible_branch_ranks"]["lexical"] == 2


@pytest.mark.asyncio
async def test_new_ineligible_observation_preserves_saved_selection_and_old_export(core_factory):
    core, _ = core_factory()
    run = await create(core, filters={"year_from": 2020})
    original = observation(1, year=2024)
    await add(core, run["id"], original)
    await select(core, run["id"], original["source_ref"])
    old_export = await core.export(run["id"])
    frozen = copy.deepcopy(old_export)
    changed = observation(1, year=2018)
    await add(core, run["id"], changed)
    current = await core.get(run["id"])
    saved = current["selections"][original["source_ref"]]
    entity = current["entities"][0]
    assert not entity["eligible"]
    assert entity.get("rank_score") in {None, 0}
    assert saved["state"] == "included" and saved["warning"]
    assert saved["source_snapshot"]["year"] == 2024
    assert current["revision"] > old_export["revision"]
    assert old_export == frozen


@pytest.mark.asyncio
async def test_three_included_limit_and_any_candidate_can_be_excluded(core_factory):
    core, _ = core_factory()
    run = await create(core)
    records = [observation(i) for i in range(1, 7)]
    await add(core, run["id"], *records)
    for record in records[:3]:
        await select(core, run["id"], record["source_ref"])
    with pytest.raises(ApplicationError, match="three"):
        await select(core, run["id"], records[3]["source_ref"])
    for record in records:
        await select(core, run["id"], record["source_ref"], state="excluded")
    assert len((await core.get(run["id"]))["selections"]) == 6
    assert all(s["state"] == "excluded" for s in (await core.get(run["id"]))["selections"].values())


@pytest.mark.asyncio
async def test_stale_selection_revision_has_no_partial_write_or_event(core_factory):
    core, _ = core_factory()
    run = await create(core)
    record = observation()
    await add(core, run["id"], record)
    saved = await select(core, run["id"], record["source_ref"])
    with pytest.raises(ApplicationError, match="revision"):
        await core.select(
            run["id"],
            record["source_ref"],
            SelectionRequest(
                state="excluded",
                reason="stale change",
                expected_revision=0,
            ),
        )
    after = await core.get(run["id"])
    assert after["cursor"] == saved["cursor"]
    assert after["selections"] == saved["selections"]


@pytest.mark.asyncio
async def test_reopen_select_and_export_use_only_saved_state(core_factory):
    first, calls = core_factory()
    run = await create(first)
    record = observation()
    await add(first, run["id"], record)
    await first.store.mutate(run["id"], lambda d: d.update(status="SUCCEEDED"))
    await first.close()
    second, restored_calls = core_factory(state_dir=first.settings.state_dir)
    saved = await select(second, run["id"], record["source_ref"])
    exported = await second.export(run["id"])
    assert saved["selections"][record["source_ref"]]["state"] == "included"
    assert record["title"] in exported["bibliography"]
    assert exported["manifest"]["mode"] == "fixture"
    assert calls == restored_calls == []


@pytest.mark.asyncio
async def test_details_are_cached_and_new_metadata_does_not_mutate_chosen_snapshot(core_factory):
    original = SourceRecord.model_validate(
        {
            **observation(),
            "authors": ["Fictional Author A"],
            "truncated_fields": ["authors"],
            "version": "authored-truncated-v1",
        }
    ).model_dump()
    hydrated = SourceRecord.model_validate(
        {
            **observation(title="[AUTHORED FICTIONAL] Full detail metadata"),
            "authors": ["Fictional Author A", "Fictional Author B"],
            "truncated_fields": [],
            "version": "authored-complete-v2",
        }
    ).model_dump()

    def handler(request):
        assert request.url.path == "/operations/details"
        return provider_response("openalex", record=hydrated)

    core, calls = core_factory(handler)
    run = await create(core)
    await add(core, run["id"], original)
    await select(core, run["id"], original["source_ref"])
    old_export = await core.export(run["id"])
    frozen_export = copy.deepcopy(old_export)
    assert "provider-truncated fields: authors" in old_export["bibliography"]
    assert old_export["manifest"]["sources"][0]["selection"]["source_snapshot"][
        "truncated_fields"
    ] == ["authors"]
    changed = await core.details(run["id"], original["source_ref"])
    assert changed["entities"][0]["title"] == hydrated["title"]
    assert changed["entities"][0]["authors"] == ["Fictional Author A", "Fictional Author B"]
    assert changed["entities"][0]["truncated_fields"] == []
    assert (
        changed["selections"][original["source_ref"]]["source_snapshot"]["title"]
        == original["title"]
    )
    assert changed["revision"] > old_export["revision"]
    unchanged_choice = await core.export(run["id"])
    assert "provider-truncated fields: authors" in unchanged_choice["bibliography"]
    assert "Fictional Author B" not in unchanged_choice["bibliography"]
    assert changed["selections"][original["source_ref"]]["source_snapshot"]["authors"] == [
        "Fictional Author A"
    ]
    assert old_export == frozen_export
    await core.details(run["id"], original["source_ref"])
    assert len(calls) == 1
    await select(core, run["id"], original["source_ref"])
    new_export = await core.export(run["id"])
    assert hydrated["title"] in new_export["bibliography"]
    assert "Fictional Author B" in new_export["bibliography"]
    assert "provider-truncated fields" not in new_export["bibliography"]
    assert original["title"] in old_export["bibliography"]
    assert hydrated["title"] not in old_export["bibliography"]


@pytest.mark.asyncio
async def test_registry_record_conflicts_remain_separate_and_route_exact_agency(core_factory):
    original = observation(doi="10.1234/datacite-source")
    registry = registry_record(original["doi"], provider="datacite")

    def handler(request):
        if request.url.path == "/operations/agency":
            assert request.url.port == 8112
            return provider_response("crossref", agency="datacite")
        assert request.url.port == 8113 and request.url.path == "/operations/metadata"
        return provider_response("datacite", record=registry)

    core, calls = core_factory(handler)
    run = await create(core)
    await add(core, run["id"], original)
    await select(core, run["id"], original["source_ref"])
    discovery_export = await core.export(run["id"])
    result = await core.metadata_check(run["id"], original["source_ref"])
    check = result["checks"][original["source_ref"]]
    assert [(r.url.port, r.url.path) for r in calls] == [
        (8112, "/operations/agency"),
        (8113, "/operations/metadata"),
    ]
    assert check["status"] == "registry_conflict" and check["conflicts"]
    assert check["observations"][0]["provider"] == "datacite"
    assert result["entities"][0]["title"] == original["title"]
    assert result["selections"][original["source_ref"]]["source_snapshot"]["provider"] == "openalex"
    await core.metadata_check(run["id"], original["source_ref"])
    assert len(calls) == 2
    current = await core.get(run["id"])
    chosen = await core.select(
        run["id"],
        original["source_ref"],
        SelectionRequest(
            state="included",
            expected_revision=current["revision"],
            citation_source="registry",
        ),
    )
    citation = chosen["selections"][original["source_ref"]]
    assert citation["citation_source_ref"] == registry["source_ref"]
    assert citation["source_snapshot"]["provider"] == "datacite"
    assert citation["source_snapshot"]["abstract"] is None  # no silent discovery-field filling
    registry_export = await core.export(run["id"])
    assert registry["title"] in registry_export["bibliography"]
    assert original["title"] in discovery_export["bibliography"]
    assert registry["title"] not in discovery_export["bibliography"]


@pytest.mark.asyncio
async def test_known_datacite_route_works_without_crossref_service(core_factory):
    original = observation(doi="10.1234/known-datacite")

    def handler(request):
        assert request.url.port == 8113, "Known DataCite route must not depend on Crossref"
        return provider_response(
            "datacite", record=registry_record(original["doi"], provider="datacite")
        )

    core, calls = core_factory(handler)
    run = await create(core)
    await add(core, run["id"], original)
    await select(core, run["id"], original["source_ref"])
    await core._save_check(
        run["id"],
        original["source_ref"],
        {
            "doi": original["doi"],
            "agency": "datacite",
            "status": "unavailable",
            "agency_evidence": {
                "provider": "crossref",
                "operation": "agency",
                "doi": original["doi"],
            },
        },
    )
    checked = await core.metadata_check(run["id"], original["source_ref"])
    assert checked["checks"][original["source_ref"]]["record"]["provider"] == "datacite"
    assert checked["checks"][original["source_ref"]]["agency_evidence"]["provider"] == "crossref"
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "agency,expected",
    [
        ("crossref", "registry_match"),
        ("other-agency", "unsupported_agency"),
        (None, "agency_unresolved"),
    ],
)
async def test_registry_route_is_not_a_blind_try_both_fallback(core_factory, agency, expected):
    original = observation()
    registry = registry_record(original["doi"], provider="crossref", title=original["title"])
    registry.update(
        authors=original["authors"], venue=original["venue"], version="authored-registry-match-v1"
    )

    def handler(request):
        assert request.url.port == 8112
        if request.url.path == "/operations/agency":
            return provider_response("crossref", agency=agency or "")
        return provider_response("crossref", record=registry)

    core, calls = core_factory(handler)
    run = await create(core)
    await add(core, run["id"], original)
    await select(core, run["id"], original["source_ref"])
    result = await core.metadata_check(run["id"], original["source_ref"])
    assert result["checks"][original["source_ref"]]["status"] == expected
    assert len(calls) == (2 if agency == "crossref" else 1)


@pytest.mark.asyncio
async def test_agency_failure_preserves_source_and_does_not_probe_registry_fallback(core_factory):
    def handler(request):
        assert request.url.port == 8112 and request.url.path == "/operations/agency"
        return httpx.Response(503, json={"detail": "authored unavailable service"})

    core, calls = core_factory(handler)
    run = await create(core)
    original = observation()
    await add(core, run["id"], original)
    await select(core, run["id"], original["source_ref"])
    result = await core.metadata_check(run["id"], original["source_ref"])
    assert result["checks"][original["source_ref"]]["status"] == "agency_unresolved"
    assert result["entities"][0]["title"] == original["title"]
    assert len(calls) == 1
    assert result["usage"]["reserved_by_provider"]["crossref"] == 1


@pytest.mark.asyncio
async def test_metadata_check_requires_human_inclusion_and_supported_doi(core_factory):
    core, calls = core_factory()
    run = await create(core)
    original = observation(doi="invalid-doi")
    await add(core, run["id"], original)
    with pytest.raises(ApplicationError, match="Include"):
        await core.metadata_check(run["id"], original["source_ref"])
    await select(core, run["id"], original["source_ref"])
    with pytest.raises(ApplicationError, match="DOI"):
        await core.metadata_check(run["id"], original["source_ref"])
    assert calls == []


@pytest.mark.asyncio
async def test_model_failure_after_search_preserves_sources_without_provider_fallback(core_factory):
    core = None

    async def failing_model(**kwargs):
        await core.search_papers(kwargs["run_id"])
        raise RuntimeError("Authored model failure after provider retrieval")

    core, calls = core_factory(lambda request: stream_response(), agent_runner=failing_model)
    run = await create(core)
    await core._execute_agent(run["id"])
    result = await core.get(run["id"])
    assert result["status"] == "PARTIAL" and len(result["entities"]) == 1
    assert result["summary"] is None and result["warnings"]
    assert len(calls) == 1 and calls[0].url.port == 8111
    assert result["usage"]["research_attempts"] == 2


@pytest.mark.asyncio
async def test_partial_branch_retains_valid_sources_and_reports_partial_run(core_factory):
    core = None

    async def injected_runner(**kwargs):
        result = await core.search_papers(kwargs["run_id"])
        return {
            "candidate_refs": result["candidate_refs"],
            "summary": "Injected unit runner",
            "mode": "fixture",
            "usage": {},
        }

    core, calls = core_factory(
        lambda request: stream_response(semantic_failure=True), agent_runner=injected_runner
    )
    run = await create(core)
    await core._execute_agent(run["id"])
    result = await core.get(run["id"])
    assert result["status"] == "PARTIAL"
    assert result["operations"]["lexical"]["status"] == "succeeded"
    assert result["operations"]["semantic"]["status"] == "failed"
    assert len(result["entities"]) == 1 and len(calls) == 1


@pytest.mark.asyncio
async def test_cancelled_run_fences_late_candidate_effects(core_factory):
    runner_calls = []

    async def injected_runner(**kwargs):
        runner_calls.append(kwargs["run_id"])
        return {
            "candidate_refs": [],
            "summary": "Must not run after cancellation",
            "mode": "fixture",
        }

    core, calls = core_factory(agent_runner=injected_runner)
    run = await create(core)
    first = observation(1)
    await add(core, run["id"], first)
    await select(core, run["id"], first["source_ref"])
    await core.cancel(run["id"])
    await add(core, run["id"], observation(2))
    # A queued execution that starts after cancellation must not resurrect this run.
    await core._execute_agent(run["id"])
    result = await core.get(run["id"])
    assert result["status"] == "CANCELLED"
    assert [entity["source_ref"] for entity in result["entities"]] == [first["source_ref"]]
    assert result["selections"][first["source_ref"]]["state"] == "included"
    assert calls == []
    assert runner_calls == []


@pytest.mark.asyncio
async def test_agent_deadline_cannot_publish_a_later_shielded_provider_response(core_factory):
    release_provider = asyncio.Event()
    core = None

    async def provider_response_after_deadline(request):
        await release_provider.wait()
        return stream_response()

    async def injected_runner(**kwargs):
        result = await core.search_papers(kwargs["run_id"])
        return {
            "candidate_refs": result["candidate_refs"],
            "summary": "Late unit result",
            "mode": "fixture",
        }

    core, calls = core_factory(provider_response_after_deadline, agent_runner=injected_runner)
    core.settings.agent_deadline = 0.02
    run = await create(core)
    await core._execute_agent(run["id"])
    assert (await core.get(run["id"]))["status"] == "FAILED"
    release_provider.set()
    await asyncio.wait_for(
        asyncio.gather(*core._search_tasks.values(), return_exceptions=True), timeout=1
    )
    result = await core.get(run["id"])
    assert result["entities"] == []
    assert result["summary"] is None
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_duplicate_search_capability_reads_one_completed_operation(core_factory):
    core, calls = core_factory(lambda request: stream_response())
    run = await create(core)
    await core.store.mutate(run["id"], lambda d: d.update(status="RUNNING"))
    first = await core.search_papers(run["id"])
    second = await core.search_papers(run["id"])
    assert first["candidate_refs"] == second["candidate_refs"]
    assert len(calls) == 1
    assert second["items"]


@pytest.mark.asyncio
async def test_foreign_provider_stream_cannot_replace_selected_provider(core_factory):
    core, calls = core_factory(
        lambda request: stream_response([observation(provider="semantic_scholar")])
    )
    run = await create(core)
    await core.store.mutate(run["id"], lambda d: d.update(status="RUNNING"))
    result = await core.search_papers(run["id"])
    assert result["candidate_refs"] == []
    assert len(calls) == 1 and calls[0].url.port == 8111
    assert result["warnings"]


@pytest.mark.asyncio
async def test_per_provider_and_global_grants_are_independent_finite_caps(core_factory):
    core, _ = core_factory()
    run = await create(core)
    for provider, amount in (("openalex", 8), ("crossref", 5), ("datacite", 3)):
        await core._reserve(run["id"], provider, amount, provider)
        await core._settle(run["id"], provider, amount, complete=True)
    with pytest.raises(ApplicationError, match="Overall"):
        await core._reserve(run["id"], "crossref", 1, "global-exceeded")
    with pytest.raises(ApplicationError, match="allowance"):
        await core._reserve(run["id"], "openalex", 1, "provider-exceeded")
    usage = (await core.get(run["id"]))["usage"]
    assert usage["research_attempts"] == 16
    assert usage["by_provider"] == {"openalex": 8, "crossref": 5, "datacite": 3}


@pytest.mark.asyncio
async def test_completed_settlement_and_duplicate_admission_cannot_create_negative_holds(
    core_factory,
):
    core, _ = core_factory()
    run = await create(core)
    await core._reserve(run["id"], "openalex", 4, "same-operation")
    admitted = (await core.get(run["id"]))["usage"]
    try:
        await core._reserve(run["id"], "openalex", 4, "same-operation")
    except ApplicationError:
        pass
    assert (await core.get(run["id"]))["usage"] == admitted
    await core._settle(run["id"], "same-operation", 2, complete=True)
    settled = (await core.get(run["id"]))["usage"]
    await core._settle(run["id"], "same-operation", 2, complete=True)
    assert (await core.get(run["id"]))["usage"] == settled
    assert settled["reserved_by_provider"]["openalex"] == 0
    assert settled["research_attempts"] == 2


@pytest.mark.asyncio
async def test_uncertain_hold_survives_restart_and_usage_cannot_move_backwards(core_factory):
    first, _ = core_factory()
    run = await create(first)
    await first._reserve(run["id"], "openalex", 4, "uncertain")
    await first._settle(run["id"], "uncertain", 2, complete=False)
    before = (await first.get(run["id"]))["usage"]
    with pytest.raises(ApplicationError, match="contradicted"):
        await first._settle(run["id"], "uncertain", 1, complete=False)
    await first.close()
    second, calls = core_factory(state_dir=first.settings.state_dir)
    assert (await second.get(run["id"]))["usage"] == before
    with pytest.raises(ApplicationError, match="allowance"):
        await second._reserve(run["id"], "openalex", 5, "cannot-reset")
    assert calls == []


@pytest.mark.asyncio
async def test_event_replay_is_ordered_repeatable_and_expired_gap_needs_snapshot(core_factory):
    core, calls = core_factory(event_limit=2)
    run = await create(core)
    old_cursor = run["cursor"]
    await add(core, run["id"], observation(1), observation(2))
    events = await core.store.replay(run["id"], old_cursor)
    assert len(events) == 2
    assert [event["sequence"] for event in events] == sorted(event["sequence"] for event in events)
    assert await core.store.replay(run["id"], old_cursor) == events
    last = events[-1]["id"]
    assert await core.store.replay(run["id"], last) == []
    await add(core, run["id"], observation(3))
    assert await core.store.replay(run["id"], old_cursor) is None
    snapshot = await core.get(run["id"])
    assert len(snapshot["entities"]) == 3
    assert await core.store.replay(run["id"], snapshot["cursor"]) == []
    assert await core.store.replay(run["id"], "foreign-stream:1") is None
    assert calls == []


@pytest.mark.asyncio
async def test_rejected_atomic_mutation_does_not_publish_state_or_event(core_factory):
    core, _ = core_factory()
    run = await create(core)
    before = await core.get(run["id"], private=True)

    def failing_change(document):
        document["summary"] = "Must never be published"
        raise ApplicationError("Authored failure before publication")

    with pytest.raises(ApplicationError):
        await core.store.mutate(run["id"], failing_change)
    assert await core.get(run["id"], private=True) == before
    assert json.loads((core.store.path / f"{run['id']}.json").read_text()) == before
