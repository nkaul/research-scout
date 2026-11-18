"""Shared AI-plan provenance and bounded background context, using model doubles."""

import asyncio
import copy
import json

import pytest
from plan_fixtures import CONTEXT_EXPANSION, RESOURCE_QUERIES, saved_shared_plan
from pydantic import ValidationError
from test_agentic_retrieval import PLAN, finish, review, send
from test_agentic_retrieval import harness as harness
from test_generation import finished, saved_live_record, terminal_event
from test_generation import generation_core as generation_core
from test_generation import send as send_generation

from research_scout.contracts import TurnRequest
from research_scout.core import ApplicationError
from research_scout.dataset_contracts import DatasetSearchRequest
from research_scout.datasets import problem_context
from research_scout.generation import GenerationConfig, GenerationError, GenerationService
from research_scout.planning import (
    generation_research_context,
    shared_plan_fingerprint,
    validated_shared_plan,
)
from research_scout.retrieval import SearchPlan


def complete_plan(**changes):
    return {
        **copy.deepcopy(PLAN),
        "provider_queries": [
            {
                "provider": "openalex",
                "lexical_query": "distinct paper provider query",
                "semantic_query": "Provider-specific scholarly search",
                "rationale": "Scoped scholarly syntax",
            }
        ],
        **changes,
    }


def test_nested_wire_schema_is_strict_required_nullable_and_bounded():
    schema = SearchPlan.model_json_schema()
    for shape in [schema, *schema["$defs"].values()]:
        if shape.get("type") == "object":
            assert shape["additionalProperties"] is False
            assert set(shape["required"]) == set(shape["properties"])
    assert schema["$defs"]["ResourceQuery"]["properties"]["lexical_query"]["maxLength"] == 200
    assert schema["$defs"]["InformationGap"]["properties"]["essential"]["type"] == "boolean"
    assert {"type": "null"} in schema["properties"]["resource_queries"]["anyOf"]
    assert (
        len(json.dumps(complete_plan())) // 3 < 2600
    )  # Authored compact example, not a tokenizer claim.
    for change in (
        {"resource_queries": None},
        {"resource_queries": {**RESOURCE_QUERIES, "extra": {}}},
        {
            "context_expansion": {
                **CONTEXT_EXPANSION,
                "missing_information": [
                    {"topic": "Domain", "question": "Which domain?", "essential": True}
                ],
            }
        },
    ):
        with pytest.raises(ValidationError):
            SearchPlan.model_validate(complete_plan(**change))
    for terms in ([], ["   "], ["query\nsyntax"]):
        altered = copy.deepcopy(RESOURCE_QUERIES)
        altered["repos"]["query_terms"] = terms
        with pytest.raises(ValidationError):
            SearchPlan.model_validate(complete_plan(resource_queries=altered))
    unresolved = SearchPlan.model_validate(
        complete_plan(
            resource_queries=None,
            needs_clarification=True,
            clarification_question="Do you mean machine learning or pharmacy?",
            context_expansion={**CONTEXT_EXPANSION, "domain_basis": "ambiguous"},
        )
    )
    assert unresolved.resource_queries is None


def test_lane_context_uses_own_model_query_and_rejects_legacy_or_tampered_plans():
    retrieval = saved_shared_plan(
        {
            "status": "completed",
            "intent": PLAN["intent"],
            "domain": PLAN["domain"],
            "lexical_query": PLAN["lexical_query"],
            "keywords": PLAN["query_terms"],
            "tags": PLAN["tags"],
        }
    )
    turn = {
        "id": "t",
        "message": "Original user problem",
        "action": "discover",
        "agentic": True,
        "retrieval": retrieval,
    }
    for lane in ("datasets", "repos"):
        context = problem_context({"id": "c"}, turn, lane)
        assert context["query"] == RESOURCE_QUERIES[lane]["lexical_query"]
        assert context["query"] != retrieval["lexical_query"]
        assert context["canonical_query"] == retrieval["lexical_query"]
        assert context["query_origin"] == "saved_model_resource_query"
        assert context["retrieval_keywords"] == RESOURCE_QUERIES[lane]["query_terms"]
    legacy = copy.deepcopy(turn)
    legacy["retrieval"].pop("shared_plan")
    with pytest.raises(ValueError, match="historical search"):
        problem_context({"id": "c"}, legacy)
    assert generation_research_context("c", legacy) is None
    tampered = copy.deepcopy(turn)
    tampered["retrieval"]["resource_queries"]["datasets"]["lexical_query"] = "Unreviewed later edit"
    with pytest.raises(ValueError, match="historical search"):
        problem_context({"id": "c"}, tampered)
    for field in ({"needs_clarification": True}, {"status": "clarification_needed"}):
        with pytest.raises(ValueError, match="clarification"):
            validated_shared_plan({**retrieval, **field})


