"""Authored model/provider doubles: graph/relevance contracts, not live quality claims."""

import asyncio
import json

import httpx
import pytest

from research_scout.agents import run_discovery
from research_scout.contracts import ConversationRequest, Filters, ResearchRequest, TurnRequest
from research_scout.core import ApplicationError, Core, Settings
from research_scout.generation import MODEL
from research_scout.providers.normalization import source
from research_scout.relevance import rank_candidates
from research_scout.retrieval import RetrievalConfig, SearchPlan

QUESTION = (
    "What's the impact of how we improve the context model needs to have for better generation?"
)
PLAN = {
    "intent": "Improve evidence context for language model generation",
    "domain": "Machine learning and natural language processing",
    "intent_frame": {
        "object_of_change": "Context supplied to language models",
        "intervention": "Select and organize evidence",
        "desired_outcome": "Better generated answers",
        "boundary": "Model architecture alone is adjacent",
    },
    "tags": ["context engineering", "RAG"],
    "lexical_query": "language models context engineering",
    "semantic_query": "How does context selection improve language model generation?",
    "query_terms": ["language models", "context", "retrieval"],
    "required_facets": [{"name": "language models", "terms": ["language model", "LLM"]}],
    "optional_facets": [{"name": "context", "terms": ["context", "retrieval"]}],
    "assumptions": ["Generation means language model output"],
    "rationale": "Use technical domain terms rather than conversational filler.",
    "needs_clarification": False,
    "clarification_question": "",
}


def test_wire_schema_and_local_list_item_limits_agree():
    schema = SearchPlan.model_json_schema()
    assert schema["properties"]["assumptions"]["items"]["maxLength"] == 240
    assert schema["properties"]["query_terms"]["items"]["maxLength"] == 160
    assert schema["$defs"]["Facet"]["properties"]["terms"]["items"]["maxLength"] == 80
    assert SearchPlan.model_validate(
        {
            **PLAN,
            "assumptions": ["A" * 200],
            "provider_queries": [
                {
                    "provider": "openalex",
                    "lexical_query": PLAN["lexical_query"],
                    "semantic_query": PLAN["semantic_query"],
                    "rationale": "Authored provider strategy",
                }
            ],
        }
    ).assumptions


def completion(value):
    return {
        "model": MODEL,
        "status": "completed",
        "service_tier": "default",
        "usage": {"input_tokens": 200, "output_tokens": 100},
        "output": [
            {"type": "message", "content": [{"type": "output_text", "text": json.dumps(value)}]}
        ],
    }


def review(*, refine=False, bad_id=False, all_irrelevant=False):
    return {
        "assessments": [
            {
                "candidate_id": "C3" if bad_id else "C1",
                "label": "irrelevant",
                "reason": "Pharmacy leadership, unrelated to language models.",
                "evidence_quote": "",
            },
            {
                "candidate_id": "C2",
                "label": "irrelevant" if all_irrelevant else "relevant",
                "reason": "Studies context retrieval for language model generation.",
                "evidence_quote": "Context retrieval for language models",
            },
        ],
        "refine": refine,
        "lexical_query": "retrieval augmented generation context selection",
        "semantic_query": "Evidence selection for retrieval augmented language model generation",
        "reason": "Focus the next search on evidence selection.",
    }


