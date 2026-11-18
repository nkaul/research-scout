"""Resource caps and phased structured output, using authored provider/model doubles."""

import copy

import httpx
import pytest
from pydantic import ValidationError
from test_agentic_retrieval import PLAN, finish, review, send
from test_agentic_retrieval import harness as harness

from research_scout.contracts import (
    ConversationRequest,
    ModalityLimits,
    ResearchRequest,
    TurnRequest,
)
from research_scout.core import Core, Settings
from research_scout.modalities import initial_jobs, select_canonical
from research_scout.providers.service import create_provider_app


def test_modality_limits_are_strict_finite_and_cannot_disable_every_lane():
    assert ModalityLimits().model_dump() == {
        "papers": 20,
        "videos": 10,
        "datasets": 10,
        "repos": 10,
    }
    for changes in (
        {"papers": True},
        {"papers": 21},
        {"videos": -1},
        {"repos": 1.5},
        {"datasets": "10"},
        {"unknown": 1},
        dict.fromkeys(["papers", "videos", "datasets", "repos"], 0),
    ):
        with pytest.raises(ValidationError):
            ModalityLimits.model_validate(changes)


@pytest.mark.asyncio
async def test_explicit_final_answer_excludes_intermediate_commentary_without_another_call(harness):
    core, calls, models = harness([PLAN, review()])
    requester = core.retrieval.requester

    async def phased(payload):
        result = await requester(payload)
        final = result["output"][0]
        final["phase"] = "final_answer"
        result["output"].insert(
            0,
            {
                "type": "message",
                "phase": "commentary",
                "content": [{"type": "output_text", "text": "{intermediate non-final output"}],
            },
        )
        return result

    core.retrieval.requester = phased
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "SUCCEEDED" and len(turn["sources"]) == 1
    assert len(models) == 2 and len(calls) == 1
    assert core.generation.economics.get_economics()["used"] == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["commentary_only", "multiple_final"])
async def test_ambiguous_or_missing_explicit_final_fails_without_raw_fallback(harness, phase):
    core, calls, models = harness([PLAN])
    requester = core.retrieval.requester

    async def invalid(payload):
        result = await requester(payload)
        result["output"][0]["phase"] = (
            "commentary" if phase == "commentary_only" else "final_answer"
        )
        if phase == "multiple_final":
            result["output"].append(copy.deepcopy(result["output"][0]))
        return result

    core.retrieval.requester = invalid
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "FAILED" and not calls and len(models) == 1


@pytest.mark.asyncio
async def test_failed_paper_review_keeps_youtube_source_work_and_valid_review_independent(harness):
    core, calls, models = harness([PLAN, {**review(), "assessments": []}, review()])
    conversation = await core.conversations.create(
        ConversationRequest(providers=["openalex", "youtube"])
    )
    await core.conversations.submit(
        conversation["id"],
        TurnRequest(
            message="How does context selection improve language model generation?",
            agentic=True,
            modality_limits=ModalityLimits(papers=20, videos=10, datasets=0, repos=0),
            expected_revision=conversation["revision"],
            idempotency_key="independent-video",
        ),
    )
    turn = await finish(core, conversation)
    assert turn["status"] == "PARTIAL"
    assert [call["provider"] for call in calls] == ["openalex", "youtube"]
    assert len(models) == 3
    assert {source["provider"] for source in turn["sources"]} == {"youtube"}
    assert turn["resource_jobs"]["papers"]["status"] == "FAILED"
    assert turn["resource_jobs"]["videos"]["status"] == "SUCCEEDED"
    assert len(turn["related_sources"]) == 2
    assert all(source["relevance"]["label"] == "unknown" for source in turn["related_sources"])


@pytest.mark.asyncio
async def test_one_paper_limit_reaches_actual_provider_union_not_just_ui(tmp_path):
    app = create_provider_app("openalex", "fixture", state_dir=tmp_path / "provider")
    async with app.router.lifespan_context(app):
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app))
        core = Core(Settings(state_dir=tmp_path / "core"), client=client)
        try:
            created = await core.create(
                ResearchRequest(
                    question="retrieval language model",
                    provider="openalex",
                    paper_count=1,
                    idempotency_key="one-paper",
                ),
                launch=False,
            )
            await core.store.mutate(
                created["id"], lambda document: document.update(status="RUNNING")
            )
            result = await core.search_papers(created["id"])
            saved = await core.get(created["id"])
            assert saved["paper_count"] == saved["plan"]["candidate_limit_per_provider"] == 1
            assert saved["plan"]["raw_per_branch"] == 1
            assert len(saved["entities"]) <= 1
            assert len(result["candidate_refs"]) <= 1
        finally:
            await core.close()
            await client.aclose()


def test_canonical_cap_reports_overflow_with_provenance_and_keeps_observations():
    limits = {"papers": 1, "videos": 1, "datasets": 0, "repos": 0}
    turn = {
        "providers": ["openalex", "youtube"],
        "modality_limits": limits,
        "resource_jobs": initial_jobs(limits, ["openalex", "youtube"], agentic=False),
        "sources": [{"source_ref": "a"}, {"source_ref": "b"}],
    }
    papers = [
        {"paper_id": "one", "representative": {"provider": "openalex", "resource_type": "article"}},
        {"paper_id": "two", "representative": {"provider": "arxiv", "resource_type": "preprint"}},
        {"paper_id": "video", "representative": {"provider": "youtube", "resource_type": "video"}},
    ]
    selected = select_canonical(turn, papers)
    assert [paper["paper_id"] for paper in selected] == ["one", "video"]
    assert turn["resource_jobs"]["papers"]["eligible_count"] == 2
    assert turn["resource_jobs"]["papers"]["overflow_count"] == 1
    assert turn["result_selection"]["overflow_paper_ids"] == ["two"]
    assert len(turn["sources"]) == 2
