"""Authored SSE/model doubles: no hosted requests or paid generation in this suite."""

import asyncio
import json

import httpx
import pytest

from research_scout.contracts import ConversationRequest, ResearchRequest, TurnRequest
from research_scout.conversations import preview
from research_scout.core import ApplicationError, Core, Settings
from research_scout.generation import (
    MODEL,
    GenerationConfig,
    GenerationError,
    GenerationService,
    ResponsesStream,
)
from research_scout.providers.normalization import source


def terminal_event():
    return {
        "type": "response.completed",
        "response": {
            "status": "completed",
            "model": MODEL,
            "service_tier": "default",
            "usage": {"input_tokens": 120, "output_tokens": 30},
        },
    }


async def finished(core, conversation_id):
    for _ in range(300):
        snapshot = await core.conversations.get(conversation_id)
        if snapshot["status"] == "IDLE" and core.active_turn is None:
            return snapshot
        await asyncio.sleep(0.01)
    pytest.fail("Authored turn did not finish.")


async def send(
    core, conversation, action, key="generate-1", message="Explain what these records establish"
):
    return await core.conversations.submit(
        conversation["id"],
        TurnRequest(
            message=message,
            action=action,
            expected_revision=conversation["revision"],
            idempotency_key=key,
        ),
    )


@pytest.fixture
async def generation_core(tmp_path):
    resources = []

    def make(streamer, *, openalex_mode="fixture"):
        calls = []

        async def registry(request):
            calls.append(request)
            if request.url.path.endswith("agency"):
                return httpx.Response(
                    200,
                    json={
                        "provider": "crossref",
                        "mode": "live",
                        "attempts": 1,
                        "agency": "crossref",
                    },
                )
            doi = json.loads(request.content)["doi"]
            return httpx.Response(
                200,
                json={
                    "provider": "crossref",
                    "mode": "live",
                    "attempts": 1,
                    "record": source(
                        "crossref",
                        doi,
                        "live",
                        title="Authored upstream record for contract tests",
                        doi=doi,
                        year=2024,
                        resource_type="article",
                    ),
                },
            )

        client = httpx.AsyncClient(transport=httpx.MockTransport(registry))
        config = GenerationConfig(enabled=True, api_key="authored-test-credential")
        settings = Settings(
            state_dir=tmp_path / str(len(resources)),
            provider_modes={
                "openalex": openalex_mode,
                "crossref": "live",
                "datacite": "fixture",
                "semantic_scholar": "fixture",
            },
        )
        core = Core(settings, client=client, generation_config=config, generation_streamer=streamer)
        resources.append((core, client))
        return core, calls

    yield make
    for core, client in resources:
        await core.close()
        await client.aclose()


async def saved_live_record(core):
    conversation = await core.conversations.create(ConversationRequest())
    await send(core, conversation, "lookup", key="lookup-1", message="10.1234/authored")
    return await finished(core, conversation["id"])


