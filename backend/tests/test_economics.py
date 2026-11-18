"""Daily invocation credits and content-free SQLite history; no external calls."""

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import httpx
import pytest

from research_scout.api import create_app
from research_scout.core import Core, Settings
from research_scout.economics import Economics, EconomicsError
from research_scout.generation import GenerationConfig, GenerationError, GenerationService


def entry():
    return {
        "purpose": "retrieval",
        "model": "gpt-6-luna",
        "status": "admitted",
        "created_at": "2026-11-14T12:00:00+00:00",
        "reservation_usd": 0.05,
        "cost_usd": None,
        "known_cost_usd": 0,
        "http_attempts": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "provider_count": 4,
        "max_http_attempts": 9,
        "steps": {},
    }


@pytest.mark.parametrize(
    "date,hours", [("2026-03-08T12:00:00+00:00", 23), ("2026-11-01T12:00:00+00:00", 25)]
)
def test_local_midnight_windows_honor_dst(tmp_path, date, hours):
    clock = [datetime.fromisoformat(date).timestamp()]
    service = Economics(tmp_path / "test.sqlite3", clock=lambda: clock[0])
    first = service.get_economics()
    connection = service.connect()
    try:
        window = connection.execute(
            "SELECT * FROM windows WHERE id=?", (first["window_id"],)
        ).fetchone()
    finally:
        connection.close()
    assert window["ends_at"] - window["starts_at"] == hours * 3600
    clock[0] = window["ends_at"]
    next_day = service.get_economics()
    assert next_day["epoch"] > first["epoch"] and next_day["remaining"] == 100
    assert datetime.fromisoformat(next_day["reset_at"]).tzinfo == UTC


def test_two_sqlite_connections_atomically_reserve_not_more_than100(tmp_path):
    services = [Economics(tmp_path / "test.sqlite3") for _ in range(2)]

    def reserve(index):
        try:
            services[index % 2].reserve(f"op-{index}", entry(), 9)
            return True
        except EconomicsError:
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(reserve, range(12)))
    assert sum(results) == 11
    summary = services[0].get_economics()
    assert (summary["used"], summary["reserved"], summary["remaining"]) == (0, 99, 1)


def test_reset_cas_idempotence_and_old_inflight_settlement_isolation(tmp_path):
    service = Economics(tmp_path / "test.sqlite3")
    old = service.get_economics()
    service.reserve("in-flight", entry(), 9)
    service.dispatch("in-flight", "plan")
    current = service.reset(old["window_id"], "reset-once")
    assert current["epoch"] > old["epoch"] and current["remaining"] == 100
    assert service.reset(old["window_id"], "reset-once") == current
    with pytest.raises(EconomicsError, match="changed"):
        service.reset(old["window_id"], "stale-reset")
    service.settle(
        "in-flight", "plan", {"input_tokens": 100, "output_tokens": 20}, output_limit=2600
    )
    service.dispatch("in-flight", "review1:0")
    service.uncertain("in-flight", "cancelled")
    fresh = service.get_economics()
    assert (fresh["used"], fresh["reserved"], fresh["remaining"]) == (0, 0, 100)
    admin = service.admin()
    assert admin["totals"]["invocations"] == 2 and admin["totals"]["unknown_usage"] == 1
    assert admin["totals"]["unknown_held_usd"] > 0
    assert admin["operations"][0]["window_id"] == old["window_id"]


def test_crash_recovery_releases_unused_slots_but_keeps_dispatch_unknown_exposure(tmp_path):
    path = tmp_path / "test.sqlite3"
    first = Economics(path)
    first.reserve("not-sent", entry(), 9)
    first.reserve("unknown", entry(), 9)
    first.dispatch("unknown", "plan")
    recovered = Economics(path, recover=True)
    summary = recovered.get_economics()
    assert (summary["used"], summary["reserved"], summary["remaining"]) == (1, 0, 99)
    assert recovered.ledger["entries"]["not-sent"]["cost_usd"] == 0
    assert recovered.admin()["totals"]["unknown_held_usd"] == 0.05
    with pytest.raises(EconomicsError, match="already admitted"):
        recovered.reserve("unknown", entry(), 9)
    with pytest.raises(EconomicsError, match="Stopped"):
        recovered.dispatch("unknown", "review1:0")


