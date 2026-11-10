"""Single-writer local state plus bounded, atomically published replay history."""

from __future__ import annotations

import asyncio
import copy
import fcntl
import json
import os
import tempfile
import uuid
from collections.abc import Callable
from pathlib import Path

from .contracts import now

TERMINAL = {"SUCCEEDED", "EMPTY", "PARTIAL", "FAILED", "CANCELLED", "INTERRUPTED"}


class Store:
    def __init__(self, path: Path, *, event_limit: int = 64, event_bytes: int = 4 * 1024 * 1024):
        self.path = path
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._owner = (path / "owner.lock").open("a+")
        try:
            fcntl.flock(self._owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self._owner.close()
            raise RuntimeError(
                "Another application writer already owns this state directory."
            ) from None
        self.lock = asyncio.Lock()
        self.changed = asyncio.Condition()
        self.event_limit = event_limit
        self.event_bytes = event_bytes
        self.runs: dict[str, dict] = {}
        for file in path.glob("*.json"):
            document = json.loads(file.read_text())
            if file.stem != document["id"]:
                raise RuntimeError("State filename/identity mismatch.")
            self.runs[file.stem] = document
            if self._recover(document):
                self._commit(document, "run.interrupted")

    def _recover(self, document: dict) -> bool:
        if document["status"] in TERMINAL:
            return False
        document["status"] = "INTERRUPTED"
        document["warnings"].append("Application restarted; interrupted work was not replayed.")
        for op in document["operations"].values():
            if op.get("status") in {"running", "queued"}:
                op["status"] = "interrupted"
        return True

    def close(self):
        if not self._owner.closed:
            fcntl.flock(self._owner, fcntl.LOCK_UN)
            self._owner.close()

    @staticmethod
    def public(document: dict) -> dict:
        result = copy.deepcopy({k: v for k, v in document.items() if not k.startswith("_")})
        result["entities"] = [
            entity
            for entity in result["entities"]
            if entity.get("eligible") or entity["source_ref"] in result["selections"]
        ]
        return result

    def _write(self, document: dict):
        payload = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
        descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=self.path)
        try:
            with os.fdopen(descriptor, "w") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path / f"{document['id']}.json")
            directory = os.open(self.path, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def _commit(self, document: dict, event_kind: str):
        document["_sequence"] += 1
        document["cursor"] = f"{document['_stream_id']}:{document['_sequence']}"
        document["updated_at"] = now()
        event = {
            "id": document["cursor"],
            "sequence": document["_sequence"],
            "event": "state",
            "data": {"type": event_kind, "snapshot": self.public(document)},
        }
        if len(json.dumps(event).encode()) > self.event_bytes:
            raise ValueError("An application event exceeds the configured publication bound.")
        document["_events"].append(event)
        while len(document["_events"]) > self.event_limit or (
            len(json.dumps(document["_events"]).encode()) > self.event_bytes
        ):
            document["_events"].pop(0)
        self._write(document)

    async def add(self, document: dict) -> dict:
        async with self.lock:
            if document["id"] in self.runs:
                raise ValueError("Duplicate run identity.")
            candidate = copy.deepcopy(document)
            self._commit(candidate, "run.created")
            self.runs[candidate["id"]] = candidate
            result = self.public(candidate)
        async with self.changed:
            self.changed.notify_all()
        return result

    async def mutate(
        self, run_id: str, edit: Callable[[dict], None], kind: str = "run.updated"
    ) -> dict:
        async with self.lock:
            candidate = copy.deepcopy(self.runs[run_id])
            edit(candidate)
            self._commit(candidate, kind)
            self.runs[run_id] = candidate
            result = self.public(candidate)
        async with self.changed:
            self.changed.notify_all()
        return result

    async def get(self, run_id: str, *, private: bool = False) -> dict:
        async with self.lock:
            document = self.runs[run_id]
            return copy.deepcopy(document) if private else self.public(document)

    async def list(self) -> list[dict]:
        async with self.lock:
            return [
                self.public(x)
                for x in sorted(self.runs.values(), key=lambda d: d["created_at"], reverse=True)
            ]

    async def replay(self, run_id: str, cursor: str | None) -> list[dict] | None:
        async with self.lock:
            document = self.runs[run_id]
            if not cursor:
                return copy.deepcopy(document["_events"][-1:])
            try:
                stream, sequence_text = cursor.rsplit(":", 1)
                sequence = int(sequence_text)
            except (ValueError, AttributeError):
                return None
            retained = document["_events"]
            oldest = retained[0]["sequence"] if retained else document["_sequence"] + 1
            if (
                stream != document["_stream_id"]
                or sequence < oldest - 1
                or sequence > document["_sequence"]
            ):
                return None
            return copy.deepcopy([e for e in retained if e["sequence"] > sequence])


def new_document(request: dict, mode: str, key_hash: str, request_hash: str) -> dict:
    return {
        "id": uuid.uuid4().hex,
        "question": request["question"],
        "provider": request["provider"],
        "filters": request.get("filters", {}),
        "mode": mode,
        "status": "CREATED",
        "created_at": now(),
        "updated_at": now(),
        "entities": [],
        "selections": {},
        "checks": {},
        "operations": {name: {"status": "queued"} for name in ("lexical", "semantic")},
        "warnings": [],
        "summary": None,
        "trace": [],
        "usage": {"research_attempts": 0, "by_provider": {}, "reserved_by_provider": {}},
        "revision": 0,
        "cursor": "",
        "runtime": {"mode": mode, "agent": "deepagents-scripted-fixture"},
        "plan": {
            "strategy": "hybrid",
            "raw_per_branch": 10,
            "raw_union": 20,
            "fusion": {
                "method": "rrf",
                "rank_constant": 60,
                "weights": {"lexical": 1, "semantic": 1},
            },
            "filter_policy": "required fields must be known and pass; no relaxed constraints",
        },
        "_stream_id": uuid.uuid4().hex,
        "_sequence": 0,
        "_events": [],
        "_idempotency_hash": key_hash,
        "_request_hash": request_hash,
        "_observations": {},
        "_grants": {},
        "_exports": [],
        "_search_started": False,
    }