@pytest.fixture
async def harness(tmp_path):
    resources = []

    def make(outputs, *, delay=0, enabled=True, strong_openalex=False, empty_metadata=False):
        calls, model_calls = [], []

        async def dispatch(request):
            body = json.loads(request.content)
            calls.append(body)
            provider = body["provider"]
            round_two = body["lexical_query"] == "retrieval augmented generation context selection"
            rows = [
                source(
                    provider,
                    "pharmacy",
                    "live",
                    title="The next generation pharmacist",
                    abstract="Leadership in pharmacy",
                    year=2024,
                    resource_type="article",
                ),
                source(
                    provider,
                    "context-2" if round_two else "context-1",
                    "live",
                    title="Context retrieval for language models",
                    abstract="Evidence selection improves LLM generation",
                    year=2024,
                    resource_type="article",
                ),
            ]
            if strong_openalex and provider == "openalex":
                rows = [
                    source(
                        provider,
                        f"context-{index}",
                        "live",
                        title=f"Language model context retrieval {index}",
                        abstract="Context engineering and LLM generation",
                        year=2024,
                        resource_type="article",
                    )
                    for index in range(5)
                ]
            if empty_metadata:
                rows[-1].update(title=None, abstract=None)
            events = [
                {"kind": "usage", "attempts": 1},
                {"kind": "branch.started", "branch": "lexical"},
            ]
            events += [
                {"kind": "source", "branch": "lexical", "rank": i, "record": row}
                for i, row in enumerate(rows, 1)
            ]
            events += [
                {
                    "kind": "branch.completed",
                    "branch": branch,
                    "count": len(rows) if branch == "lexical" else 0,
                }
                for branch in ["lexical", "semantic"]
            ]
            events.append({"kind": "complete", "attempts": 1})
            return httpx.Response(200, text="\n".join(json.dumps(event) for event in events))

        async def requester(payload):
            model_calls.append(payload)
            if delay:
                await asyncio.sleep(delay)
            value = outputs[len(model_calls) - 1]
            if isinstance(value, Exception):
                raise value
            if (
                payload["text"]["format"]["name"] == "SearchPlan"
                and "provider_queries" not in value
            ):
                data = json.loads(payload["input"][0]["content"][0]["text"])
                value = {
                    **value,
                    "provider_queries": [
                        {
                            "provider": provider,
                            "lexical_query": PLAN["lexical_query"]
                            if provider == "openalex"
                            else "language models retrieval augmented generation",
                            "semantic_query": PLAN["semantic_query"],
                            "rationale": "Authored independent provider query",
                        }
                        for provider in (
                            data["selected_providers"] or data["eligible_providers"][:4]
                        )
                    ],
                }
            return completion(value)

        client = httpx.AsyncClient(transport=httpx.MockTransport(dispatch))
        core = Core(
            Settings(state_dir=tmp_path / str(len(resources)), mode="live", model_mode="disabled"),
            client=client,
            retrieval_config=RetrievalConfig(enabled=enabled, api_key="authored"),
            retrieval_requester=requester,
        )

        async def agent(**kwargs):
            return await run_discovery(
                **kwargs, search_callback=core.search_papers, mode="disabled"
            )

        core.agent_runner = agent
        resources.append((core, client))
        return core, calls, model_calls

    yield make
    for core, client in resources:
        await core.close()
        await client.aclose()


async def send(core, providers=None):
    conversation = await core.conversations.create(
        ConversationRequest(
            providers=providers or ["openalex"], filters=Filters(year_from=2024, year_to=2025)
        )
    )
    request = TurnRequest(
        message=QUESTION,
        agentic=True,
        expected_revision=conversation["revision"],
        idempotency_key="one",
    )
    await core.conversations.submit(conversation["id"], request)
    return conversation, request


async def finish(core, conversation):
    for _ in range(600):
        saved = await core.conversations.get(conversation["id"])
        if saved["status"] == "IDLE" and core.active_turn is None:
            return saved["turns"][0]
        await asyncio.sleep(0.01)
    pytest.fail("Bounded authored retrieval did not terminate")


