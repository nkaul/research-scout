"""Authored identity/access cases, not live provider or semantic-quality evidence."""

import asyncio
import copy
import json

import httpx
import pytest

from research_scout.contracts import ConversationRequest, now
from research_scout.core import Core, Settings
from research_scout.federation import (
    MAX_ACCESS_LOOKUPS,
    Federation,
    buildpapers,
    normalize_doi,
    public_access,
    unique_evidence,
)
from research_scout.providers.normalization import source
from research_scout.providers.service import CAPS, create_provider_app


def observation(provider="openalex", record_id="1", doi="10.1234/example", **fields):
    return {
        **source(provider, record_id, "fixture", doi=doi, title="Authored paper", **fields),
        "run_id": f"run-{provider}",
    }


def access_observation(doi, *, locations=0, is_oa=True):
    return {
        "provider": "unpaywall",
        "doi": doi,
        "mode": "fixture",
        "version": "access-v1",
        "observed_at": now(),
        "is_oa": is_oa,
        "oa_status": "green" if is_oa else "closed",
        "best_oa_location": {"url": "https://example.org/best"} if is_oa else None,
        "oa_locations": [{"url": f"https://example.org/copy/{i}"} for i in range(locations)],
    }


@pytest.mark.parametrize(
    "value, expected",
    [
        (" DOI:10.1234/ABC.Def ", "10.1234/abc.def"),
        ("HTTPS://DOI.ORG/10.1234/ABC%2Fdef", "10.1234/abc/def"),
        ("http://dx.doi.org/10.1234/ABC", "10.1234/abc"),
        ("10.1234/abc?tracking=1", None),
        ("https://doi.org/10.1234/abc#page2", None),
        ("https://doi.org.evil/10.1234/abc", None),
        ("https://user:secret@doi.org/10.1234/abc", None),
        ("A paper about 10.1234/abc", None),
        ("10.123/too-short", None),
        ("10.1234/invalid%0Adoi", None),
        (None, None),
    ],
)
def test_doi_identity_is_strict_and_normalizes_resolver_prefixes(value, expected):
    assert normalize_doi(value) == expected


def test_same_doi_preserves_observations_conflicts_versions_and_whole_representative():
    early = observation(doi="DOI:10.1234/ABC", year=2024)
    richer = observation(
        "crossref", "other", "https://doi.org/10.1234/abc", abstract="Deposited abstract", year=2025
    )
    richer["title"] = "Conflicting provider title"
    richer["relevance"] = {"label": "relevant", "score": 74}
    later_version = {**early, "version": "new-version", "run_id": "second-run"}
    original = copy.deepcopy([early, richer, later_version])
    papers = buildpapers([early, richer, later_version, copy.deepcopy(early)])
    assert len(papers) == 1
    paper = papers[0]
    assert paper["paper_id"] == "doi:10.1234/abc"
    assert paper["providers"] == ["openalex", "crossref"]
    assert len(paper["observations"]) == 3
    assert [item["year"] for item in paper["observations"]] == [2024, 2025, 2024]
    assert paper["representative"] == richer
    assert paper["representative"]["year"] == 2025  # no OA year blended into CR fields
    assert original == [early, richer, later_version]
    paper["representative"]["title"] = "Changed only the copy"
    assert richer["title"] == "Conflicting provider title"


def test_missing_doi_same_title_and_distinct_preprints_stay_distinct():
    records = [
        observation("arxiv", "2401.00001v1", None),
        observation("arxiv", "2401.00002v1", None),
        observation("crossref", "bad", "not a DOI"),
    ]
    papers = buildpapers(records)
    assert len(papers) == 3
    assert [paper["paper_id"] for paper in papers] == [
        f"source:{record['source_ref']}" for record in records
    ]
    assert all(paper["access"]["status"] == "not_applicable" for paper in papers)
    assert unique_evidence(records) == records


