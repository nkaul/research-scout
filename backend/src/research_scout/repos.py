"""Saved-context public repository discovery with independent progress and recovery."""

import asyncio
import copy
import json
import re
import uuid
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from .agents.repos import run_repository_specialist
from .contracts import fingerprint, now
from .datasets import DatasetStore, problem_context
from .repo_contracts import (
    MAX_READMES,
    MAX_REPO_REQUESTS,
    RepoOperationRequest,
    RepoRecord,
    RepoSearchRequest,
)
from .repo_evidence import rank_repositories
from .repo_reading import RepositoryNotes, validate_source
from .store import TERMINAL


class RepoStore(DatasetStore):
    def _recover(self, document):
        if document["status"] in TERMINAL:
            return False
        document.update(status="INTERRUPTED", completed_at=now())
        document["warnings"].append(
            "Repository discovery was interrupted by restart; no provider work was replayed."
        )
        stop_pending(document, "interrupted")
        return True


def stop_pending(document, status):
    for activity in document["provider_activity"]:
        if activity["status"] in {"queued", "running"}:
            activity["status"] = status
    for record in document["records"]:
        if record["readme"]["status"] in {"pending", "loading"}:
            record["readme"].update(
                status="not_assessed",
                error={
                    "code": "README_INTERRUPTED",
                    "message": "README work stopped before a complete source observation was available.",
                },
            )
            from .repo_evidence import version_repository

            record.update(version_repository(record))
    for span in document["timing_spans"]:
        if not span.get("completed_at"):
            span["status"] = status


class RepoState(TypedDict):
    search_id: str