@pytest.mark.asyncio
async def test_plan_review_repair_real_graph_preserves_question_filters_and_replays(harness):
    core, calls, model_calls = harness([PLAN, review(refine=True), review()])
    conversation, request = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "SUCCEEDED", turn
    assert turn["retrieval"]["round"] == 2
    assert len(calls) == 2 and len(model_calls) == 3
    assert all(body["query"] == QUESTION for body in calls)
    assert calls[0]["lexical_query"] == PLAN["lexical_query"]
    assert calls[1]["lexical_query"] != calls[0]["lexical_query"]
    assert all(body["filters"]["year_from"] == 2024 for body in calls)
    assert len(turn["sources"]) == 2
    fresh = rank_candidates(turn["sources"], {**PLAN, "query": PLAN["semantic_query"]})
    assert {r["source_ref"]: r["relevance"]["score"] for r in turn["sources"]} == {
        r["source_ref"]: r["relevance"]["score"] for r in fresh
    }
    assert all(item["relevance"]["label"] == "relevant" for item in turn["sources"])
    assert turn["retrieval"]["rejected_count"] == 2
    assert turn["usage"]["research_attempts"] == 2
    assert turn["usage"]["model_http_attempts"] == 3
    assert len(turn["run_ids"]) == 2
    first = await core.get(turn["run_ids"][0])
    assert first["question"] == QUESTION
    assert first["plan"]["actual_queries"]["semantic"] == PLAN["semantic_query"]
    assert len(first["entities"]) == 2  # rejected observation retained unchanged
    assert core.generation.committed_cost() < 0.05
    replay = await core.conversations.submit(conversation["id"], request)
    assert replay["turns"][0] == turn
    assert len(model_calls) == 3 and len(calls) == 2
    for payload in model_calls:
        assert payload["store"] is False and payload["tools"] == []
        assert payload["text"]["format"]["strict"] is True


@pytest.mark.asyncio
async def test_two_provider_progressive_reviewed_batches_and_five_call_ceiling(harness):
    core, calls, model_calls = harness(
        [PLAN, review(refine=True), review(refine=True), review(refine=True), review(refine=True)],
        delay=0.02,
    )
    conversation, _ = await send(core, ["openalex", "crossref"])
    saw_early = False
    for _ in range(600):
        saved = await core.conversations.get(conversation["id"])
        if saved["turns"][0]["sources"] and saved["status"] == "RUNNING":
            saw_early = True
            assert all(
                source["relevance"]["label"] != "irrelevant"
                for source in saved["turns"][0]["sources"]
            )
        if saved["status"] == "IDLE":
            break
        await asyncio.sleep(0.005)
    turn = await finish(core, conversation)
    assert saw_early and turn["status"] == "SUCCEEDED"
    assert len(model_calls) == 5 and len(calls) == 4
    assert [body["provider"] for body in calls] == ["openalex", "crossref"] * 2
    assert len(turn["activity"]) == 5
    assert turn["activity"][-1]["provider"] == "openai"
    assert turn["activity"][-1]["attempts"] == 5
    assert turn["usage"]["research_attempts"] == 4
    assert turn["retrieval"]["round"] == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["unknown_id", "transport", "malformed_plan"])
async def test_failure_does_not_publish_unreviewed_or_fallback(harness, bad):
    outputs = (
        [PLAN, review(bad_id=True)]
        if bad == "unknown_id"
        else [PLAN, RuntimeError("private body")]
        if bad == "transport"
        else [{**PLAN, "provider": "other"}]
    )
    core, calls, model_calls = harness(outputs)
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "FAILED"
    assert turn["sources"] == []
    assert len(calls) == (0 if bad == "malformed_plan" else 1)
    assert len(model_calls) <= 2
    assert "private body" not in json.dumps(turn)
    assert (core.generation.committed_cost() >= 0.05) == (bad == "transport")


@pytest.mark.asyncio
async def test_clarification_no_research_or_answer_generation(harness):
    core, calls, model_calls = harness(
        [
            {
                **PLAN,
                "needs_clarification": True,
                "clarification_question": "Do you mean language models or another scientific domain?",
            }
        ]
    )
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "EMPTY"
    assert turn["retrieval"]["status"] == "clarification_needed"
    assert "Do you mean" in turn["response"]
    assert not calls and len(model_calls) == 1