def test_refresh_preserves_focus_order_access_and_no_removed_observation_resurrection():
    first, second = observation(), observation(record_id="2", doi="10.1234/second")
    existing = buildpapers([first, second])
    existing[0]["access"] = {"status": "failed", "reason": "Saved failure"}
    rich = observation("crossref", "third", "10.1234/example", abstract="Available abstract")
    updated = buildpapers([second, rich, first], existing)
    assert [paper["paper_id"] for paper in updated] == [paper["paper_id"] for paper in existing]
    assert updated[0]["representative"] == rich
    assert updated[0]["access"] == existing[0]["access"]
    assert unique_evidence([first, rich, second]) == [rich, second]
    removed = buildpapers([second], updated)
    assert len(removed) == 1 and removed[0]["doi"] == "10.1234/second"


def test_untrusted_identity_relationship_cannot_reassign_a_source():
    record = observation()
    record["provider"] = "crossref"
    with pytest.raises(ValueError, match="identities"):
        buildpapers([record])
    original = observation()
    with pytest.raises(ValueError, match="different DOI relationships"):
        buildpapers([original, {**original, "doi": "10.9999/other"}])


@pytest.fixture
async def federation_core(tmp_path):
    resources = []

    async def make(records, handler=None, *, operations=None, ready=True):
        calls, core = [], None

        async def dispatch(request):
            payload = json.loads(request.content)
            calls.append(payload)
            saved = await core.conversations._turn(conversation_id, "turn")
            assert payload["doi"] in saved["_federation_access"]
            paper = next(paper for paper in saved["papers"] if paper["doi"] == payload["doi"])
            assert paper["access"]["status"] == "running"
            assert request.url.path == "/operations/access"
            if handler:
                result = handler(request, payload, core)
                return await result if hasattr(result, "__await__") else result
            return httpx.Response(
                200,
                json={
                    "provider": "unpaywall",
                    "mode": "fixture",
                    "attempts": 1,
                    "access": access_observation(payload["doi"]),
                },
            )

        client = httpx.AsyncClient(transport=httpx.MockTransport(dispatch))
        core = Core(
            Settings(state_dir=tmp_path / str(len(resources)), model_mode="disabled"), client=client
        )
        conversation = await core.conversations.create(
            ConversationRequest(routing="manual", providers=["openalex"])
        )
        conversation_id = conversation["id"]
        turn = {
            "id": "turn",
            "status": "RUNNING",
            "action": "discover",
            "routing": "auto",
            "sources": copy.deepcopy(records),
            "papers": [],
            "providers": ["openalex"],
            "source_plan": [
                {
                    "provider": "unpaywall",
                    "role": "access",
                    "status": "enrichment" if ready else "skipped",
                }
            ],
            "_operations": copy.deepcopy(operations or {}),
            "warnings": [],
            "usage": {"research_attempts": 0, "model_http_attempts": 0},
        }
        await core.conversations.store.mutate(
            conversation_id, lambda item: item["turns"].append(turn)
        )
        resources.append((core, client))
        return core, conversation_id, calls

    yield make
    for core, client in resources:
        await core.close()
        await client.aclose()


async def test_unique_access_once_progressive_private_observation_and_replay(federation_core):
    records = [
        observation(),
        observation("crossref", "same", "DOI:10.1234/EXAMPLE"),
        observation(record_id="2", doi="10.1234/second"),
    ]
    entered, release = asyncio.Event(), asyncio.Event()

    async def handler(_request, payload, _core):
        if payload["doi"] == "10.1234/second":
            entered.set()
            await release.wait()
        return httpx.Response(
            200,
            json={
                "provider": "unpaywall",
                "mode": "fixture",
                "attempts": 1,
                "access": access_observation(payload["doi"], locations=20),
            },
        )

    core, conversation_id, calls = await federation_core(records, handler)
    task = asyncio.create_task(core.federation.enrich_turn(conversation_id, "turn"))
    await asyncio.wait_for(entered.wait(), 2)
    mid = await core.conversations._turn(conversation_id, "turn")
    assert mid["status"] == "RUNNING"
    assert [paper["access"]["status"] for paper in mid["papers"]] == ["succeeded", "running"]
    assert len(mid["_access_observations"]["doi:10.1234/example"]["oa_locations"]) == 20
    public = await core.conversations.get(conversation_id)
    assert "_access_observations" not in public["turns"][0]
    compact = public["turns"][0]["papers"][0]["access"]
    assert len(compact["observation"]["oa_locations"]) == 8
    assert compact["observation"]["locations_omitted"] == 12
    assert public_access(compact) == compact  # projection is idempotent
    release.set()
    await task
    await asyncio.gather(
        core.federation.enrich_turn(conversation_id, "turn"),
        Federation(core).enrich_turn(conversation_id, "turn"),
    )
    assert len(calls) == 2
    assert len({call["operation_id"] for call in calls}) == 2
    final = await core.conversations._turn(conversation_id, "turn")
    assert final["providers"] == ["openalex"]
    assert final["usage"]["research_attempts"] == 2


