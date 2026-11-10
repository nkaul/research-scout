"""Shared paid-operation accounting only: no model transport or external requests."""

import asyncio

import pytest

from research_scout.generation import MODEL, GenerationConfig, GenerationError, GenerationService

STEPS = ["plan", "review1:0", "review1:1", "review2:0", "review2:1"]


def service(tmp_path, **overrides):
    return GenerationService(tmp_path, config=GenerationConfig(**overrides))


@pytest.mark.asyncio
async def test_five_retrieval_calls_share_one_reservation_without_enabling_writer(tmp_path):
    ledger = service(tmp_path)
    assert ledger.readiness()["status"] == "disabled"
    admitted = await ledger.reserve_retrieval("conversation:turn:retrieval")
    assert admitted["purpose"] == "retrieval" and admitted["model"] == MODEL
    assert admitted["reservation_usd"] == 0.05 and admitted["http_attempts"] == 0
    for step in STEPS:
        dispatch = await ledger.retrieval_dispatched("conversation:turn:retrieval", step)
        assert dispatch["steps"][step]["status"] == "dispatched"
        usage = {"input_tokens": 100, "output_tokens": 2600}
        settled = await ledger.retrieval_settle_step("conversation:turn:retrieval", step, usage)
        assert settled["cost_usd"] is None and ledger.committed_cost() == 0.05
        duplicated = await ledger.retrieval_settle_step("conversation:turn:retrieval", step, usage)
        assert duplicated["known_cost_usd"] == settled["known_cost_usd"]
    complete = await ledger.finish_retrieval("conversation:turn:retrieval")
    assert complete["http_attempts"] == 5
    assert complete["input_tokens"] == 500 and complete["output_tokens"] == 13000
    assert complete["cost_usd"] == pytest.approx(0.0065625)
    assert ledger.committed_cost() == pytest.approx(complete["cost_usd"])
    assert await ledger.finish_retrieval("conversation:turn:retrieval") == complete
    complete["steps"]["plan"]["status"] = "changed outside the ledger"
    assert (
        ledger.ledger["entries"]["conversation:turn:retrieval"]["steps"]["plan"]["status"]
        == "settled"
    )


@pytest.mark.asyncio
async def test_automatic_four_provider_loop_remains_one_nine_call_reservation(tmp_path):
    ledger = service(tmp_path)
    admitted = await ledger.reserve_retrieval("automatic", provider_count=4)
    assert admitted["max_http_attempts"] == 9 and admitted["reservation_usd"] == 0.05
    steps = ["plan"] + [
        f"review{round_index}:{provider_index}"
        for round_index in (1, 2)
        for provider_index in range(4)
    ]
    for step in steps:
        await ledger.retrieval_dispatched("automatic", step)
        await ledger.retrieval_settle_step(
            "automatic", step, {"input_tokens": 100, "output_tokens": 100}
        )
    final = await ledger.finish_retrieval("automatic")
    assert final["http_attempts"] == 9 and final["cost_usd"] < 0.05
    with pytest.raises(GenerationError):
        await ledger.retrieval_dispatched("automatic", "review2:4")
    with pytest.raises(GenerationError):
        await ledger.reserve_retrieval("too-wide", provider_count=5)


@pytest.mark.asyncio
async def test_retrieval_steps_cannot_replay_or_expand_fixed_topology(tmp_path):
    ledger = service(tmp_path)
    await ledger.reserve_retrieval("turn")
    with pytest.raises(GenerationError, match="planning"):
        await ledger.retrieval_dispatched("turn", "review1:0")
    await ledger.retrieval_dispatched("turn", "plan")
    with pytest.raises(GenerationError, match="replay"):
        await ledger.retrieval_dispatched("turn", "plan")
    await ledger.retrieval_settle_step("turn", "plan", {"input_tokens": 10, "output_tokens": 10})
    with pytest.raises(GenerationError, match="cannot change"):
        await ledger.retrieval_settle_step(
            "turn", "plan", {"input_tokens": 11, "output_tokens": 10}
        )
    for step in ("review3:0", "review1:2", "shell", "review1:0:retry"):
        with pytest.raises(GenerationError, match="topology"):
            await ledger.retrieval_dispatched("turn", step)
    with pytest.raises(GenerationError, match="already admitted"):
        await ledger.reserve_retrieval("turn")
    assert ledger.ledger["entries"]["turn"]["http_attempts"] == 1


@pytest.mark.asyncio
async def test_unknown_retrieval_charge_survives_restart_and_blocks_replay(tmp_path):
    ledger = service(tmp_path)
    await ledger.reserve_retrieval("turn")
    await ledger.retrieval_dispatched("turn", "plan")
    await ledger.retrieval_settle_step("turn", "plan", {"input_tokens": 100, "output_tokens": 100})
    await ledger.retrieval_dispatched("turn", "review1:0")
    await ledger.uncertain("turn", "cancelled")
    restored = service(tmp_path)
    entry = restored.ledger["entries"]["turn"]
    assert entry["known_cost_usd"] > 0 and entry["cost_usd"] is None
    assert restored.committed_cost() == 0.05 and entry["http_attempts"] == 2
    with pytest.raises(GenerationError, match="reservation"):
        await restored.finish_retrieval("turn")
    with pytest.raises(GenerationError, match="Stopped"):
        await restored.retrieval_dispatched("turn", "review1:1")
    with pytest.raises(GenerationError, match="already admitted"):
        await restored.reserve_retrieval("turn")