@pytest.mark.asyncio
async def test_zero_relevance_is_valid_empty_and_no_unbounded_loop(harness):
    core, calls, model_calls = harness(
        [PLAN, review(refine=True, all_irrelevant=True), review(refine=True, all_irrelevant=True)]
    )
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "EMPTY" and not turn["sources"]
    assert len(calls) == 2 and len(model_calls) == 3


@pytest.mark.asyncio
async def test_cancel_fences_model_response_and_retains_unknown_hold(harness):
    core, calls, model_calls = harness([PLAN], delay=0.3)
    conversation, _ = await send(core)
    for _ in range(100):
        if model_calls:
            break
        await asyncio.sleep(0.005)
    current = await core.conversations.get(conversation["id"])
    await core.conversations.cancel(conversation["id"], current["turns"][0]["id"])
    turn = await finish(core, conversation)
    assert turn["status"] == "CANCELLED" and turn["retrieval"]["status"] == "cancelled"
    assert not calls and len(model_calls) == 1 and not turn["sources"]
    assert core.generation.committed_cost() == 0.05


@pytest.mark.asyncio
async def test_disabled_gate_and_query_idempotency(harness):
    core, calls, model_calls = harness([], enabled=False)
    with pytest.raises(ApplicationError, match="disabled"):
        await send(core)
    assert not calls and not model_calls
    request = ResearchRequest(question=QUESTION, provider="openalex", idempotency_key="internal")
    await core.create(
        request,
        launch=False,
        search_queries={"lexical": "context engineering", "semantic": "language model context"},
    )
    with pytest.raises(ApplicationError, match="different request"):
        await core.create(
            request,
            launch=False,
            search_queries={"lexical": "different context", "semantic": "language model context"},
        )


@pytest.mark.asyncio
async def test_cancel_after_dispatch_journal_before_request_is_fenced(harness):
    core, calls, model_calls = harness([PLAN])
    original_usage = core.retrieval._usage

    async def cancel_in_window(state):
        await original_usage(state)
        await core.conversations._edit(
            state["conversation_id"],
            state["turn_id"],
            lambda turn: turn.update(status="CANCELLED"),
            "authored.cancel",
        )

    core.retrieval._usage = cancel_in_window
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "CANCELLED" and not calls and not model_calls
    assert core.generation.committed_cost() == 0.05  # conservative durable dispatch intent


@pytest.mark.asyncio
async def test_generation_keeps_exact_reviewed_version_after_details_change(harness):
    core, _, _ = harness([PLAN, review()])
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    admitted = turn["sources"][0]

    def detail_update(run):
        current = next(
            item for item in run["entities"] if item["source_ref"] == admitted["source_ref"]
        )
        current.update(
            version="new-unreviewed-version", abstract="New content not seen by the reviewer"
        )

    await core.store.mutate(admitted["run_id"], detail_update)
    evidence = await core.conversations._saved_abstract_evidence([admitted])
    assert evidence[0]["version"] == admitted["version"]
    assert evidence[0]["abstract"] == admitted["abstract"]
    assert evidence[0]["evidence_source"] == "saved_reviewed_observation"