def test_late_usage_resolves_financial_unknown_without_spending_new_reset_window(tmp_path):
    service = Economics(tmp_path / "test.sqlite3")
    service.reserve("late", entry(), 9)
    service.dispatch("late", "plan")
    service.uncertain("late", "interrupted")
    old = service.get_economics()
    service.reset(old["window_id"], "new-window")
    assert service.admin()["totals"]["unknown_held_usd"] == 0.05
    service.settle("late", "plan", {"input_tokens": 100, "output_tokens": 20}, output_limit=2600)
    assert service.get_economics()["remaining"] == 100
    assert service.admin()["totals"]["unknown_held_usd"] == 0
    assert service.ledger["entries"]["late"]["status"] == "interrupted"


def test_existing_corrupt_import_backup_is_not_trusted_or_overwritten(tmp_path):
    source = tmp_path / "ledger.json"
    raw = json.dumps({"schema": 1, "entries": {}}).encode()
    source.write_bytes(raw)
    backup = source.with_name(
        source.name + ".pre-sqlite-" + hashlib.sha256(raw).hexdigest()[:12] + ".bak"
    )
    backup.write_bytes(b"partial backup")
    with pytest.raises(EconomicsError, match="backup does not match"):
        Economics(tmp_path / "test.sqlite3", legacy_path=source)
    assert backup.read_bytes() == b"partial backup" and source.read_bytes() == raw


def test_actual_usage_coverage_roles_duration_and_no_prompt_fields(tmp_path):
    service = Economics(tmp_path / "test.sqlite3")
    service.reserve(
        "tokens", {**entry(), "prompt": "DO-NOT-STORE-THIS", "api_key": "DO-NOT-STORE-THIS"}, 9
    )
    service.dispatch("tokens", "plan")
    service.observe("tokens", "plan", duration_ms=12.5, status="response_received")
    usage = {
        "input_tokens": 120,
        "output_tokens": 30,
        "input_tokens_details": {"cached_tokens": 80},
        "output_tokens_details": {"reasoning_tokens": 10},
    }
    service.settle("tokens", "plan", usage, output_limit=2600)
    service.finish_retrieval("tokens")
    service.settle("tokens", "plan", usage, output_limit=2600)
    summary = service.get_economics()
    assert summary["used"] == 1 and summary["reserved"] == 0
    assert summary["tokens"] == {
        "input_tokens": 120,
        "output_tokens": 30,
        "cached_input_tokens": 80,
        "reasoning_tokens": 10,
    }
    assert summary["token_coverage"]["cached_input_tokens"] == 1
    detail = service.admin()["operations"][0]["invocations"][0]
    assert detail["role"] == "plan" and detail["duration_ms"] == 12.5
    assert detail["estimated_cost_usd"] == pytest.approx(0.00003)
    assert b"DO-NOT-STORE-THIS" not in (tmp_path / "test.sqlite3").read_bytes()
    with pytest.raises(EconomicsError, match="cannot change"):
        service.settle("tokens", "plan", {**usage, "output_tokens": 31}, output_limit=2600)


def test_import13_legacy_operations_is_historical_idempotent_and_byte_preserved(tmp_path):
    old = tmp_path / "generation-ledger.json"
    entries = {}
    for index in range(13):
        known = index < 9
        entries[f"legacy-{index}"] = {
            "status": "completed" if known else "failed_unknown_cost",
            "model": "gpt-6-luna",
            "created_at": "2026-11-10T12:00:00+00:00",
            "reservation_usd": 0.05,
            "cost_usd": 0.001 if known else None,
            "http_attempts": 1,
            **({"input_tokens": 100, "output_tokens": 30} if known else {}),
        }
    old.write_text(json.dumps({"schema": 1, "entries": entries}))
    original = old.read_bytes()
    path = tmp_path / "tokenomics.sqlite3"
    service = Economics(path, legacy_path=old)
    again = Economics(path, legacy_path=old)
    assert old.read_bytes() == original
    backup = old.with_name(
        old.name + ".pre-sqlite-" + hashlib.sha256(original).hexdigest()[:12] + ".bak"
    )
    assert backup.read_bytes() == original
    assert set(again.ledger["entries"]) == set(entries)
    assert service.get_economics()["remaining"] == 100
    totals = service.admin()["totals"]
    assert totals["operations"] == totals["invocations"] == 13
    assert totals["known_usage"] == 9 and totals["unknown_usage"] == 4
    assert totals["unknown_held_usd"] == pytest.approx(0.20)
    assert totals["estimated_cost_usd"] == pytest.approx(0.009)
    with pytest.raises(EconomicsError, match="already admitted"):
        again.reserve("legacy-12", entry(), 9)