@pytest.mark.asyncio
async def test_actual_stream_deltas_precede_completion_and_use_only_saved_sources(generation_core):
    release = asyncio.Event()
    payloads = []

    async def stream(payload):
        payloads.append(payload)
        yield {
            "type": "response.output_text.delta",
            "delta": "This record identifies a publication",
        }
        await release.wait()
        yield {
            "type": "response.output_text.delta",
            "delta": " [S1]. Its metadata cannot establish scientific findings.",
        }
        yield terminal_event()

    core, calls = generation_core(stream)
    conversation = await saved_live_record(core)
    assert payloads == []  # DOI lookup never invokes generation, even when configured.
    lookup_activity = conversation["turns"][0]["activity"]
    assert [
        (item["provider"], item["operation"], item["attempts"], item["source_count"])
        for item in lookup_activity
    ] == [("crossref", "agency", 1, 0), ("crossref", "metadata", 1, 1)]
    before = len(calls)
    accepted = await send(core, conversation, "generate")
    for _ in range(200):
        streaming = await core.conversations.get(conversation["id"])
        if streaming["turns"][-1]["response"]:
            break
        await asyncio.sleep(0.01)
    turn = streaming["turns"][-1]
    assert turn["status"] == "RUNNING"
    assert turn["generation"]["status"] == "streaming"
    assert turn["response"] == "This record identifies a publication"
    assert turn["usage"]["model_cost_usd"] is None
    release.set()
    completed = await finished(core, conversation["id"])
    answer = completed["turns"][-1]
    assert answer["status"] == "SUCCEEDED"
    assert len(calls) == before and len(payloads) == 1
    assert answer["generation"]["delta_events"] == 2
    assert answer["usage"]["model_http_attempts"] == 1
    assert answer["usage"]["model_cost_usd"] == pytest.approx(0.000030)
    assert answer["usage"]["model_cost_hold_usd"] == 0
    assert answer["citations"] == [
        {
            "label": "S1",
            "provider": "crossref",
            "run_id": "",
            "source_ref": answer["sources"][0]["source_ref"],
            "observation_version": answer["sources"][0]["version"],
        }
    ]
    assert answer["activity"] == [
        {
            "provider": "openai",
            "operation": "generation",
            "status": "completed",
            "attempts": 1,
            "source_count": 0,
        }
    ]
    payload = payloads[0]
    assert payload["stream"] is True and payload["store"] is False and payload["tools"] == []
    assert payload["model"] == MODEL and payload["reasoning"] == {"effort": "none"}
    assert payload["max_output_tokens"] == 800
    assert len(json.dumps(payload["input"]).encode()) < 12_000
    replay = await core.conversations.store.replay(conversation["id"], accepted["cursor"])
    assert any(event["data"]["type"] == "answer.delta" for event in replay)
    repeated = await send(core, conversation, "generate")
    assert repeated["turns"][-1]["id"] == answer["id"] and len(payloads) == 1


@pytest.mark.asyncio
async def test_unknown_citations_are_not_accepted_but_usage_is_settled(generation_core):
    async def stream(payload):
        yield {"type": "response.output_text.delta", "delta": "An invented claim [S99]."}
        yield terminal_event()

    core, _ = generation_core(stream)
    conversation = await saved_live_record(core)
    await send(core, conversation, "generate")
    answer = (await finished(core, conversation["id"]))["turns"][-1]
    assert answer["status"] == "PARTIAL"
    assert answer["generation"]["status"] == "invalid_citations"
    assert not answer.get("citations")
    assert answer["usage"]["model_cost_usd"] > 0
    assert answer["sources"][0]["provider"] == "crossref"


@pytest.mark.asyncio
async def test_repeated_generation_reuses_original_evidence_pool_without_retrieval(generation_core):
    payloads = []

    async def stream(payload):
        payloads.append(payload)
        yield {
            "type": "response.output_text.delta",
            "delta": "The supplied metadata identifies this record [S1].",
        }
        yield terminal_event()

    core, calls = generation_core(stream)
    conversation = await saved_live_record(core)
    template = conversation["turns"][0]["sources"][0]
    records = [
        {
            **template,
            "source_ref": f"crossref:10.1234/authored.{index}",
            "record_id": f"10.1234/authored.{index}",
            "doi": f"10.1234/authored.{index}",
            "title": f"Authored source-pool record {index}",
        }
        for index in range(14)
    ]
    conversation = await core.conversations.store.mutate(
        conversation["id"],
        lambda document: document["turns"][0].update(sources=records),
        "authored.saved_evidence",
    )
    before = len(calls)
    for index in range(2):
        await send(core, conversation, "generate", key=f"explicit-answer-{index}")
        conversation = await finished(core, conversation["id"])
        answer = conversation["turns"][-1]
        assert answer["status"] == "SUCCEEDED"
        assert len(answer["sources"]) == 6
        assert answer["plan"]["omitted_source_count"] == 8
        assert answer["generation"]["omitted_source_count"] == 8
        assert answer["usage"]["research_attempts"] == 0
    assert len(calls) == before
    assert len(payloads) == 2
    assert len(conversation["turns"][0]["sources"]) == 14