@pytest.mark.asyncio
async def test_good_openalex_results_do_not_hide_weak_crossref_repair(harness):
    good = {
        **review(),
        "assessments": [
            {
                "candidate_id": f"C{i}",
                "label": "relevant",
                "reason": "Directly studies language model context.",
                "evidence_quote": "Language model context retrieval",
            }
            for i in range(1, 6)
        ],
    }
    core, calls, model_calls = harness(
        [PLAN, good, review(refine=True), review()], strong_openalex=True
    )
    conversation, _ = await send(core, ["openalex", "crossref"])
    turn = await finish(core, conversation)
    assert turn["status"] == "SUCCEEDED", turn
    assert [body["provider"] for body in calls] == ["openalex", "crossref", "crossref"]
    assert calls[0]["lexical_query"] != calls[1]["lexical_query"]
    assert calls[1]["lexical_query"] != calls[2]["lexical_query"]
    entry = core.generation.ledger["entries"][f"{conversation['id']}:{turn['id']}:retrieval"]
    assert set(entry["steps"]) == {"plan", "review1:0", "review1:1", "review2:1"}
    assert len(model_calls) == 4
    assert turn["retrieval"]["provider_quality"]["openalex"]["status"] == "sufficient"
    assert turn["retrieval"]["provider_quality"]["crossref"]["round"] == 2
    assert [item["provider"] for item in turn["retrieval"]["query_history"]] == [
        "openalex",
        "crossref",
        "crossref",
    ]


