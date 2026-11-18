"""Transactional, content-free daily model invocation credits and usage accounting."""

from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
import sqlite3
import tempfile
import time
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

POLICY = "scout-daily-invocations-v1"
COST_VERSION = "scout-legacy-estimate-v1"
BUDGET = 100
COST_BASIS = "Historical application estimate: input at $0.125/million, output at $0.50/million; unverified current provider pricing, not invoice cost."
ENTRY_FIELDS = {
    "purpose",
    "status",
    "created_at",
    "completed_at",
    "updated_at",
    "dispatched_at",
    "model",
    "reservation_usd",
    "cost_usd",
    "known_cost_usd",
    "http_attempts",
    "input_tokens",
    "output_tokens",
    "cached_input_tokens",
    "reasoning_tokens",
    "steps",
    "provider_count",
    "max_http_attempts",
    "cost_basis",
    "input_rate_per_million",
    "input_rate_bound_per_million",
    "output_rate_per_million",
    "duration_ms",
    "returned_model",
}
STEP_FIELDS = {
    "status",
    "http_attempts",
    "dispatched_at",
    "settled_at",
    "input_tokens",
    "output_tokens",
    "cached_input_tokens",
    "reasoning_tokens",
    "cost_usd",
    "duration_ms",
    "returned_model",
}


class EconomicsError(ValueError):
    pass


def clean_entry(entry):
    safe = {key: value for key, value in entry.items() if key in ENTRY_FIELDS and key != "steps"}
    if "steps" in entry:
        safe["steps"] = {
            step: {key: value for key, value in detail.items() if key in STEP_FIELDS}
            for step, detail in entry["steps"].items()
        }
    return safe


def normalize_usage(usage):
    if not isinstance(usage, dict) or any(
        type(usage.get(key)) is not int or not 0 <= usage[key] <= 10**12
        for key in ("input_tokens", "output_tokens")
    ):
        raise EconomicsError("Model usage must supply attributable nonnegative integer tokens.")
    result = {key: usage[key] for key in ("input_tokens", "output_tokens")}
    for target, group, field in [
        ("cached_input_tokens", "input_tokens_details", "cached_tokens"),
        ("reasoning_tokens", "output_tokens_details", "reasoning_tokens"),
    ]:
        detail = usage.get(group)
        value = detail.get(field) if isinstance(detail, dict) else usage.get(target)
        if value is not None and (
            type(value) is not int
            or value < 0
            or value > usage["input_tokens" if target == "cached_input_tokens" else "output_tokens"]
        ):
            raise EconomicsError("Detailed token counters exceed their attributable total.")
        result[target] = value
    return result


def iso(stamp):
    return datetime.fromtimestamp(stamp, UTC).isoformat()