@pytest.mark.asyncio
async def test_unknown_end_retains_global_reservation_across_restart(generation_core):
    async def stream(payload):
        yield {"type": "response.output_text.delta", "delta": "A partial answer [S1]"}

    core, _ = generation_core(stream)
    conversation = await saved_live_record(core)
    await send(core, conversation, "generate")
    answer = (await finished(core, conversation["id"]))["turns"][-1]
    assert answer["status"] == "PARTIAL"
    assert answer["usage"]["model_cost_usd"] is None
    assert core.generation.committed_cost() == 0.05
    restored = GenerationService(core.settings.state_dir, config=core.generation.config)
    assert restored.committed_cost() == 0.05
    with pytest.raises(GenerationError, match="already admitted"):
        await restored.reserve(f"{conversation['id']}:{answer['id']}")
    for index in range(4):
        await restored.reserve(f"another-conversation:{index}")
    assert restored.readiness()["status"] == "budget_exhausted"
    with pytest.raises(GenerationError, match="allowance"):
        await restored.reserve("new-chat-does-not-reset-spending")


@pytest.mark.asyncio
async def test_cancellation_fences_late_model_text_and_keeps_cost_hold(generation_core):
    async def stream(payload):
        yield {"type": "response.output_text.delta", "delta": "Visible draft [S1]."}
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            yield {"type": "response.output_text.delta", "delta": "LATE TEXT MUST NOT PUBLISH"}
        yield terminal_event()

    core, _ = generation_core(stream)
    conversation = await saved_live_record(core)
    accepted = await send(core, conversation, "generate")
    for _ in range(200):
        snapshot = await core.conversations.get(conversation["id"])
        if snapshot["turns"][-1]["response"]:
            break
        await asyncio.sleep(0.01)
    cancelled = await core.conversations.cancel(conversation["id"], accepted["turns"][-1]["id"])
    turn = cancelled["turns"][-1]
    assert turn["status"] == "CANCELLED"
    assert turn["generation"]["status"] == "cancelled"
    assert "LATE" not in turn["response"]
    assert core.generation.committed_cost() == 0.05


@pytest.mark.asyncio
async def test_cancel_after_reservation_before_dispatch_makes_zero_model_calls(
    generation_core, monkeypatch
):
    attempts = []

    async def stream(payload):
        attempts.append(payload)
        yield terminal_event()

    core, _ = generation_core(stream)
    conversation = await saved_live_record(core)
    original = core.generation.reserve

    async def cancel_before_dispatch(operation_id):
        entry = await original(operation_id)
        conversation_id, turn_id = operation_id.split(":")
        await core.conversations._edit(
            conversation_id, turn_id, lambda turn: turn.update(status="CANCELLED"), "turn.cancelled"
        )
        return entry

    monkeypatch.setattr(core.generation, "reserve", cancel_before_dispatch)
    await send(core, conversation, "generate")
    answer = (await finished(core, conversation["id"]))["turns"][-1]
    assert answer["status"] == "CANCELLED"
    assert attempts == []
    entry = next(iter(core.generation.ledger["entries"].values()))
    assert entry["http_attempts"] == 0 and entry["cost_usd"] is None


@pytest.mark.asyncio
async def test_overall_generation_timeout_leaves_partial_sources_and_hold(generation_core):
    async def stream(payload):
        yield {"type": "response.output_text.delta", "delta": "Partial source account [S1]."}
        await asyncio.sleep(30)

    core, _ = generation_core(stream)
    core.generation.config.timeout_seconds = 1
    conversation = await saved_live_record(core)
    await send(core, conversation, "generate")
    answer = (await finished(core, conversation["id"]))["turns"][-1]
    assert answer["status"] == "PARTIAL"
    assert answer["generation"]["status"] == "failed"
    assert answer["sources"] and "TimeoutError" in answer["warnings"][0]
    assert core.generation.committed_cost() == 0.05


def test_bounded_context_omits_unadmitted_sources_and_rejects_fixtures(tmp_path):
    service = GenerationService(tmp_path, config=GenerationConfig(enabled=True, api_key="test"))
    records = [
        {
            "source_ref": f"openalex:authored-{index}",
            "record_id": str(index),
            "version": "authored-v1",
            "provider": "openalex",
            "mode": "live",
            "run_id": "run-authored",
            "title": "Authored record",
            "abstract": "x" * 400,
            "fictional": False,
        }
        for index in range(9)
    ]
    payload, admitted, omitted = service.prepare("Explain the available evidence", records)
    assert len(admitted) == 6 and omitted == 3
    assert "S7" not in json.dumps(payload)
    with pytest.raises(GenerationError, match="fixtures"):
        service.prepare("Question", [{**records[0], "mode": "fixture"}])
    with pytest.raises(GenerationError, match="disabled"):
        GenerationService(tmp_path, config=GenerationConfig()).prepare("Question", records)