class RepositoryDiscovery:
    def __init__(self, core, *, specialist_runner=None):
        self.core = core
        self.store = RepoStore(core.settings.state_dir / "repo-searches", event_limit=64)
        self.notes = RepositoryNotes(core.settings.state_dir / "repo-notes")
        self.tasks = {}
        self.admission = asyncio.Lock()
        self.dispatch = asyncio.Lock()
        self.specialist_runner = specialist_runner or run_repository_specialist
        graph = StateGraph(RepoState)
        graph.add_node("repository_discovery_specialist", self._collect)
        graph.add_edge(START, "repository_discovery_specialist")
        graph.add_edge("repository_discovery_specialist", END)
        self.graph = graph.compile(name="scout_repository_discovery")

    async def providers(self):
        mode = self.core.settings.repo_provider_mode
        try:
            result = await self.core.client.get(
                self.core.settings.repo_provider_url + "/health", timeout=1
            )
            result.raise_for_status()
            value = result.json()
            if value.get("provider") != "github" or not value.get("capabilities", {}).get(
                "repositories"
            ):
                raise ValueError("Repository capability unavailable")
            provider = {
                "id": "github",
                "label": "GitHub",
                "mode": value["mode"],
                "status": "ready",
                "readme_limit": MAX_READMES,
                "identity_check_limit": MAX_READMES,
                "request_limit": MAX_REPO_REQUESTS,
                "transport": "official_rest",
                "vectors": False,
                "authenticated": value.get("authenticated", False),
            }
        except Exception:
            provider = {
                "id": "github",
                "label": "GitHub",
                "mode": mode,
                "status": "unavailable",
                "blocked_reason": "The isolated public GitHub service is unavailable.",
                "readme_limit": MAX_READMES,
                "identity_check_limit": MAX_READMES,
                "request_limit": MAX_REPO_REQUESTS,
            }
        return {"providers": [provider]}

    async def list(self, conversation_id=None, turn_id=None):
        async with self.store.lock:
            rows = sorted(
                self.store.runs.values(), key=lambda item: item["created_at"], reverse=True
            )
            rows = [
                row
                for row in rows
                if (not conversation_id or row["context"]["conversation_id"] == conversation_id)
                and (not turn_id or row["context"]["turn_id"] == turn_id)
            ][:24]
            return [
                copy.deepcopy(
                    {
                        key: row.get(key)
                        for key in (
                            "id",
                            "status",
                            "revision",
                            "created_at",
                            "completed_at",
                            "context",
                            "question",
                            "limit",
                            "readme_limit",
                            "identity_check_limit",
                            "request_limit",
                        )
                    }
                )
                for row in rows
            ]

    async def get(self, search_id, *, private=False):
        from .core import ApplicationError

        try:
            return await self.store.get(search_id, private=private)
        except KeyError:
            raise ApplicationError("Repository search not found.", 404) from None

    @staticmethod
    def record(search, record_id, evidence_version=None):
        from .core import ApplicationError

        if not re.fullmatch(r"[0-9]{1,30}", record_id):
            raise ApplicationError("A numeric saved GitHub repository identity is required.", 400)
        current = next((row for row in search["records"] if row["record_id"] == record_id), None)
        if evidence_version is None or current and current["evidence_version"] == evidence_version:
            return current
        return search.get("_record_versions", {}).get(record_id, {}).get(evidence_version)

    async def evidence(self, search_id, record_id, evidence_version):
        from .core import ApplicationError

        search = await self.get(search_id, private=True)
        record = self.record(search, record_id, evidence_version)
        if record is None:
            note = await self.notes.get(search["context"], record_id, private=True)
            record = note.get("_evidence", {}).get(evidence_version)
        if record is None:
            raise ApplicationError("This saved repository evidence version is unavailable.", 409)
        return copy.deepcopy(record)

    async def readable(self, search_id, record_id, evidence_version):
        from .core import ApplicationError

        record = await self.evidence(search_id, record_id, evidence_version)
        readme = record["readme"]
        if readme.get("status") != "available" or readme.get("artifact_available") is not True:
            raise ApplicationError(
                "This saved record contains excerpts only; no original README was retained. No GitHub request was made.",
                404,
            )
        identity = readme.get("artifact_id", "")
        if not re.fullmatch(r"[0-9a-f]{64}", identity):
            raise ApplicationError("Saved README artifact reference is invalid.", 409)
        try:
            response = await self.core.client.get(
                self.core.settings.repo_provider_url + "/saved-readmes/" + identity, timeout=5
            )
            if response.status_code == 404:
                raise ApplicationError(
                    "The saved README artifact is unavailable; saved excerpts remain readable. No GitHub request was made.",
                    404,
                )
            response.raise_for_status()
            if len(response.content) > 2 * 1024 * 1024:
                raise ValueError("Saved README response exceeded its bound.")
            return validate_source(response.json(), record)
        except ApplicationError:
            raise
        except Exception as failure:
            raise ApplicationError(
                "The saved README could not be read or verified; excerpts remain available and no upstream acquisition was attempted.",
                502,
            ) from failure

    async def get_note(self, search_id, record_id):
        from .core import ApplicationError

        search = await self.get(search_id, private=True)
        if self.record(search, record_id) is None:
            raise ApplicationError("Repository not found in this saved search.", 404)
        return await self.notes.get(search["context"], record_id)

    async def put_note(self, search_id, record_id, body):
        from .core import ApplicationError

        search = await self.get(search_id, private=True)
        if self.record(search, record_id) is None:
            raise ApplicationError("Repository not found in this saved search.", 404)
        return await self.notes.put(
            search, record_id, body, self.record(search, record_id, body.evidence_version)
        )

    async def create(self, request: RepoSearchRequest, *, launch=True):
        from .core import ApplicationError

        signature = fingerprint(request.model_dump(exclude={"idempotency_key"}))
        async with self.admission:
            for saved in self.store.runs.values():
                if saved.get("_idempotency_key") == request.idempotency_key:
                    if saved["_request_fingerprint"] != signature:
                        raise ApplicationError(
                            "Repository request key belongs to a different saved query or limit."
                        )
                    return self.store.public(saved)
            conversation = await self.core.conversations.get(request.conversation_id, private=True)
            turn = next(
                (item for item in conversation["turns"] if item["id"] == request.turn_id), None
            )
            if turn is None:
                raise ApplicationError("Saved research query not found.", 404)
            try:
                context = problem_context(conversation, turn, "repos")
            except ValueError as error:
                raise ApplicationError(str(error).replace("dataset", "repository")) from None
            if sum(row["status"] not in TERMINAL for row in self.store.runs.values()) >= 2:
                raise ApplicationError(
                    "Two repository searches are already active; finish or stop one first."
                )
            identity = uuid.uuid4().hex
            document = {
                "id": identity,
                "question": turn["message"],
                "context": context,
                "providers": ["github"],
                "limit": request.limit,
                "readme_limit": min(MAX_READMES, request.limit),
                "identity_check_limit": min(MAX_READMES, request.limit),
                "request_limit": 1 + 2 * min(MAX_READMES, request.limit),
                "status": "RUNNING",
                "created_at": now(),
                "records": [],
                "provider_activity": [
                    {"provider": "github", "status": "queued", "attempts": 0, "record_count": 0}
                ],
                "timing_spans": [],
                "warnings": [],
                "usage": {
                    "github_http_attempts": 0,
                    "search_attempts": 0,
                    "readme_attempts": 0,
                    "identity_attempts": 0,
                    "model_http_attempts": 0,
                    "simulated_attempts": 0,
                },
                "revision": 0,
                "cursor": "",
                "operations": {},
                "_idempotency_key": request.idempotency_key,
                "_request_fingerprint": signature,
                "_sequence": 0,
                "_stream_id": uuid.uuid4().hex,
                "_events": [],
                "_claimed": False,
                "_receipt": None,
            }
            saved = await self.store.add(document)
            if launch:
                self.launch(identity)
            return saved

    def launch(self, identity):
        if identity not in self.tasks:
            self.tasks[identity] = asyncio.create_task(self._run(identity))

    async def _run(self, identity):
        try:
            await self.graph.ainvoke({"search_id": identity})
            current = await self.get(identity)
            if current["status"] in TERMINAL:
                return
            outcome = current["provider_activity"][0]["status"]
            status = (
                "PARTIAL"
                if current["records"] and outcome != "succeeded"
                else "FAILED"
                if outcome != "succeeded"
                else "SUCCEEDED"
                if current["records"]
                else "EMPTY"
            )
            await self.store.mutate(
                identity,
                lambda row: row.update(status=status, completed_at=now()),
                "repos.completed",
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            current = await self.get(identity)
            if current["status"] not in TERMINAL:

                def failed(row):
                    row.update(status="PARTIAL" if row["records"] else "FAILED", completed_at=now())
                    row["warnings"].append(
                        "Repository specialist could not finish; saved public metadata remains available without automatic retry."
                    )
                    stop_pending(row, "failed")

                await self.store.mutate(identity, failed, "repos.failed")

    async def _collect(self, state):
        saved = await self.get(state["search_id"])
        await self.specialist_runner(
            saved["context"],
            "github",
            mcp_url=self.core.settings.core_url.rstrip("/") + "/mcp/",
            search_id=saved["id"],
        )
        return {}

    async def search_repositories(self, search_id):
        from .core import ApplicationError

        async with self.dispatch:
            saved = await self.get(search_id, private=True)
            if saved["_receipt"]:
                return saved["_receipt"]
            if saved["status"] in TERMINAL or saved["_claimed"]:
                raise ApplicationError(
                    "Repository work is stopped or already admitted; no redispatch is allowed."
                )

            def claimed(row):
                row["_claimed"] = True
                row["provider_activity"][0]["status"] = "running"

            await self.store.mutate(search_id, claimed, "repos.provider_started")
        context = saved["context"]
        body = RepoOperationRequest(
            run_id=search_id,
            operation_id=f"repos:{search_id}:github",
            query=context["query"],
            keywords=context["keywords"],
            tags=context["tags"],
            domain=context["domain"],
            intent=context["intent"],
            limit=saved["limit"],
        )
        completed = None
        try:
            async with self.core.client.stream(
                "POST",
                self.core.settings.repo_provider_url + "/operations/repositories",
                json=body.model_dump(),
                timeout=180,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if len(line.encode()) > 1024 * 1024:
                        raise ValueError("Repository event exceeded its bound.")
                    event = json.loads(line)
                    if (
                        event.get("provider") != "github"
                        or event.get("mode") != self.core.settings.repo_provider_mode
                    ):
                        raise ValueError("Repository provider identity mismatch.")
                    current = await self.get(search_id)
                    if current["status"] in TERMINAL:
                        return {
                            "provider": "github",
                            "status": "cancelled",
                            "record_count": len(current["records"]),
                        }
                    record = (
                        RepoRecord.model_validate(event["record"]).model_dump()
                        if event.get("type") == "repository"
                        else None
                    )
                    if record and record["mode"] != self.core.settings.repo_provider_mode:
                        raise ValueError("Repository observation mode mismatch.")

                    def apply(row, event=event, record=record):
                        if row["status"] in TERMINAL:
                            return
                        usage = event.get("usage", {})
                        for key in row["usage"]:
                            if key == "model_http_attempts":
                                continue
                            value = usage.get(key)
                            if type(value) is int and 0 <= value <= MAX_REPO_REQUESTS:
                                row["usage"][key] = max(row["usage"][key], value)
                        if record:
                            versions = row.setdefault("_record_versions", {}).setdefault(
                                record["record_id"], {}
                            )
                            versions[record["evidence_version"]] = copy.deepcopy(record)
                            index = next(
                                (
                                    i
                                    for i, item in enumerate(row["records"])
                                    if item["repo_id"] == record["repo_id"]
                                ),
                                None,
                            )
                            if index is None:
                                if len(row["records"]) >= row["limit"]:
                                    raise ValueError("Repository record count exceeded scope.")
                                row["records"].append(record)
                            else:
                                row["records"][index] = record
                            # App eligibility and rank use the frozen context;
                            # provider conclusions never grant relevance.
                            row["records"] = rank_repositories(row["records"], context)
                            row["provider_activity"][0]["record_count"] = len(row["records"])
                        elif event.get("type") == "stage":
                            span_id = event["id"]
                            prior = next(
                                (span for span in row["timing_spans"] if span["id"] == span_id),
                                None,
                            )
                            fields = {
                                key: event[key]
                                for key in (
                                    "status",
                                    "started_at",
                                    "completed_at",
                                    "duration_ms",
                                    "operation",
                                    "record_id",
                                    "executed_arguments",
                                    "cache_hit",
                                    "error",
                                )
                                if key in event
                            }
                            if prior:
                                prior.update(fields)
                            else:
                                row["timing_spans"].append(
                                    {
                                        "id": span_id,
                                        "phase": event["operation"],
                                        "label": "GitHub repository search"
                                        if event["operation"] == "repository_search"
                                        else f"Public repository ID check {event.get('record_id', '')}"
                                        if event["operation"] == "identity_check"
                                        else f"README + identity validation {event.get('record_id', '')}",
                                        "provider": "github",
                                        **fields,
                                    }
                                )
                            if event.get("operation") == "repository_search" and event.get(
                                "executed_arguments"
                            ):
                                row["provider_activity"][0].update(
                                    query=event["executed_arguments"].get("q"),
                                    executed_arguments=event["executed_arguments"],
                                )
                        elif event.get("type") == "complete":
                            outcome = event.get("status")
                            if outcome not in {"succeeded", "partial", "failed"}:
                                raise ValueError("Unknown repository provider result.")
                            row["provider_activity"][0].update(
                                status=outcome,
                                attempts=row["usage"]["github_http_attempts"],
                                simulated_attempts=row["usage"]["simulated_attempts"],
                                record_count=len(row["records"]),
                                query=event.get("query"),
                                executed_arguments=event.get("executed_arguments"),
                                error=event.get("error"),
                                readme_limit=event.get("readme_limit"),
                                readme_requests=event.get("readme_requests"),
                                identity_requests=event.get("identity_requests"),
                                identity_check_limit=event.get("identity_check_limit"),
                                request_limit=event.get("request_limit"),
                                incomplete_results=event.get("incomplete_results", False),
                            )
                            if event.get("incomplete_results"):
                                row["warnings"].append(
                                    "GitHub reported incomplete search results; no extra page or broadening was requested."
                                )
                            if event.get("error"):
                                row["warnings"].append(event["error"]["message"])
                            stop_pending(row, "interrupted")
                            row["_receipt"] = {
                                "provider": "github",
                                "status": outcome,
                                "record_count": len(row["records"]),
                            }

                    await self.store.mutate(
                        search_id, apply, f"repos.{event.get('type', 'progress')}"
                    )
                    if event.get("type") == "complete":
                        completed = event
            if completed is None:
                raise ValueError("Repository stream ended without a terminal receipt.")
            current = await self.get(search_id, private=True)
            return current["_receipt"]
        except asyncio.CancelledError:
            raise
        except Exception:

            def failed(row):
                if row["status"] in TERMINAL:
                    return
                row["provider_activity"][0].update(
                    status="failed",
                    error_code="REPOSITORY_STREAM_FAILED",
                    message="Repository stream failed; dispatched work was not replayed.",
                )
                stop_pending(row, "interrupted")

            await self.store.mutate(search_id, failed, "repos.provider_failed")
            return {
                "provider": "github",
                "status": "failed",
                "record_count": len((await self.get(search_id))["records"]),
            }

    async def cancel(self, search_id):
        saved = await self.get(search_id)
        if saved["status"] in TERMINAL:
            return saved

        def stopped(row):
            row.update(status="CANCELLED", completed_at=now())
            stop_pending(row, "cancelled")

        result = await self.store.mutate(search_id, stopped, "repos.cancelled")
        task = self.tasks.get(search_id)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return result

    async def close(self):
        for task in self.tasks.values():
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        self.store.close()
        self.notes.close()