@pytest.mark.asyncio
async def test_daily_credits_are_only_global_gate_and_reset_preserves_unknown_usd(tmp_path):
    service = GenerationService(
        tmp_path, config=GenerationConfig(enabled=True, api_key="authored", max_session_cost_usd=0)
    )
    for index in range(100):
        identity = f"writer-{index}"
        await service.reserve(identity)
        await service.dispatched(identity)
        await service.uncertain(identity, "unknown")
    assert service.readiness()["status"] == "budget_exhausted"
    assert service.economics.get_economics()["used"] == 100
    with pytest.raises(GenerationError, match="allowance"):
        await service.reserve("denied-without-http")
    before = service.economics.get_economics()
    assert service.economics.reset(before["window_id"], "new-epoch")["remaining"] == 100
    assert service.readiness()["status"] == "ready"
    await service.reserve_retrieval("allowed-after-reset", provider_count=4)
    assert service.economics.get_economics()["reserved"] == 9
    assert service.economics.admin()["totals"]["unknown_held_usd"] == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_api_reset_is_explicit_cas_and_never_invokes_models_or_sources(tmp_path):
    calls = []

    async def forbidden(request):
        calls.append(request)
        raise AssertionError("No source request authorized")

    client = httpx.AsyncClient(transport=httpx.MockTransport(forbidden))
    app = create_app(
        Settings(state_dir=tmp_path), core_factory=lambda settings: Core(settings, client=client)
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver") as api,
    ):
        first = (await api.get("/api/economics")).json()
        assert first["remaining"] == 100
        body = {"expected_window_id": first["window_id"], "idempotency_key": "reset-once"}
        one = await api.post("/api/economics/reset", json=body)
        repeated = await api.post("/api/economics/reset", json=body)
        assert one.json() == repeated.json() and one.json()["epoch"] > first["epoch"]
        assert (
            await api.post("/api/economics/reset", json={**body, "idempotency_key": "stale"})
        ).status_code == 409
        assert (await api.get("/api/admin/economics")).json()["operations"] == []
        assert (await api.get("/api/admin/economics?limit=101")).status_code == 422
        assert calls == []
    await client.aclose()


def test_sqlite_configuration_and_fixture_database_isolation(tmp_path):
    service = Economics(tmp_path / "test.sqlite3")
    connection = service.connect()
    try:
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert connection.execute("PRAGMA synchronous").fetchone()[0] == 2
        assert connection.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
        assert connection.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
        assert connection.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0] == 1
    finally:
        connection.close()
    config = Settings(state_dir=tmp_path / "live-double", mode="live")
    assert config.economics_path == tmp_path / "live-double" / "operational" / "tokenomics.sqlite3"


def test_recovery_owner_fences_active_work_even_for_another_state_directory(tmp_path):
    path = tmp_path / "shared.sqlite3"
    first = Economics(path, recover=True)
    try:
        first.reserve("still-running", entry(), 9)
        with pytest.raises(EconomicsError, match="Another core owns"):
            Economics(path, recover=True)
        assert first.get_economics()["reserved"] == 9
        assert first.ledger["entries"]["still-running"]["status"] == "admitted"
    finally:
        first.close()
    replacement = Economics(path, recover=True)
    try:
        assert replacement.get_economics()["reserved"] == 0
        assert replacement.ledger["entries"]["still-running"]["status"] == "interrupted"
    finally:
        replacement.close()