@pytest.mark.asyncio
async def test_provider_repairs_never_replace_shared_canonical_or_resource_queries(harness):
    plan = complete_plan(
        provider_queries=[
            {
                "provider": provider,
                "lexical_query": f"{provider} language models retrieval",
                "semantic_query": "Independent provider-specific retrieval query",
                "rationale": "Respect this source query strategy",
            }
            for provider in ["openalex", "crossref"]
        ]
    )
    core, provider_calls, model_calls = harness(
        [plan, review(refine=True), review(refine=True), review(), review()]
    )
    conversation, _ = await send(core, providers=["openalex", "crossref"])
    turn = await finish(core, conversation)
    retrieval = turn["retrieval"]
    assert turn["status"] == "SUCCEEDED"
    assert retrieval["lexical_query"] == plan["lexical_query"]
    assert retrieval["semantic_query"] == plan["semantic_query"]
    assert (
        retrieval["current_provider_query"]["lexical_query"]
        == "retrieval augmented generation context selection"
    )
    assert retrieval["resource_queries"] == plan["resource_queries"]
    assert retrieval["shared_plan"]["fingerprint"] == shared_plan_fingerprint(retrieval)
    assert len(model_calls) == 5 and len(provider_calls) == 4
    assert all(
        "dataset" not in call["provider"] and call["provider"] != "github"
        for call in provider_calls
    )
    core.retrieval.config.enabled = False
    gate = asyncio.Event()

    async def pause(*args, **kwargs):
        await gate.wait()

    core.datasets.specialist_runner = pause
    created = await core.datasets.create(
        DatasetSearchRequest(
            conversation_id=conversation["id"],
            turn_id=turn["id"],
            idempotency_key="reuse-shared-model-plan",
        )
    )
    assert created["context"]["query"] == RESOURCE_QUERIES["datasets"]["lexical_query"]
    assert len(model_calls) == 5
    await core.datasets.cancel(created["id"])
    await core.conversations.store.mutate(
        conversation["id"], lambda saved: saved["turns"][0]["retrieval"].pop("shared_plan")
    )
    replay = await core.datasets.create(
        DatasetSearchRequest(
            conversation_id=conversation["id"],
            turn_id=turn["id"],
            idempotency_key="reuse-shared-model-plan",
        )
    )
    assert replay["id"] == created["id"] and replay["status"] == "CANCELLED"
    with pytest.raises(ApplicationError, match="historical search"):
        await core.datasets.create(
            DatasetSearchRequest(
                conversation_id=conversation["id"],
                turn_id=turn["id"],
                idempotency_key="legacy-new-query",
            )
        )
    assert len(model_calls) == 5


@pytest.mark.asyncio
async def test_clarification_halts_all_acquisition_and_next_call_sees_the_saved_question(harness):
    ambiguous = complete_plan(
        needs_clarification=True,
        clarification_question="Do you mean language model context or a clinical context model?",
        resource_queries=None,
        context_expansion={
            **CONTEXT_EXPANSION,
            "domain_basis": "ambiguous",
            "missing_information": [
                {"topic": "Domain", "question": "Which of these two domains?", "essential": True}
            ],
        },
    )
    core, calls, model_calls = harness([ambiguous, PLAN, review()])
    conversation, _ = await send(core)
    first = await finish(core, conversation)
    assert first["retrieval"]["status"] == "clarification_needed" and not calls
    with pytest.raises(ApplicationError, match="AI-refined"):
        await core.datasets.create(
            DatasetSearchRequest(
                conversation_id=conversation["id"],
                turn_id=first["id"],
                idempotency_key="no-unresolved-data",
            )
        )
    assert generation_research_context(conversation["id"], first) is None
    saved = await core.conversations.get(conversation["id"])
    await core.conversations.submit(
        conversation["id"],
        TurnRequest(
            message="The former: language models",
            action="discover",
            agentic=True,
            expected_revision=saved["revision"],
            idempotency_key="clarification-reply",
        ),
    )
    await finish(core, conversation)
    data = json.loads(model_calls[1]["input"][0]["content"][0]["text"])
    prior = data["prior_research_context"][-1]
    assert prior["turn_id"] == first["id"]
    assert prior["clarification_question"] == ambiguous["clarification_question"]
    assert prior["intent_frame"] == PLAN["intent_frame"]
    assert len(model_calls) == 3 and len(calls) == 1