@pytest.mark.asyncio
async def test_pre_dispatch_failure_releases_only_provably_unused_group_reservation(tmp_path):
    ledger = service(tmp_path)
    await ledger.reserve_retrieval("context-failed-before-http")
    await ledger.uncertain("context-failed-before-http", "stopped_before_dispatch")
    complete = await ledger.finish_retrieval("context-failed-before-http")
    assert complete["http_attempts"] == 0 and complete["steps"] == {}
    assert complete["cost_usd"] == 0 and ledger.committed_cost() == 0
    await ledger.reserve_retrieval("admitted-http-unknown")
    await ledger.retrieval_dispatched("admitted-http-unknown", "plan")
    with pytest.raises(GenerationError, match="reservation"):
        await ledger.finish_retrieval("admitted-http-unknown")
    assert ledger.committed_cost() == 0.05


@pytest.mark.asyncio
async def test_writer_and_retrieval_share_workspace_ceiling_across_conversations(tmp_path):
    config = GenerationConfig(enabled=True, api_key="authored-no-transport")
    ledger = GenerationService(tmp_path, config=config)
    await ledger.reserve("writer-turn")
    await ledger.reserve_retrieval("chat-a:retrieval")
    await ledger.reserve("another-writer-turn")
    await ledger.reserve_retrieval("chat-b:retrieval")
    await ledger.reserve_retrieval("chat-c:retrieval")
    restored = GenerationService(tmp_path, config=config)
    assert restored.committed_cost() == 0.25
    with pytest.raises(GenerationError, match="allowance"):
        await restored.reserve_retrieval("new-conversation-does-not-reset-paid-usage")
    with pytest.raises(GenerationError, match="allowance"):
        await restored.reserve("new-writer-does-not-reset-paid-usage")
    assert restored.readiness()["status"] == "budget_exhausted"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "usage",
    [
        {},
        {"input_tokens": True, "output_tokens": 0},
        {"input_tokens": 10.5, "output_tokens": 1},
        {"input_tokens": 10, "output_tokens": -1},
        {"input_tokens": 10, "output_tokens": 2601},
    ],
)
async def test_invalid_retrieval_usage_cannot_release_or_change_reservation(tmp_path, usage):
    ledger = service(tmp_path)
    await ledger.reserve_retrieval("turn")
    await ledger.retrieval_dispatched("turn", "plan")
    with pytest.raises(GenerationError):
        await ledger.retrieval_settle_step("turn", "plan", usage)
    assert ledger.committed_cost() == 0.05
    assert ledger.ledger["entries"]["turn"]["known_cost_usd"] == 0
    assert ledger.ledger["entries"]["turn"]["steps"]["plan"]["status"] == "dispatched"


@pytest.mark.asyncio
async def test_reported_usage_over_reservation_is_retained_and_stops_future_steps(tmp_path):
    ledger = service(tmp_path)
    await ledger.reserve_retrieval("turn")
    await ledger.retrieval_dispatched("turn", "plan")
    with pytest.raises(GenerationError, match="reservation"):
        await ledger.retrieval_settle_step(
            "turn", "plan", {"input_tokens": 1_000_000, "output_tokens": 0}
        )
    assert ledger.committed_cost() == pytest.approx(0.125)
    with pytest.raises(GenerationError, match="Stopped"):
        await ledger.retrieval_dispatched("turn", "review1:0")
    with pytest.raises(GenerationError, match="reservation"):
        await ledger.finish_retrieval("turn")


@pytest.mark.asyncio
async def test_concurrent_retrieval_admissions_do_not_race_past_global_cap(tmp_path):
    ledger = service(tmp_path)
    results = await asyncio.gather(
        *(ledger.reserve_retrieval(f"turn-{index}") for index in range(6)), return_exceptions=True
    )
    assert sum(isinstance(result, GenerationError) for result in results) == 1
    assert len(ledger.ledger["entries"]) == 5 and ledger.committed_cost() == 0.25


@pytest.mark.asyncio
async def test_retrieval_rejects_unreviewed_model_and_writer_method_confusion(tmp_path):
    with pytest.raises(GenerationError, match="reviewed model"):
        await service(tmp_path, model="other-model").reserve_retrieval("turn")
    ledger = service(tmp_path)
    await ledger.reserve_retrieval("turn")
    with pytest.raises(GenerationError, match="retrieval step"):
        await ledger.dispatched("turn")
    with pytest.raises(GenerationError, match="retrieval step"):
        await ledger.settle("turn", {"input_tokens": 10, "output_tokens": 10})