@pytest.mark.parametrize(
    "ready, operations, expected_calls, expected_status",
    [
        (False, {}, 0, "blocked"),
        (True, {"held": {"attempts": 23, "hold": 1}}, 0, "deferred_budget"),
        (True, {"used": {"attempts": 22, "hold": 1}}, 1, "deferred_budget"),
    ],
)
async def test_access_gate_and_parent_budget_include_uncertain_holds(
    federation_core, ready, operations, expected_calls, expected_status
):
    records = [observation(record_id=str(i), doi=f"10.1234/paper-{i}") for i in range(3)]
    core, conversation_id, calls = await federation_core(
        records, ready=ready, operations=operations
    )
    await core.federation.enrich_turn(conversation_id, "turn")
    result = await core.conversations._turn(conversation_id, "turn")
    assert len(calls) == expected_calls
    assert result["papers"][-1]["access"]["status"] == expected_status
    assert all(paper["representative"] in records for paper in result["papers"])


async def test_hard_cap_twelve_doi_groups_and_explicit_overflow(federation_core):
    records = [observation(record_id=str(i), doi=f"10.1234/paper-{i}") for i in range(14)]
    core, conversation_id, calls = await federation_core(records)
    await core.federation.enrich_turn(conversation_id, "turn")
    result = await core.conversations._turn(conversation_id, "turn")
    assert len(calls) == MAX_ACCESS_LOOKUPS == 12
    assert [paper["access"]["status"] for paper in result["papers"]] == ["succeeded"] * 12 + [
        "deferred_budget"
    ] * 2


async def test_failure_not_found_mismatch_closed_and_unknown_hold_do_not_hide_papers(
    federation_core,
):
    async def handler(request, payload, _core):
        index = int(payload["doi"].rsplit("-", 1)[-1])
        if index == 0:
            raise httpx.ReadTimeout("secret contact in upstream exception", request=request)
        if index == 1:
            return httpx.Response(
                404,
                json={
                    "provider": "unpaywall",
                    "mode": "fixture",
                    "attempts": 1,
                    "code": "NOT_FOUND",
                },
            )
        access = access_observation(payload["doi"], is_oa=False)
        if index == 2:
            access["doi"] = "10.9999/foreign"
        if index == 3:
            access["best_oa_location"] = {"url": "javascript:alert(1)"}
        return httpx.Response(
            200, json={"provider": "unpaywall", "mode": "fixture", "attempts": 1, "access": access}
        )

    records = [observation(record_id=str(i), doi=f"10.1234/paper-{i}") for i in range(5)]
    core, conversation_id, calls = await federation_core(records, handler)
    await core.federation.enrich_turn(conversation_id, "turn")
    result = await core.conversations._turn(conversation_id, "turn")
    assert len(calls) == len(result["papers"]) == 5
    assert [paper["access"]["status"] for paper in result["papers"]] == [
        "failed",
        "not_found",
        "failed",
        "failed",
        "succeeded",
    ]
    assert result["papers"][-1]["access"]["observation"]["is_oa"] is False
    uncertain = next(
        operation for operation in result["_operations"].values() if operation["doi"].endswith("-0")
    )
    assert uncertain["status"] == "uncertain" and uncertain["hold"] == 1
    assert "secret contact" not in json.dumps(result)
    await Federation(core).enrich_turn(conversation_id, "turn")
    assert len(calls) == 5