def test_generation_background_is_non_citable_bounded_and_keeps_exact_current_question(tmp_path):
    service = GenerationService(tmp_path, config=GenerationConfig(enabled=True, api_key="authored"))
    context = {
        "origin": "saved_model_shared_plan",
        "intent": "A disclosed assumption",
        "evidence_status": "task_background_only_not_citable",
    }
    records = [
        {
            "provider": "crossref",
            "run_id": "r",
            "source_ref": "crossref:one",
            "version": "v1",
            "mode": "live",
            "title": "Actual saved source",
            "abstract": "Recorded abstract evidence",
        }
    ]
    payload, admitted, _ = service.prepare(
        "Compare evidence for my exact current request", records, research_context=context
    )
    data = json.loads(payload["input"][0]["content"][0]["text"])
    assert data["question"] == "Compare evidence for my exact current request"
    assert data["research_context"] == context
    assert len(admitted) == 1 and [item["label"] for item in data["sources"]] == ["S1"]
    assert "never scientific evidence or a citation source" in payload["instructions"]
    with pytest.raises(GenerationError, match="bounded generation context"):
        service.prepare("Exact request", records, research_context={"intent": "x" * 12000})


@pytest.mark.asyncio
async def test_generation_background_tracks_exact_source_turn_past_unrelated_newer_plan(
    generation_core,
):
    payloads = []

    async def stream(payload):
        payloads.append(payload)
        yield {
            "type": "response.output_text.delta",
            "delta": "The saved metadata identifies this source [S1].",
        }
        yield terminal_event()

    core, calls = generation_core(stream)
    conversation = await saved_live_record(core)
    origin_id = conversation["turns"][0]["id"]

    def add_history(saved):
        origin = saved["turns"][0]
        origin.update(
            action="discover",
            agentic=True,
            retrieval=saved_shared_plan(
                {
                    "status": "completed",
                    "intent": "Evaluate language model context",
                    "domain": "Machine learning",
                    "lexical_query": "language model context",
                    "tags": ["RAG"],
                }
            ),
        )
        unrelated = copy.deepcopy(origin)
        unrelated.update(id="unrelated-later-plan", message="A different climate research question")
        unrelated["sources"][0].update(
            run_id="unrelated-run", source_ref="crossref:unrelated", version="different-version"
        )
        unrelated["retrieval"] = saved_shared_plan(
            {
                "status": "completed",
                "intent": "Study climate extremes",
                "domain": "Climate science",
                "lexical_query": "climate extremes",
                "tags": ["climate"],
            }
        )
        saved_view = copy.deepcopy(origin)
        saved_view.update(id="saved-earlier-source", action="saved", agentic=False)
        saved_view.pop("retrieval")
        saved["turns"].extend([unrelated, saved_view])

    await core.conversations.store.mutate(conversation["id"], add_history)
    conversation = await core.conversations.get(conversation["id"])
    provider_count = len(calls)
    await send_generation(
        core, conversation, "generate", message="Explain only what this pinned source establishes"
    )
    result = (await finished(core, conversation["id"]))["turns"][-1]
    assert result["status"] == "SUCCEEDED"
    assert len(calls) == provider_count and len(payloads) == 1
    data = json.loads(payloads[0]["input"][0]["content"][0]["text"])
    assert data["question"] == "Explain only what this pinned source establishes"
    assert data["research_context"]["turn_id"] == origin_id
    assert data["research_context"]["intent"] == "Evaluate language model context"
    assert "climate" not in json.dumps(data["research_context"]).lower()
    assert result["generation"]["research_context"] == data["research_context"]
    assert len(data["sources"]) == len(result["citations"]) == 1