class Economics:
    def __init__(
        self,
        path: Path,
        *,
        legacy_path=None,
        timezone="America/New_York",
        clock=time.time,
        recover=False,
    ):
        self.path = Path(path).resolve()
        self._owner = None
        self.timezone, self.zone, self.clock = timezone, ZoneInfo(timezone), clock
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            if recover:
                self._owner = Path(str(self.path) + "-owner.lock").open("a+")
                try:
                    fcntl.flock(self._owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise EconomicsError(
                        "Another core owns this tokenomics database; active reservations were not recovered."
                    ) from None
            self._migrate()
            if legacy_path is not None and Path(legacy_path).exists():
                self.import_legacy(Path(legacy_path))
            if recover:
                self.recover()
        except BaseException:
            self.close()
            raise

    def close(self):
        if self._owner is not None:
            self._owner.close()
            self._owner = None

    def __del__(self):
        self.close()

    def connect(self):
        connection = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("PRAGMA synchronous=FULL")
        return connection

    @contextmanager
    def tx(self):
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _migrate(self):
        connection = self.connect()
        try:
            if connection.execute("PRAGMA journal_mode=DELETE").fetchone()[0] != "delete":
                raise EconomicsError("Tokenomics requires the verified rollback journal mode.")
        finally:
            connection.close()
        with self.tx() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)"
            )
            if connection.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[
                0
            ] not in (None, 1):
                raise EconomicsError(
                    "Unsupported tokenomics schema; no database reset was performed."
                )
            statements = [
                "CREATE TABLE IF NOT EXISTS windows(id TEXT PRIMARY KEY,day TEXT NOT NULL,timezone TEXT NOT NULL,epoch INTEGER NOT NULL UNIQUE,starts_at REAL NOT NULL,ends_at REAL NOT NULL,reason TEXT NOT NULL)",
                "CREATE TABLE IF NOT EXISTS policy(singleton INTEGER PRIMARY KEY CHECK(singleton=1),current_window_id TEXT REFERENCES windows(id),revision INTEGER NOT NULL DEFAULT 0)",
                "CREATE TABLE IF NOT EXISTS operations(operation_id TEXT PRIMARY KEY,window_id TEXT NOT NULL REFERENCES windows(id),purpose TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT,reserved INTEGER NOT NULL CHECK(reserved>=0),used INTEGER NOT NULL CHECK(used>=0),max_invocations INTEGER NOT NULL,record_json TEXT NOT NULL,imported INTEGER NOT NULL DEFAULT 0)",
                "CREATE TABLE IF NOT EXISTS invocations(operation_id TEXT NOT NULL REFERENCES operations(operation_id),step TEXT NOT NULL,window_id TEXT NOT NULL REFERENCES windows(id),role TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,dispatched_at TEXT,settled_at TEXT,duration_ms REAL,input_tokens INTEGER,output_tokens INTEGER,cached_input_tokens INTEGER,reasoning_tokens INTEGER,estimated_cost_usd REAL,cost_basis_version TEXT NOT NULL,PRIMARY KEY(operation_id,step))",
                "CREATE TABLE IF NOT EXISTS resets(idempotency_key TEXT PRIMARY KEY,expected_window_id TEXT NOT NULL,window_id TEXT NOT NULL REFERENCES windows(id),created_at TEXT NOT NULL,result_json TEXT NOT NULL)",
                "CREATE TABLE IF NOT EXISTS imports(source_path TEXT PRIMARY KEY,source_sha256 TEXT NOT NULL,backup_path TEXT NOT NULL,imported_at TEXT NOT NULL,operation_count INTEGER NOT NULL)",
                "CREATE INDEX IF NOT EXISTS operations_window ON operations(window_id)",
                "CREATE INDEX IF NOT EXISTS invocation_window ON invocations(window_id)",
            ]
            for statement in statements:
                connection.execute(statement)
            connection.execute("INSERT OR IGNORE INTO policy(singleton,revision) VALUES(1,0)")
            connection.execute(
                "INSERT OR IGNORE INTO schema_migrations VALUES(1,?)", (iso(self.clock()),)
            )

    def _revision(self, connection):
        connection.execute("UPDATE policy SET revision=revision+1 WHERE singleton=1")

    def _new_window(self, connection, stamp, reason, *, historical=False):
        local = datetime.fromtimestamp(stamp, UTC).astimezone(self.zone)
        midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
        end = midnight + timedelta(days=1)
        epoch = connection.execute("SELECT COALESCE(MAX(epoch),0)+1 FROM windows").fetchone()[0]
        identity = uuid.uuid4().hex
        connection.execute(
            "INSERT INTO windows VALUES(?,?,?,?,?,?,?)",
            (
                identity,
                local.date().isoformat(),
                self.timezone,
                epoch,
                stamp if reason == "manual_reset" else midnight.timestamp(),
                end.timestamp(),
                reason,
            ),
        )
        if not historical:
            connection.execute(
                "UPDATE policy SET current_window_id=? WHERE singleton=1", (identity,)
            )
        self._revision(connection)
        return connection.execute("SELECT * FROM windows WHERE id=?", (identity,)).fetchone()

    def _window(self, connection):
        stamp = self.clock()
        current = connection.execute(
            "SELECT w.* FROM windows w JOIN policy p ON p.current_window_id=w.id WHERE p.singleton=1"
        ).fetchone()
        if current is None or stamp >= current["ends_at"]:
            return self._new_window(connection, stamp, "daily")
        return current

    def _summary(self, connection, window):
        counts = connection.execute(
            "SELECT COALESCE(SUM(used),0),COALESCE(SUM(reserved),0) FROM operations WHERE window_id=?",
            (window["id"],),
        ).fetchone()
        invocations = connection.execute(
            "SELECT * FROM invocations WHERE window_id=?", (window["id"],)
        ).fetchall()
        totals = self._totals(connection, window_id=window["id"])
        return {
            "policy_version": POLICY,
            "daily_budget": BUDGET,
            "used": counts[0],
            "reserved": counts[1],
            "remaining": max(0, BUDGET - counts[0] - counts[1]),
            "window_id": window["id"],
            "day": window["day"],
            "timezone": window["timezone"],
            "reset_at": iso(window["ends_at"]),
            "epoch": window["epoch"],
            "revision": connection.execute("SELECT revision FROM policy").fetchone()[0],
            "invocations": {
                "total": len(invocations),
                "known_usage": sum(
                    row["input_tokens"] is not None and row["output_tokens"] is not None
                    for row in invocations
                ),
                "unknown_usage": sum(
                    row["input_tokens"] is None or row["output_tokens"] is None
                    for row in invocations
                ),
            },
            "tokens": {
                key: totals[key]
                for key in (
                    "input_tokens",
                    "output_tokens",
                    "cached_input_tokens",
                    "reasoning_tokens",
                )
            },
            "estimated_cost_usd": totals["estimated_cost_usd"],
            "token_coverage": totals["token_coverage"],
            "cost_coverage": totals["cost_coverage"],
            "unknown_held_usd": totals["unknown_held_usd"],
            "cost_basis_version": COST_VERSION,
            "credit_basis": "operation admission window; one credit per hosted model HTTP dispatch",
        }

    def get_economics(self):
        with self.tx() as connection:
            return self._summary(connection, self._window(connection))

    def reset(self, expected_window_id, idempotency_key):
        with self.tx() as connection:
            prior = connection.execute(
                "SELECT * FROM resets WHERE idempotency_key=?", (idempotency_key,)
            ).fetchone()
            if prior:
                if prior["expected_window_id"] != expected_window_id:
                    raise EconomicsError("Reset key belongs to a different expected window.")
                return json.loads(prior["result_json"])
            current = self._window(connection)
            if current["id"] != expected_window_id:
                raise EconomicsError("The credit window changed; reload before resetting.")
            window = self._new_window(connection, self.clock(), "manual_reset")
            result = self._summary(connection, window)
            connection.execute(
                "INSERT INTO resets VALUES(?,?,?,?,?)",
                (
                    idempotency_key,
                    expected_window_id,
                    window["id"],
                    iso(self.clock()),
                    json.dumps(result),
                ),
            )
            return result

    @property
    def ledger(self):
        connection = self.connect()
        try:
            entries = {
                row["operation_id"]: json.loads(row["record_json"])
                for row in connection.execute("SELECT operation_id,record_json FROM operations")
            }
        finally:
            connection.close()
        return {"schema": 1, "entries": entries}

    def _save(self, connection, identity, entry):
        clean = clean_entry(entry)
        connection.execute(
            "UPDATE operations SET status=?,completed_at=?,record_json=? WHERE operation_id=?",
            (
                clean["status"],
                clean.get("completed_at"),
                json.dumps(clean, allow_nan=False),
                identity,
            ),
        )
        row = connection.execute(
            "SELECT * FROM operations WHERE operation_id=?", (identity,)
        ).fetchone()
        steps = (
            clean.get("steps", {})
            if row["purpose"] == "retrieval"
            else ({"generation": clean} if clean.get("http_attempts") else {})
        )
        for step, detail in steps.items():
            role = (
                "plan"
                if step == "plan"
                else "repair_review"
                if step.startswith("review2:")
                else "review"
                if step.startswith("review1:")
                else "generation"
                if step == "generation"
                else "legacy_unknown"
            )
            connection.execute(
                "INSERT INTO invocations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(operation_id,step) DO UPDATE SET model=excluded.model,status=excluded.status,settled_at=excluded.settled_at,duration_ms=excluded.duration_ms,input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,cached_input_tokens=excluded.cached_input_tokens,reasoning_tokens=excluded.reasoning_tokens,estimated_cost_usd=excluded.estimated_cost_usd",
                (
                    identity,
                    step,
                    row["window_id"],
                    role,
                    detail.get("returned_model") or row["model"],
                    detail["status"],
                    detail.get("dispatched_at"),
                    detail.get("settled_at")
                    or (clean.get("completed_at") if step == "generation" else None),
                    detail.get("duration_ms"),
                    detail.get("input_tokens"),
                    detail.get("output_tokens"),
                    detail.get("cached_input_tokens"),
                    detail.get("reasoning_tokens"),
                    detail.get("cost_usd"),
                    COST_VERSION,
                ),
            )
        self._revision(connection)
        return clean

    def reserve(self, identity, entry, slots):
        with self.tx() as connection:
            if connection.execute(
                "SELECT 1 FROM operations WHERE operation_id=?", (identity,)
            ).fetchone():
                raise EconomicsError(
                    "This model operation was already admitted; replay is disabled."
                )
            window = self._window(connection)
            current = self._summary(connection, window)
            if current["remaining"] < slots:
                raise EconomicsError(
                    f"The daily model credit allowance needs {slots} available credits; {current['remaining']} remain."
                )
            connection.execute(
                "INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?,?,?,0)",
                (
                    identity,
                    window["id"],
                    entry.get("purpose", "generation"),
                    entry["model"],
                    entry["status"],
                    entry["created_at"],
                    None,
                    slots,
                    0,
                    slots,
                    json.dumps(clean_entry(entry)),
                ),
            )
            self._revision(connection)
            return clean_entry(entry)

    @contextmanager
    def change(self, identity):
        with self.tx() as connection:
            row = connection.execute(
                "SELECT * FROM operations WHERE operation_id=?", (identity,)
            ).fetchone()
            if row is None:
                raise EconomicsError("Model operation was not admitted.")
            entry = json.loads(row["record_json"])
            yield connection, row, entry
            self._save(connection, identity, entry)

    def dispatch(self, identity, step):
        with self.change(identity) as (connection, row, entry):
            if row["reserved"] < 1:
                raise EconomicsError("Stopped model operation has no reserved invocation credit.")
            if entry.get("purpose") == "retrieval":
                if step != "plan" and int(step[-1]) >= entry.get("provider_count", 2):
                    raise EconomicsError(
                        "Retrieval review is outside its admitted provider topology."
                    )
                if entry["status"] not in {"admitted", "dispatched", "step_settled"}:
                    raise EconomicsError("Stopped retrieval cannot dispatch more model work.")
                if step in entry["steps"] or entry["http_attempts"] >= entry["max_http_attempts"]:
                    raise EconomicsError(
                        "Retrieval step cannot replay or exceed its model-attempt bound."
                    )
                if step != "plan" and entry["steps"].get("plan", {}).get("status") != "settled":
                    raise EconomicsError("Retrieval reviews require a settled planning step.")
                entry["steps"][step] = {
                    "status": "dispatched",
                    "http_attempts": 1,
                    "dispatched_at": iso(self.clock()),
                }
            elif step != "generation" or entry["http_attempts"]:
                raise EconomicsError("Generation HTTP attempt cannot replay.")
            else:
                entry["dispatched_at"] = iso(self.clock())
            entry["http_attempts"] += 1
            entry["status"] = "dispatched"
            connection.execute(
                "UPDATE operations SET reserved=reserved-1,used=used+1 WHERE operation_id=?",
                (identity,),
            )
        return clean_entry(entry)

    def observe(self, identity, step, *, status=None, duration_ms=None, returned_model=None):
        with self.change(identity) as (_connection, _row, entry):
            detail = (
                entry.get("steps", {}).get(step) if entry.get("purpose") == "retrieval" else entry
            )
            if detail is None or not detail.get("http_attempts"):
                return
            if (
                duration_ms is not None
                and isinstance(duration_ms, (float, int))
                and math.isfinite(duration_ms)
                and duration_ms >= 0
            ):
                detail["duration_ms"] = duration_ms
            if status and detail["status"] not in {"settled", "completed"}:
                detail["status"] = status
            if isinstance(returned_model, str) and len(returned_model) <= 160:
                detail["returned_model"] = returned_model

    def settle(self, identity, step, usage, *, output_limit):
        normalized = normalize_usage(usage)
        if normalized["output_tokens"] > output_limit:
            raise EconomicsError("Model output exceeded the admitted token bound.")
        cost = round(
            (normalized["input_tokens"] * 0.125 + normalized["output_tokens"] * 0.50) / 1_000_000,
            12,
        )
        exceeded = False
        with self.change(identity) as (connection, row, entry):
            retrieval = entry.get("purpose") == "retrieval"
            detail = (
                entry.get("steps", {}).get(step)
                if retrieval
                else entry
                if step == "generation"
                else None
            )
            if detail is None or not detail.get("http_attempts"):
                raise EconomicsError("Model usage has no dispatched step.")
            if detail["status"] in {"settled", "completed"} and detail.get("cost_usd") is not None:
                if any(detail.get(key) != value for key, value in normalized.items()):
                    raise EconomicsError("Settled model usage cannot change.")
                return clean_entry(entry)
            detail.update(
                **normalized,
                status="settled" if retrieval else "completed",
                settled_at=iso(self.clock()),
                cost_usd=cost,
            )
            if retrieval:
                settled = [item for item in entry["steps"].values() if item["status"] == "settled"]
                entry["known_cost_usd"] = round(sum(item["cost_usd"] for item in settled), 12)
                for key in ("input_tokens", "output_tokens"):
                    entry[key] = sum(item[key] for item in settled)
                if entry["known_cost_usd"] > entry["reservation_usd"]:
                    entry["status"], exceeded = "usage_exceeded", True
                elif entry["status"] in {"admitted", "dispatched", "step_settled"}:
                    entry["status"] = "step_settled"
                if (
                    row["reserved"] == 0
                    and len(settled) == len(entry["steps"])
                    and entry["status"] not in {"admitted", "dispatched", "step_settled"}
                ):
                    entry.update(
                        cost_usd=entry["known_cost_usd"],
                        completed_at=entry.get("completed_at") or iso(self.clock()),
                        cost_basis=COST_BASIS,
                    )
            else:
                entry.update(
                    completed_at=iso(self.clock()),
                    cost_basis=COST_BASIS,
                    input_rate_per_million=0.10,
                    input_rate_bound_per_million=0.125,
                    output_rate_per_million=0.50,
                )
                exceeded = cost > entry["reservation_usd"]
                if exceeded:
                    entry["status"] = "usage_exceeded"
                connection.execute(
                    "UPDATE operations SET reserved=0 WHERE operation_id=?", (identity,)
                )
        if exceeded:
            raise EconomicsError("Reported model usage exceeded its turn reservation.")
        return clean_entry(entry)

    def finish_retrieval(self, identity):
        with self.change(identity) as (connection, _row, entry):
            if entry.get("purpose") != "retrieval":
                raise EconomicsError("This is not an admitted retrieval operation.")
            if entry.get("cost_usd") is not None:
                return clean_entry(entry)
            if (
                any(detail["status"] != "settled" for detail in entry["steps"].values())
                or entry["known_cost_usd"] > entry["reservation_usd"]
            ):
                raise EconomicsError("Unresolved retrieval work retains its financial reservation.")
            entry.update(
                status="completed",
                completed_at=iso(self.clock()),
                cost_usd=entry["known_cost_usd"],
                cost_basis=COST_BASIS,
            )
            connection.execute("UPDATE operations SET reserved=0 WHERE operation_id=?", (identity,))
        return clean_entry(entry)

    def uncertain(self, identity, status):
        with self.change(identity) as (connection, _row, entry):
            if entry.get("cost_usd") is None:
                entry.update(status=status, updated_at=iso(self.clock()))
                if not entry.get("http_attempts"):
                    entry.update(cost_usd=0.0, known_cost_usd=0.0, completed_at=iso(self.clock()))
                elif entry.get("purpose") == "retrieval" and all(
                    detail["status"] == "settled" for detail in entry["steps"].values()
                ):
                    entry.update(
                        cost_usd=entry["known_cost_usd"],
                        completed_at=iso(self.clock()),
                        cost_basis=COST_BASIS,
                    )
                connection.execute(
                    "UPDATE operations SET reserved=0 WHERE operation_id=?", (identity,)
                )

    def recover(self):
        with self.tx() as connection:
            rows = connection.execute(
                "SELECT * FROM operations WHERE reserved>0 OR status IN ('admitted','dispatched','step_settled')"
            ).fetchall()
            for row in rows:
                entry = json.loads(row["record_json"])
                if entry.get("cost_usd") is None:
                    entry.update(status="interrupted", updated_at=iso(self.clock()))
                    if not entry.get("http_attempts"):
                        entry.update(
                            cost_usd=0.0, known_cost_usd=0.0, completed_at=iso(self.clock())
                        )
                    elif (
                        entry.get("purpose") == "retrieval"
                        and entry.get("steps")
                        and all(detail["status"] == "settled" for detail in entry["steps"].values())
                    ):
                        entry.update(
                            cost_usd=entry["known_cost_usd"],
                            completed_at=iso(self.clock()),
                            cost_basis=COST_BASIS,
                        )
                connection.execute(
                    "UPDATE operations SET reserved=0 WHERE operation_id=?", (row["operation_id"],)
                )
                self._save(connection, row["operation_id"], entry)

    def import_legacy(self, path):
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        data = json.loads(raw)
        if data.get("schema") != 1 or not isinstance(data.get("entries"), dict):
            raise EconomicsError("Legacy generation ledger is invalid; it was not reset.")
        with self.tx() as connection:
            imported = connection.execute(
                "SELECT * FROM imports WHERE source_path=?", (str(path.resolve()),)
            ).fetchone()
            if imported:
                if imported["source_sha256"] != digest:
                    raise EconomicsError(
                        "Imported legacy ledger changed; inspect it before importing more financial history."
                    )
                return
            backup = path.with_name(path.name + ".pre-sqlite-" + digest[:12] + ".bak")
            if backup.exists() and hashlib.sha256(backup.read_bytes()).hexdigest() != digest:
                raise EconomicsError(
                    "Existing pre-SQLite backup does not match the original ledger; no file was overwritten."
                )
            if not backup.exists():
                descriptor, temporary = tempfile.mkstemp(
                    prefix=".tokenomics-backup-", dir=path.parent
                )
                try:
                    with os.fdopen(descriptor, "wb") as output:
                        output.write(raw)
                        output.flush()
                        os.fsync(output.fileno())
                    os.replace(temporary, backup)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
            for identity, original in data["entries"].items():
                if connection.execute(
                    "SELECT 1 FROM operations WHERE operation_id=?", (identity,)
                ).fetchone():
                    raise EconomicsError(
                        "Legacy operation identity conflicts with existing SQLite history."
                    )
                entry = clean_entry(original)
                try:
                    stamp = datetime.fromisoformat(
                        entry.get("created_at", "").replace("Z", "+00:00")
                    ).timestamp()
                except ValueError:
                    stamp = 0
                local_day = (
                    datetime.fromtimestamp(stamp, UTC).astimezone(self.zone).date().isoformat()
                )
                window = connection.execute(
                    "SELECT * FROM windows WHERE day=? AND reason='legacy_import' LIMIT 1",
                    (local_day,),
                ).fetchone() or self._new_window(
                    connection, stamp, "legacy_import", historical=True
                )
                attempts = max(0, int(entry.get("http_attempts") or 0))
                if entry.get("purpose") == "retrieval":
                    entry.setdefault("steps", {})
                    for index in range(max(0, attempts - len(entry["steps"]))):
                        entry["steps"][f"legacy-unknown-{index}"] = {
                            "status": "unknown",
                            "http_attempts": 1,
                            "dispatched_at": entry.get("created_at"),
                        }
                connection.execute(
                    "INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?,?,?,1)",
                    (
                        identity,
                        window["id"],
                        entry.get("purpose", "generation"),
                        entry.get("model", "unknown"),
                        entry.get("status", "unknown"),
                        entry.get("created_at", iso(stamp)),
                        entry.get("completed_at"),
                        0,
                        attempts,
                        max(attempts, entry.get("max_http_attempts", 1)),
                        json.dumps(entry),
                    ),
                )
                self._save(connection, identity, entry)
            connection.execute(
                "INSERT INTO imports VALUES(?,?,?,?,?)",
                (str(path.resolve()), digest, str(backup), iso(self.clock()), len(data["entries"])),
            )

    def _totals(self, connection, *, day=None, window_id=None):
        where, args = (
            ("WHERE w.day=?", [day])
            if day
            else ("WHERE o.window_id=?", [window_id])
            if window_id
            else ("", [])
        )
        operations = connection.execute(
            f"SELECT o.* FROM operations o JOIN windows w ON w.id=o.window_id {where}", args
        ).fetchall()
        invocations = connection.execute(
            f"SELECT i.* FROM invocations i JOIN operations o ON o.operation_id=i.operation_id JOIN windows w ON w.id=o.window_id {where}",
            args,
        ).fetchall()
        held = known = 0.0
        for operation in operations:
            entry = json.loads(operation["record_json"])
            known += (
                entry.get("cost_usd")
                if entry.get("cost_usd") is not None
                else entry.get("known_cost_usd", 0)
            )
            if entry.get("cost_usd") is None and operation["used"]:
                held += max(0, entry.get("reservation_usd", 0) - entry.get("known_cost_usd", 0))
        return {
            "operations": len(operations),
            **self._invocation_totals(invocations),
            "estimated_cost_usd": round(known, 12),
            "unknown_held_usd": round(held, 12),
        }

    @staticmethod
    def _invocation_totals(rows):
        return {
            "invocations": len(rows),
            "known_usage": sum(
                row["input_tokens"] is not None and row["output_tokens"] is not None for row in rows
            ),
            "unknown_usage": sum(
                row["input_tokens"] is None or row["output_tokens"] is None for row in rows
            ),
            **{
                key: sum(row[key] or 0 for row in rows)
                for key in (
                    "input_tokens",
                    "output_tokens",
                    "cached_input_tokens",
                    "reasoning_tokens",
                )
            },
            "estimated_cost_usd": round(sum(row["estimated_cost_usd"] or 0 for row in rows), 12),
            "token_coverage": {
                key: sum(row[key] is not None for row in rows)
                for key in (
                    "input_tokens",
                    "output_tokens",
                    "cached_input_tokens",
                    "reasoning_tokens",
                )
            },
            "cost_coverage": sum(row["estimated_cost_usd"] is not None for row in rows),
            "totals_basis": "known subtotals; missing usage is not measured zero",
        }

    def admin(self, *, limit=25, cursor=None, day=None):
        with self.tx() as connection:
            current = self._summary(connection, self._window(connection))
            rows = connection.execute(
                "SELECT o.*,w.day FROM operations o JOIN windows w ON w.id=o.window_id"
                + (" WHERE w.day=?" if day else "")
                + " ORDER BY o.created_at DESC,o.operation_id DESC",
                [day] if day else [],
            ).fetchall()
            if cursor:
                index = next(
                    (i for i, row in enumerate(rows) if row["operation_id"] == cursor), None
                )
                if index is None:
                    raise EconomicsError("Admin cursor is unavailable in the selected day.")
                rows = rows[index + 1 :]
            selected, operations = rows[:limit], []
            for row in selected:
                entry = json.loads(row["record_json"])
                invocations = [
                    dict(item)
                    for item in connection.execute(
                        "SELECT step,role,model,status,dispatched_at,settled_at,duration_ms,input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,estimated_cost_usd,cost_basis_version FROM invocations WHERE operation_id=? ORDER BY dispatched_at,step",
                        (row["operation_id"],),
                    )
                ]
                operations.append(
                    {
                        "operation_id": row["operation_id"],
                        "purpose": row["purpose"],
                        "model": row["model"],
                        "status": row["status"],
                        "window_id": row["window_id"],
                        "day": row["day"],
                        "created_at": row["created_at"],
                        "completed_at": row["completed_at"],
                        "reserved_credits": row["reserved"],
                        "used_credits": row["used"],
                        "max_invocations": row["max_invocations"],
                        "reservation_usd": entry.get("reservation_usd", 0),
                        "estimated_cost_usd": entry.get("cost_usd"),
                        "known_cost_usd": entry.get("known_cost_usd", entry.get("cost_usd") or 0),
                        "unknown_held_usd": max(
                            0, entry.get("reservation_usd", 0) - entry.get("known_cost_usd", 0)
                        )
                        if entry.get("cost_usd") is None and row["used"]
                        else 0,
                        "invocations": invocations,
                    }
                )
            observed = [
                dict(row)
                for row in connection.execute(
                    "SELECT i.*,w.day FROM invocations i JOIN windows w ON w.id=i.window_id"
                    + (" WHERE w.day=?" if day else ""),
                    [day] if day else [],
                )
            ]
            grouped = {}
            for output, field in [
                ("by_role", "role"),
                ("by_model", "model"),
                ("by_day", "day"),
                ("by_hour", "hour"),
            ]:
                buckets = {}
                for row in observed:
                    value = (
                        (row.get("dispatched_at") or "unknown")[:13]
                        if field == "hour"
                        else row[field]
                    )
                    buckets.setdefault(value, []).append(row)
                grouped[output] = [
                    {field: key, **self._invocation_totals(bucket)}
                    for key, bucket in sorted(buckets.items())
                ]
            return {
                "economics": current,
                "totals": self._totals(connection, day=day),
                **grouped,
                "operations": operations,
                "next_cursor": selected[-1]["operation_id"] if len(rows) > limit else None,
            }