async def test_provider_reports_missing_configuration_stops_noisy_remaining_access(federation_core):
    def handler(_request, _payload, _core):
        return httpx.Response(
            503,
            json={
                "provider": "unpaywall",
                "mode": "fixture",
                "attempts": 0,
                "code": "ACCESS_NOT_CONFIGURED",
            },
        )

    records = [observation(record_id=str(i), doi=f"10.1234/paper-{i}") for i in range(3)]
    core, conversation_id, calls = await federation_core(records, handler)
    await core.federation.enrich_turn(conversation_id, "turn")
    result = await core.conversations._turn(conversation_id, "turn")
    assert len(calls) == 1 and result["usage"]["research_attempts"] == 0
    assert all(paper["access"]["status"] == "blocked" for paper in result["papers"])


async def test_concurrent_federation_instances_cannot_redispatch_saved_running_intent(
    federation_core,
):
    entered, release = asyncio.Event(), asyncio.Event()

    async def handler(_request, payload, _core):
        entered.set()
        await release.wait()
        return httpx.Response(
            200,
            json={
                "provider": "unpaywall",
                "mode": "fixture",
                "attempts": 1,
                "access": access_observation(payload["doi"]),
            },
        )

    core, conversation_id, calls = await federation_core([observation()], handler)
    first = asyncio.create_task(core.federation.enrich_turn(conversation_id, "turn"))
    await asyncio.wait_for(entered.wait(), 2)
    await Federation(core).enrich_turn(conversation_id, "turn")
    assert len(calls) == 1
    saved = await core.conversations._turn(conversation_id, "turn")
    assert saved["papers"][0]["access"]["status"] == "running"
    release.set()
    await first
    assert (await core.conversations._turn(conversation_id, "turn"))["papers"][0]["access"][
        "status"
    ] == "succeeded"


async def test_running_intent_and_terminal_turn_never_dispatch_or_change_source(federation_core):
    core, conversation_id, calls = await federation_core([observation()])
    await core.federation.refresh_turn(conversation_id, "turn")

    def interrupted_intent(turn):
        turn["_federation_access"] = ["10.1234/example"]
        turn["papers"][0]["access"] = {"status": "running"}

    await core.conversations._edit(
        conversation_id, "turn", interrupted_intent, "authored.interruption"
    )
    await Federation(core).enrich_turn(conversation_id, "turn")
    assert calls == []
    await core.conversations._edit(
        conversation_id, "turn", lambda turn: turn.update(status="CANCELLED"), "authored.cancelled"
    )
    before = await core.conversations._turn(conversation_id, "turn")
    await core.federation.enrich_turn(conversation_id, "turn")
    assert await core.conversations._turn(conversation_id, "turn") == before


async def test_provider_journal_allows_twelve_unique_dois_then_blocks_thirteenth(tmp_path):
    assert CAPS["unpaywall"] == 12
    app = create_provider_app("unpaywall", "fixture", state_dir=tmp_path, fixture_delay=0)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://unpaywall.test"
    ) as client:
        bodies = [
            {
                "operation_id": f"op-{i}",
                "run_id": "one-auto-turn",
                "remaining_attempts": 1,
                "doi": f"10.1234/doi-{i}",
            }
            for i in range(13)
        ]
        receipts = [await client.post("/operations/access", json=body) for body in bodies]
        assert [receipt.status_code for receipt in receipts] == [200] * 12 + [429]
        assert receipts[-1].json()["code"] == "ATTEMPT_LIMIT"
        assert receipts[-1].json()["attempts"] == 0
        replay = await client.post("/operations/access", json=bodies[0])
        assert replay.status_code == 200 and replay.json()["replayed"] is True