@pytest.mark.asyncio
async def test_adjacent_and_unknown_stay_out_of_primary_and_legacy_generation(harness):
    mixed = {
        **review(),
        "assessments": [
            {
                "candidate_id": "C1",
                "label": "partial",
                "reason": "Adjacent only.",
                "evidence_quote": "",
            },
            {
                "candidate_id": "C2",
                "label": "unknown",
                "reason": "Insufficient evidence.",
                "evidence_quote": "",
            },
        ],
    }
    core, calls, model_calls = harness([PLAN, mixed])
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "EMPTY" and turn["sources"] == []
    assert len(turn["related_sources"]) == 2
    assert {s["relevance"]["label"] for s in turn["related_sources"]} == {"partial", "unknown"}
    assert len(calls) == 1 and len(model_calls) == 2
    # An older v1 saved turn may have mixed these into sources; do not feed them
    # to the answer writer just because they predate the publication correction.
    await core.conversations.store.mutate(
        conversation["id"], lambda d: d["turns"][0].update(sources=turn["related_sources"])
    )
    core.generation.config.enabled, core.generation.config.api_key = True, "authored"
    current = await core.conversations.get(conversation["id"])
    with pytest.raises(ApplicationError, match="Search or look up a live source"):
        await core.conversations.submit(
            conversation["id"],
            TurnRequest(
                message="Explain evidence",
                action="generate",
                expected_revision=current["revision"],
                idempotency_key="no-related-writer",
            ),
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("provider_ids", [["crossref"], ["openalex", "openalex"]])
async def test_planner_cannot_change_or_duplicate_provider_scope(harness, provider_ids):
    plan = {
        **PLAN,
        "provider_queries": [
            {
                "provider": name,
                "lexical_query": PLAN["lexical_query"],
                "semantic_query": PLAN["semantic_query"],
                "rationale": "Authored invalid scope",
            }
            for name in provider_ids
        ],
    }
    core, calls, model_calls = harness([plan])
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "FAILED" and not calls and len(model_calls) == 1


@pytest.mark.asyncio
async def test_unobservable_record_cannot_become_primary_despite_model_verdict(harness):
    core, _, _ = harness([PLAN, review()], empty_metadata=True)
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert turn["status"] == "EMPTY" and not turn["sources"]
    assert len(turn["related_sources"]) == 1
    assert turn["related_sources"][0]["relevance"]["label"] == "unknown"
    assert "No title or content" in turn["related_sources"][0]["relevance"]["reason"]


@pytest.mark.asyncio
async def test_visible_prompt_audit_matches_model_body_and_preserves_extracted_terms(harness):
    core, calls, model_calls = harness([PLAN, review()])
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    retrieval = turn["retrieval"]
    assert [entry["body"] for entry in retrieval["llm_requests"]] == model_calls
    assert all(entry["status"] == "response_received" for entry in retrieval["llm_requests"])
    assert retrieval["keywords"] == PLAN["query_terms"] and retrieval["tags"] == PLAN["tags"]
    assert retrieval["intent_frame"] == PLAN["intent_frame"]
    assert all("headers" not in entry["body"] for entry in retrieval["llm_requests"])
    reviewer_input = json.loads(model_calls[1]["input"][0]["content"][0]["text"])
    assert "minimum_direct_results" not in reviewer_input
    assert "never raise grades to fill a quota" in model_calls[1]["instructions"]
    assert reviewer_input["executed_query"]["lexical_query"] == calls[0]["lexical_query"]
    assert retrieval["source_requests"][0]["query_input"] == calls[0]["lexical_query"]


@pytest.mark.asyncio
async def test_model_cannot_invent_a_supporting_quote_to_enter_primary_results(harness):
    unsupported = review()
    unsupported["assessments"][1]["evidence_quote"] = "Invented study of context improving quality"
    core, _, _ = harness([PLAN, unsupported])
    conversation, _ = await send(core)
    turn = await finish(core, conversation)
    assert not turn["sources"] and turn["status"] == "EMPTY"
    assert turn["related_sources"][0]["relevance"]["label"] == "unknown"
    assert "no exact supporting text" in turn["related_sources"][0]["relevance"]["reason"]


@pytest.mark.asyncio
async def test_automatic_agent_selects_four_eligible_routes_without_user_selection(harness):
    outputs = [PLAN, review(), review(), review(), review()]
    core, calls, model_calls = harness(outputs)
    selected = ["openalex", "crossref", "arxiv", "openaire"]

    async def healthy():
        return {
            "providers": [
                {
                    "id": name,
                    "provider": name,
                    "mode": "live",
                    "status": "ready" if name in selected or name == "unpaywall" else "unavailable",
                    "access_configured": name in selected or name == "unpaywall",
                    "capabilities": {"search": name in selected, "access": name == "unpaywall"},
                }
                for name in core.settings.provider_modes
            ]
        }

    core.providers = healthy
    conversation = await core.conversations.create(
        ConversationRequest(routing="auto", filters=Filters(year_from=2024))
    )
    await core.conversations.submit(
        conversation["id"],
        TurnRequest(
            message=QUESTION,
            routing="auto",
            agentic=True,
            expected_revision=conversation["revision"],
            idempotency_key="automatic",
        ),
    )
    turn = await finish(core, conversation)
    assert turn["status"] == "SUCCEEDED", turn
    assert turn["routing"] == "auto" and turn["providers"] == selected
    assert [body["provider"] for body in calls] == selected
    assert len(model_calls) == 5 and len(turn["papers"]) == 4
    assert all(
        paper["representative"]["relevance"]["label"] == "relevant" for paper in turn["papers"]
    )
    assert {
        resource["provider"] for resource in turn["source_plan"] if resource["status"] == "selected"
    } == set(selected)
    assert (
        next(resource for resource in turn["source_plan"] if resource["provider"] == "unpaywall")[
            "role"
        ]
        == "access"
    )
    first_input = json.loads(model_calls[0]["input"][0]["content"][0]["text"])
    assert (
        first_input["selected_providers"] is None and first_input["eligible_providers"] == selected
    )
    ledger = core.generation.ledger["entries"][f"{conversation['id']}:{turn['id']}:retrieval"]
    assert ledger["provider_count"] == 4 and ledger["max_http_attempts"] == 9


def test_optional_refinement_defers_when_remaining_grant_cannot_fit():
    from research_scout.retrieval import RetrievalService

    state = {
        "repairs": {
            "crossref": {"lexical_query": "refined context", "semantic_query": "refined question"}
        },
        "provider_plans": {
            "crossref": {"lexical_query": "old context", "semantic_query": "old question"}
        },
    }
    turn = {
        "providers": ["crossref"],
        "sources": [],
        "_operations": {"spent": {"attempts": 23, "hold": 0}},
    }
    assert RetrievalService._refinement_providers(state, turn, apply_budget=False) == ["crossref"]
    assert RetrievalService._refinement_providers(state, turn) == []
