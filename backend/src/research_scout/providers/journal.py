"""Single-writer durable operation receipts; uncertain work is never replayed."""

import asyncio
import fcntl
import hashlib
import json
import os
import tempfile
import time
from pathlib import Path


class ProviderError(Exception):
    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code, self.status = code, status


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as stream:
            json.dump(data, stream, ensure_ascii=False, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Journal:
    def __init__(self, directory: Path, run_cap: int, *, rate_limits: tuple = ()):
        self.directory, self.run_cap = directory, run_cap
        self.rate_limits = rate_limits
        self.lock = asyncio.Lock()
        self._writer = None

    def acquire_writer(self) -> None:
        """Claim one provider/mode directory for the complete server lifespan."""
        if self._writer is not None:
            raise RuntimeError("This provider journal already has an active writer lifespan.")
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        writer = (self.directory / ".writer.lock").open("a+")
        try:
            fcntl.flock(writer, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            writer.close()
            raise RuntimeError(
                "Another provider writer already owns this provider/mode state directory."
            ) from None
        self._writer = writer

    def close(self) -> None:
        if self._writer is not None:
            try:
                fcntl.flock(self._writer, fcntl.LOCK_UN)
            finally:
                self._writer.close()
                self._writer = None

    def path(self, kind: str, identity: str) -> Path:
        digest = hashlib.sha256(identity.encode()).hexdigest()
        return self.directory / kind / f"{digest}.json"

    def read(self, kind: str, identity: str) -> dict | None:
        path = self.path(kind, identity)
        return json.loads(path.read_text()) if path.exists() else None

    async def begin(self, request: dict, kind: str) -> tuple[dict, bool]:
        # A smaller renewed allowance does not change the identity of saved work.
        scope = {k: v for k, v in request.items() if k != "remaining_attempts"}
        if "limits" in scope:
            scope["limits"] = {
                k: v for k, v in scope["limits"].items() if k != "remaining_attempts"
            }
        fingerprint = hashlib.sha256(json.dumps([kind, scope], sort_keys=True).encode()).hexdigest()
        async with self.lock:
            receipt = self.read("operations", request["operation_id"])
            if receipt:
                if receipt["fingerprint"] != fingerprint:
                    raise ProviderError(
                        "OPERATION_CONFLICT", "Operation ID belongs to a different request.", 409
                    )
                if receipt["status"] != "complete":
                    raise ProviderError(
                        "OPERATION_UNCERTAIN",
                        "Prior operation is active or interrupted; inspect its saved status, do not redispatch.",
                        409,
                    )
                return receipt, True
            receipt = {
                "operation_id": request["operation_id"],
                "run_id": request["run_id"],
                "fingerprint": fingerprint,
                "status": "running",
                "attempts": 0,
                "events": [],
            }
            atomic_json(self.path("operations", request["operation_id"]), receipt)
            return receipt, False

    async def attempt(self, receipt: dict, allowance: int) -> None:
        async with self.lock:
            run = self.read("runs", receipt["run_id"]) or {"attempts": 0}
            if receipt["attempts"] >= allowance or run["attempts"] >= self.run_cap:
                raise ProviderError(
                    "ATTEMPT_LIMIT", "Provider operation/run attempt allowance exhausted.", 429
                )
            windows = []
            for label, seconds, limit in self.rate_limits:
                key = f"{label}:{int(time.time() // seconds)}"
                window = self.read("rate", key) or {"attempts": 0}
                if window["attempts"] >= limit:
                    raise ProviderError(
                        "UPSTREAM_QUOTA_LIMIT",
                        "The durable provider quota window is exhausted; no request was sent.",
                        429,
                    )
                windows.append((key, window))
            # The run reservation is published first. A crash can overcount, never grant free retries.
            run["attempts"] += 1
            atomic_json(self.path("runs", receipt["run_id"]), run)
            for key, window in windows:
                window["attempts"] += 1
                atomic_json(self.path("rate", key), window)
            receipt["attempts"] += 1
            atomic_json(self.path("operations", receipt["operation_id"]), receipt)

    async def append(self, receipt: dict, event: dict) -> None:
        async with self.lock:
            receipt["events"].append(event)
            atomic_json(self.path("operations", receipt["operation_id"]), receipt)

    async def embedding(self, receipt: dict, texts: int, batches: int = 2) -> None:
        async with self.lock:
            run = self.read("runs", receipt["run_id"]) or {"attempts": 0}
            if (
                run.get("embedding_texts", 0) + texts > 42
                or run.get("embedding_batches", 0) + batches > 4
            ):
                raise ProviderError(
                    "EMBEDDING_LIMIT", "The durable local-encoding run allowance is exhausted.", 429
                )
            for key, amount in (("embedding_texts", texts), ("embedding_batches", batches)):
                run[key] = run.get(key, 0) + amount
                receipt[key] = receipt.get(key, 0) + amount
            atomic_json(self.path("runs", receipt["run_id"]), run)
            atomic_json(self.path("operations", receipt["operation_id"]), receipt)

    async def finish(
        self, receipt: dict, result: dict | None = None, interrupted: bool = False
    ) -> None:
        async with self.lock:
            receipt["status"] = "interrupted" if interrupted else "complete"
            if result is not None:
                receipt["result"] = result
            atomic_json(self.path("operations", receipt["operation_id"]), receipt)