@pytest.mark.asyncio
async def test_generate_without_evidence_does_not_admit_a_model_request(generation_core):
    async def forbidden(payload):
        raise AssertionError("No model stream may be constructed")
        yield  # Make the authored double an async generator.

    core, calls = generation_core(forbidden)
    conversation = await core.conversations.create(ConversationRequest())
    with pytest.raises(ApplicationError, match="live source"):
        await send(core, conversation, "generate")
    assert core.generation.ledger["entries"] == {} and calls == []


@pytest.mark.asyncio
async def test_raw_responses_adapter_reads_real_sse_boundaries(monkeypatch):
    captured = []
    original = httpx.AsyncClient

    async def handler(request):
        captured.append(request)
        data = {"type": "response.output_text.delta", "delta": "Actual prefix"}
        return httpx.Response(
            200,
            content="event: response.output_text.delta\ndata: "
            + json.dumps(data)
            + "\n\ndata: "
            + json.dumps(terminal_event())
            + "\n\n",
            headers={"content-type": "text/event-stream"},
        )

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    events = [
        event
        async for event in ResponsesStream("synthetic-key").astream(
            {"stream": True, "store": False}
        )
    ]
    assert events[0]["delta"] == "Actual prefix" and events[-1]["type"] == "response.completed"
    assert len(captured) == 1
    assert str(captured[0].url) == "https://api.openai.com/v1/responses"
    assert captured[0].headers["authorization"] == "Bearer synthetic-key"


def test_abstract_excerpt_scope_is_separate_from_author_preview_truncation():
    record = source('openalex', 'W-authored', 'live', title='Authored', authors=['A'] * 5, abstract='Complete short abstract.')
    value = preview(record, 'saved-run')
    assert value['preview_truncated'] is True
    assert value['abstract_truncated'] is False


@pytest.mark.asyncio
@pytest.mark.parametrize('eligible', [True, False])
async def test_generation_reads_richer_saved_abstract_locally_and_preserves_old_citations(generation_core, eligible):
    payloads = []
    async def stream(payload):
        payloads.append(payload)
        yield {'type': 'response.output_text.delta', 'delta': 'The supplied abstract describes the approach [S1].'}
        yield terminal_event()
    core, calls = generation_core(stream, openalex_mode='live')
    run = await core.create(ResearchRequest(question='Authored abstract retrieval', idempotency_key='source-run'), launch=False)
    text = 'a' * 400 + 'BEYOND_THE_OLD_PREVIEW' + 'b' * 1600
    record = {**source('openalex', 'W-authored', 'live', title='Authored full abstract', abstract=text, year=2025), 'eligible': eligible, 'branch_ranks': {'lexical': 1}, 'details_loaded': True, 'version': 'saved-details-v2'}
    await core.store.mutate(run['id'], lambda document: document.update(status='SUCCEEDED', entities=[record]), 'authored.details')
    conversation = await saved_live_record(core)
    old_source = {**preview(record, run['id']), 'version': 'discovery-v1'}
    conversation = await core.conversations.store.mutate(conversation['id'], lambda document: document['turns'][0].update(sources=[old_source]), 'authored.preview')
    before = len(calls)
    if not eligible:
        with pytest.raises(ApplicationError, match='research scope'):
            await send(core, conversation, 'generate')
        assert payloads == [] and core.generation.ledger['entries'] == {}
    else:
        await send(core, conversation, 'generate')
        final = await finished(core, conversation['id'])
        answer = final['turns'][-1]
        wire = json.loads(payloads[0]['input'][0]['content'][0]['text'])['sources'][0]
        assert 'BEYOND_THE_OLD_PREVIEW' in wire['abstract_excerpt']
        assert len(wire['abstract_excerpt']) == 1200 and wire['excerpt_truncated']
        assert answer['sources'][0]['abstract_chars_available'] == len(text)
        assert answer['sources'][0]['abstract_truncated'] is True
        assert answer['citations'][0]['observation_version'] == 'saved-details-v2'
        assert final['turns'][0]['sources'][0] == old_source
        assert answer['usage']['research_attempts'] == 0
    assert len(calls) == before
