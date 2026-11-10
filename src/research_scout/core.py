"""Application-owned lifecycle, deterministic routing and progressive publication."""

from __future__ import annotations

import asyncio
import copy
import json
import os
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx

from .contracts import (
    ResearchRequest,
    SelectionRequest,
    SourceRecord,
    filter_record,
    fingerprint,
    now,
    rank_score,
)
from .settings import LOCAL_POOL_PROVIDERS, model_mode, provider_mode
from .store import TERMINAL, Store, new_document

PROVIDERS = {
    "openalex": ("OpenAlex", "Primary discovery", 8111, 8),
    "crossref": ("Crossref", "Publication discovery, DOI agency and metadata", 8112, 6),
    "datacite": ("DataCite", "DOI metadata", 8113, 3),
    "semantic_scholar": ("Semantic Scholar", "Complementary discovery", 8114, 8),
    "arxiv": ("arXiv", "Preprint discovery and abstracts", 8115, 8),
    "openaire": ("OpenAIRE", "Research output discovery and descriptions", 8116, 8),
    "europe_pmc": ("Europe PMC", "Life-science discovery and abstracts", 8117, 8),
    "unpaywall": ("Unpaywall", "DOI open-access resolution", 8118, 3),
}


class ApplicationError(Exception):
    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


@dataclass
class Settings:
    state_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("SCOUT_STATE_DIR", ".scout"))
    )
    mode: str = field(default_factory=lambda: os.environ.get("SCOUT_MODE", "fixture"))
    core_url: str = field(
        default_factory=lambda: os.environ.get("SCOUT_CORE_URL", "http://127.0.0.1:8100")
    )
    provider_urls: dict[str, str] = field(
        default_factory=lambda: {
            key: os.environ.get(f"SCOUT_{key.upper()}_URL", f"http://127.0.0.1:{values[2]}")
            for key, values in PROVIDERS.items()
        }
    )
    event_limit: int = 64
    agent_deadline: float = 180
    provider_modes: dict[str, str] | None = None
    model_mode: str | None = None

    def __post_init__(self):
        if self.mode not in {"fixture", "live"}:
            raise ValueError("SCOUT_MODE must be fixture or live.")
        explicit_modes = self.provider_modes or {}
        if set(explicit_modes) - set(PROVIDERS):
            raise ValueError("Unknown provider mode key.")
        self.provider_modes = {
            key: explicit_modes[key]
            if key in explicit_modes
            else provider_mode(key, default=self.mode)
            for key in PROVIDERS
        }
        if any(value not in {"fixture", "live"} for value in self.provider_modes.values()):
            raise ValueError("Every provider must have an explicit fixture/live mode.")
        default_urls = {
            key: os.environ.get(f"SCOUT_{key.upper()}_URL", f"http://127.0.0.1:{values[2]}")
            for key, values in PROVIDERS.items()
        }
        if set(self.provider_urls) - set(PROVIDERS):
            raise ValueError("Unknown provider URL key.")
        self.provider_urls = {**default_urls, **self.provider_urls}
        self.model_mode = self.model_mode or model_mode(default="fixture")
        if self.model_mode not in {"fixture", "disabled"}:
            raise ValueError(
                "Deep Agents capability dispatch supports disabled or fixture; configure AI query refinement separately."
            )
        for url in [self.core_url, *self.provider_urls.values()]:
            parsed = urlparse(url)
            if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
                raise ValueError(
                    "Increment 1 internal service URLs must be loopback HTTP addresses."
                )


class Core:
    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
        agent_runner=None,
        generation_config=None,
        generation_streamer=None,
        retrieval_config=None,
        retrieval_requester=None,
    ):
        self.settings = settings
        self.store = Store(settings.state_dir / "core", event_limit=settings.event_limit)
        self.client = client or httpx.AsyncClient(timeout=30, trust_env=False)
        self._owns_client = client is None
        self.agent_runner = agent_runner
        self._start_lock = asyncio.Lock()
        self._search_lock = asyncio.Lock()
        self._search_tasks: dict[str, asyncio.Task] = {}
        self._tasks: set[asyncio.Task] = set()
        self._review_locks: dict[tuple[str, str, str], asyncio.Lock] = {}
        self.active_run: str | None = None
        self.active_turn: str | None = None
        from .conversations import Conversations
        from .generation import GenerationService

        self.generation = GenerationService(
            settings.state_dir, config=generation_config, streamer=generation_streamer
        )
        from .retrieval import RetrievalService

        self.retrieval = RetrievalService(
            self, config=retrieval_config, requester=retrieval_requester
        )
        self.conversations = Conversations(self)
        from .federation import Federation

        self.federation = Federation(self)

    async def close(self):
        await self.conversations.close()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        for task in self._search_tasks.values():
            if not task.done():
                task.cancel()
        await asyncio.gather(*self._search_tasks.values(), return_exceptions=True)
        if self._owns_client:
            await self.client.aclose()
        self.store.close()

    async def get(self, run_id: str, *, private=False) -> dict:
        try:
            return await self.store.get(run_id, private=private)
        except KeyError:
            raise ApplicationError("Research run not found.", 404) from None

    async def providers(self) -> dict:
        async def health(key, definition):
            label, role, _, _ = definition
            base = {
                "id": key,
                "label": label,
                "role": role,
                "mode": self.settings.provider_modes[key],
            }
            try:
                response = await self.client.get(
                    f"{self.settings.provider_urls[key]}/health", timeout=1
                )
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict) or data.get("provider") != key:
                    raise ValueError("Provider identity mismatch.")
                status = data.get("status", "ready")
                if status == "ok":
                    status = "ready" if data.get("access_configured", True) else "needs_access"
                return {**base, **data, "id": key, "status": status}
            except (httpx.HTTPError, ValueError):
                return {**base, "status": "unavailable", "capabilities": []}

        return {"providers": await asyncio.gather(*(health(k, v) for k, v in PROVIDERS.items()))}

    async def create(
        self, request: ResearchRequest, *, launch=True, owner_turn=None, search_queries=None
    ) -> dict:
        body = request.model_dump(exclude={"idempotency_key"})
        if search_queries is not None:
            if set(search_queries) != {"lexical", "semantic"} or any(
                not isinstance(value, str)
                or not 3 <= len(value.strip()) <= 1000
                or len(value.encode()) > 2000
                for value in search_queries.values()
            ):
                raise ApplicationError("Invalid bounded retrieval queries.", 422)
            body["search_queries"] = dict(search_queries)
        request_hash, key_hash = fingerprint(body), fingerprint(request.idempotency_key)
        async with self._start_lock:
            for existing in await self.store.list():
                private = await self.get(existing["id"], private=True)
                if private["_idempotency_hash"] == key_hash:
                    if private["_request_hash"] != request_hash:
                        raise ApplicationError("This start key belongs to a different request.")
                    return self.store.public(private)
            if self.active_turn and owner_turn != self.active_turn:
                raise ApplicationError(
                    "An exploration turn is active. Saved work remains available."
                )
            if self.active_run:
                current = await self.get(self.active_run)
                if current["status"] not in TERMINAL:
                    raise ApplicationError(
                        "One discovery run is already active. Saved work remains available."
                    )
            doc = new_document(
                body, self.settings.provider_modes[body["provider"]], key_hash, request_hash
            )
            doc["provider_modes"] = dict(self.settings.provider_modes)
            doc["runtime"]["model_mode"] = self.settings.model_mode
            doc["runtime"]["generation"] = "disabled"
            if owner_turn:
                doc["conversation_turn"] = owner_turn
            doc["plan"]["actual_queries"] = search_queries or {
                "lexical": body["question"],
                "semantic": body["question"],
            }
            if search_queries:
                doc["plan"]["source_review_scope"] = "raw_candidates_conversation_review_separate"
            doc["plan"]["hard_constraints"] = (
                "Only the explicit structured year/type filters are enforced; question wording is retrieval intent."
            )
            if body["provider"] in LOCAL_POOL_PROVIDERS:
                doc["plan"].update(
                    raw_per_branch=20,
                    semantic_scope="same-provider lexical candidate pool; no independent semantic recall",
                )
            result = await self.store.add(doc)
            self.active_run = doc["id"]
            if launch:
                self.launch_admitted(doc["id"])
            return result

    def launch_admitted(self, run_id: str):
        """Schedule only after callers have persisted the run's owning linkage."""
        task = asyncio.create_task(self._execute_agent(run_id))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _trace(self, run_id: str, event: dict):
        def edit(doc):
            doc["trace"].append(event)
            doc["trace"] = doc["trace"][-64:]

        await self.store.mutate(run_id, edit, "agent.trace")

    async def _execute_agent(self, run_id: str):
        try:
            admitted = False

            def begin(doc):
                nonlocal admitted
                if doc["status"] in {"CREATED", "QUEUED"}:
                    admitted = True
                    doc["status"] = "RUNNING"

            await self.store.mutate(run_id, begin, "run.started")
            if not admitted:
                return
            run = await self.get(run_id)
            if run["status"] != "RUNNING":
                return
            if self.agent_runner is None:
                from .agents import run_discovery

                runner = run_discovery
            else:
                runner = self.agent_runner
            arguments = dict(
                run_id=run_id,
                question=run["question"],
                provider=run["provider"],
                filters=run["filters"],
                mcp_url=self.settings.core_url.rstrip("/") + "/mcp/",
                on_trace=lambda event: self._trace(run_id, event),
            )
            if self.agent_runner is None:
                arguments["mode"] = self.settings.model_mode
            result = await asyncio.wait_for(
                runner(**arguments),
                timeout=self.settings.agent_deadline,
            )
            current = await self.get(run_id)
            admitted = {e["source_ref"] for e in current["entities"] if e.get("eligible")}
            if not set(result.get("candidate_refs", [])) <= admitted:
                raise ApplicationError(
                    "Agent returned references outside saved eligible observations."
                )

            def finish(doc):
                if doc["status"] in {"CANCELLED", "INTERRUPTED"}:
                    return
                doc["summary"] = str(result.get("summary", ""))[:4000]
                doc["runtime"]["agent"] = result.get("mode", "scripted")
                doc["runtime"]["agent_usage"] = result.get("usage", {})
                statuses = [
                    doc["operations"].get(b, {}).get("status") for b in ("lexical", "semantic")
                ]
                eligible = any(e.get("eligible") for e in doc["entities"])
                complete = all(s == "succeeded" for s in statuses)
                doc["status"] = (
                    ("SUCCEEDED" if eligible else "EMPTY")
                    if complete
                    else ("PARTIAL" if eligible else "FAILED")
                )

            await self.store.mutate(run_id, finish, "run.completed")
        except asyncio.CancelledError:
            current = await self.get(run_id)
            if current["status"] != "CANCELLED":
                await self.store.mutate(
                    run_id, lambda d: d.update(status="INTERRUPTED"), "run.interrupted"
                )
            raise
        except Exception as exc:
            error_name = type(exc).__name__

            def fail(doc):
                if doc["status"] in {"CANCELLED", "INTERRUPTED"}:
                    return
                doc["status"] = (
                    "PARTIAL" if any(e.get("eligible") for e in doc["entities"]) else "FAILED"
                )
                # Provider response bodies and authentication errors are not copied into public state.
                doc["warnings"].append(
                    f"Agent execution stopped ({error_name}); saved observations were retained."
                )
                doc["_discovery_closed"] = True

            await self.store.mutate(run_id, fail, "run.failed")
            task = self._search_tasks.get(run_id)
            if task and not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        finally:
            if self.active_run == run_id:
                self.active_run = None

    async def _reserve(self, run_id: str, provider: str, allowance: int, operation_id: str):
        def edit(doc):
            if type(allowance) is not int or allowance < 1 or provider not in PROVIDERS:
                raise ApplicationError("Invalid provider request grant.")
            if provider not in {doc["provider"], "crossref", "datacite"}:
                raise ApplicationError("A grant cannot broaden the selected discovery provider.")
            prior = doc["_grants"].get(operation_id)
            if prior:
                if prior["provider"] != provider or prior["allowance"] != allowance:
                    raise ApplicationError(
                        "Operation identity is already bound to a different grant."
                    )
                return
            usage = doc["usage"]
            used = usage["by_provider"].get(provider, 0)
            reserved = usage["reserved_by_provider"].get(provider, 0)
            if used + reserved + allowance > PROVIDERS[provider][3]:
                raise ApplicationError(
                    f"{PROVIDERS[provider][0]} request allowance is exhausted or held by active work."
                )
            if (
                usage["research_attempts"] + sum(usage["reserved_by_provider"].values()) + allowance
                > 16
            ):
                raise ApplicationError("Overall research request allowance is exhausted or held.")
            usage["reserved_by_provider"][provider] = reserved + allowance
            doc["_grants"][operation_id] = {
                "provider": provider,
                "allowance": allowance,
                "used": 0,
                "status": "admitted",
            }

        await self.store.mutate(run_id, edit, "attempt.admitted")

    async def _settle(self, run_id: str, operation_id: str, attempts: int, *, complete: bool):
        def edit(doc):
            grant = doc["_grants"][operation_id]
            if (
                type(attempts) is not int
                or attempts < grant["used"]
                or attempts > grant["allowance"]
            ):
                raise ApplicationError(
                    "Provider usage exceeded or contradicted its operation grant."
                )
            if grant["status"] == "completed":
                if attempts != grant["used"]:
                    raise ApplicationError("A completed operation's usage cannot be changed.")
                return
            delta = attempts - grant["used"]
            provider, usage = grant["provider"], doc["usage"]
            usage["research_attempts"] += delta
            usage["by_provider"][provider] = usage["by_provider"].get(provider, 0) + delta
            usage["reserved_by_provider"][provider] -= delta
            grant["used"] = attempts
            if complete:
                usage["reserved_by_provider"][provider] -= grant["allowance"] - grant["used"]
                grant["status"] = "completed"
            else:
                grant["status"] = "active_or_uncertain"

        await self.store.mutate(run_id, edit, "attempt.updated")

    async def search_papers(self, run_id: str) -> dict:
        async with self._search_lock:
            run = await self.get(run_id, private=True)
            if run_id not in self._search_tasks:
                if (
                    self.active_run != run_id
                    or run["status"] != "RUNNING"
                    or run["_search_started"]
                ):
                    raise ApplicationError("Search capability is not active for this run.")
                await self.store.mutate(
                    run_id, lambda d: d.update(_search_started=True), "search.admitted"
                )
                self._search_tasks[run_id] = asyncio.create_task(self._search(run_id))
            task = self._search_tasks[run_id]
        await asyncio.shield(task)
        run = await self.get(run_id)
        items = [x for x in run["entities"] if x.get("eligible")]
        return {
            "run_id": run_id,
            "provider": run["provider"],
            "candidate_refs": [x["source_ref"] for x in items],
            "items": items,
            "status": run["status"],
            "warnings": run["warnings"],
        }

    async def _search(self, run_id: str):
        run = await self.get(run_id)
        provider, operation_id = run["provider"], uuid.uuid4().hex
        # Reserve four attempts for the two branches, leaving detail allowance available.
        await self._reserve(run_id, provider, 4, operation_id)
        body = {
            "operation_id": operation_id,
            "run_id": run_id,
            "provider": provider,
            "query": run["question"],
            "lexical_query": run["plan"]["actual_queries"]["lexical"],
            "semantic_query": run["plan"]["actual_queries"]["semantic"],
            "filters": run["filters"],
            "limits": {"per_branch": 10, "total": 20, "remaining_attempts": 4},
        }
        counts = {"lexical": 0, "semantic": 0}
        rejected = {"lexical": 0, "semantic": 0}
        attempts = 0
        completed = False
        try:
            async with self.client.stream(
                "POST", f"{self.settings.provider_urls[provider]}/operations/search", json=body
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    current = await self.get(run_id)
                    if current["status"] in {"CANCELLED", "INTERRUPTED", "FAILED", "PARTIAL"}:
                        break
                    if not line:
                        continue
                    if len(line.encode()) > 1024 * 1024:
                        raise ApplicationError("Provider event exceeded the response-size limit.")
                    event = json.loads(line)
                    kind, branch = event.get("kind"), event.get("branch")
                    if kind == "usage":
                        attempts = event.get("attempts", attempts)
                        await self._settle(run_id, operation_id, attempts, complete=False)
                    elif kind in {"branch.started", "branch.completed", "branch.failed"}:
                        if branch not in counts:
                            raise ApplicationError("Unexpected provider branch.")
                        status = {
                            "branch.started": "running",
                            "branch.completed": "succeeded",
                            "branch.failed": "failed",
                        }[kind]
                        if kind == "branch.completed" and (
                            event.get("invalid_count", 0) or rejected[branch]
                        ):
                            status = "partial"

                        def update(doc, branch=branch, status=status, event=event):
                            if doc["status"] in {"CANCELLED", "INTERRUPTED"}:
                                return
                            doc["operations"][branch] = {
                                "status": status,
                                **{
                                    k: event[k]
                                    for k in (
                                        "raw_count",
                                        "count",
                                        "filtered_count",
                                        "invalid_count",
                                        "provenance",
                                    )
                                    if k in event
                                },
                            }
                            if status == "failed":
                                error = event.get("error")
                                code = (
                                    event.get("code")
                                    or (error.get("code") if isinstance(error, dict) else error)
                                    or "provider_error"
                                )
                                doc["operations"][branch]["code"] = code
                                doc["warnings"].append(
                                    f"{branch.title()} branch unavailable ({code})."
                                )

                        await self.store.mutate(run_id, update, "operation.updated")
                    elif kind == "source":
                        if branch not in counts:
                            raise ApplicationError("Unexpected source branch.")
                        counts[branch] += 1
                        if counts[branch] > (20 if provider in LOCAL_POOL_PROVIDERS else 10):
                            raise ApplicationError(
                                "Provider exceeded the raw per-branch result ceiling."
                            )
                        try:
                            record = SourceRecord.model_validate(event["record"]).model_dump()
                        except (ValueError, KeyError):
                            rejected[branch] += 1
                            await self.store.mutate(
                                run_id,
                                lambda d: d["warnings"].append(
                                    "An invalid provider record was rejected."
                                ),
                                "source.rejected",
                            )
                            continue
                        if record["provider"] != provider or record["mode"] != run["mode"]:
                            raise ApplicationError(
                                "Provider origin/mode did not match the admitted run."
                            )
                        rank = event.get("rank", record["branch_ranks"].get(branch, counts[branch]))
                        if type(rank) is not int or rank < 1:
                            rejected[branch] += 1
                            await self.store.mutate(
                                run_id,
                                lambda d: d["warnings"].append(
                                    "An invalid source rank was rejected."
                                ),
                                "source.rejected",
                            )
                            continue
                        record["branch_ranks"][branch] = rank
                        await self._observe(run_id, record)
                    elif kind == "complete":
                        attempts = event.get("attempts", attempts)
                        completed = True
                    else:
                        raise ApplicationError("Unsupported provider event contract.")
            await self._settle(run_id, operation_id, attempts, complete=completed)
            if not completed:
                raise ApplicationError(
                    "Provider stream ended without a confirmed operation outcome."
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            error_name = type(exc).__name__

            def stopped(doc):
                for branch in counts:
                    if doc["operations"][branch].get("status") in {"queued", "running"}:
                        doc["operations"][branch] = {
                            "status": "failed",
                            "code": "provider_unavailable",
                        }
                doc["warnings"].append(
                    f"Discovery transport stopped ({error_name}); uncertain allowance remains held."
                )

            await self.store.mutate(run_id, stopped, "search.failed")

    async def _observe(self, run_id: str, record: dict):
        def edit(doc):
            if doc["status"] in {"CANCELLED", "INTERRUPTED", "FAILED", "PARTIAL"} or doc.get(
                "_discovery_closed"
            ):
                return
            ref = record["source_ref"]
            doc["_observations"][f"{ref}@{record['version']}"] = copy.deepcopy(record)
            existing = next((x for x in doc["entities"] if x["source_ref"] == ref), None)
            previous_version = existing["version"] if existing else None
            ranks = {**(existing or {}).get("branch_ranks", {}), **record.get("branch_ranks", {})}
            # An already inspected detail snapshot stays the display source when a delayed
            # search occurrence arrives. Its raw observation still remains separately saved.
            basis = existing if existing and existing.get("details_loaded") else record
            value = {**basis, "branch_ranks": ranks, "rank_score": rank_score(ranks)}
            value["eligible"], value["filter_warnings"] = filter_record(value, doc["filters"])
            if existing is None:
                if len(doc["entities"]) >= 20:
                    raise ApplicationError("Retained union limit exceeded.")
                doc["entities"].append(value)
            else:
                existing.clear()
                existing.update(value)
            selection = doc["selections"].get(ref)
            if (
                selection
                and selection.get("citation_source", "discovery") == "discovery"
                and previous_version != value["version"]
            ):
                doc["revision"] += 1
                selection["latest_version"] = value["version"]
                selection["metadata_update_available"] = True
            if selection and not value["eligible"]:
                selection["warning"] = (
                    "Updated metadata does not satisfy the requested filters; saved history is retained."
                )
            self._rerank(doc)

        await self.store.mutate(run_id, edit, "entity.upserted")

    @staticmethod
    def _rerank(doc):
        for record in doc["entities"]:
            record["eligible_branch_ranks"] = {}
        for branch in ("lexical", "semantic"):
            records = sorted(
                (r for r in doc["entities"] if r.get("eligible") and branch in r["branch_ranks"]),
                key=lambda r: (r["branch_ranks"][branch], r["source_ref"]),
            )
            for rank, record in enumerate(records, 1):
                record["eligible_branch_ranks"][branch] = rank
        for record in doc["entities"]:
            record["rank_score"] = rank_score(record["eligible_branch_ranks"])

    async def select(self, run_id: str, source_ref: str, request: SelectionRequest):
        def edit(doc):
            if request.expected_revision != doc["revision"]:
                raise ApplicationError("Saved revision changed. Reload and review your decision.")
            record = next((r for r in doc["entities"] if r["source_ref"] == source_ref), None)
            if record is None:
                raise ApplicationError("Source does not belong to this run.", 404)
            if not record.get("eligible") and source_ref not in doc["selections"]:
                raise ApplicationError("This source has not passed the required filters.")
            included = [
                key
                for key, value in doc["selections"].items()
                if value["state"] == "included" and key != source_ref
            ]
            if request.state == "included" and len(included) >= 3:
                raise ApplicationError("This increment supports up to three included sources.")
            previous = doc["selections"].get(source_ref, {})
            citation_source = request.citation_source or previous.get(
                "citation_source", "discovery"
            )
            citation_record = record
            if citation_source == "registry":
                citation_record = doc["checks"].get(source_ref, {}).get("record")
                if citation_record is None:
                    raise ApplicationError(
                        "No recorded registry observation is available for this citation."
                    )
            doc["revision"] += 1
            doc["selections"][source_ref] = {
                "state": request.state,
                "reason": request.reason,
                "source_version": citation_record["version"],
                "citation_source": citation_source,
                "citation_source_ref": citation_record["source_ref"],
                "source_snapshot": copy.deepcopy(citation_record),
                "saved_at": now(),
            }

        return await self.store.mutate(run_id, edit, "selection.updated")

    async def cancel(self, run_id: str):
        def edit(doc):
            if doc["status"] not in TERMINAL:
                doc["status"] = "CANCELLED"
                doc["_discovery_closed"] = True
                for op in doc["operations"].values():
                    if op.get("status") in {"queued", "running"}:
                        op["status"] = "cancelled"

        result = await self.store.mutate(run_id, edit, "run.cancelled")
        if self.active_run == run_id:
            self.active_run = None
        return result

    async def _provider_call(
        self, run_id: str, provider: str, operation: str, fields: dict
    ) -> dict:
        operation_id = uuid.uuid4().hex
        await self._reserve(run_id, provider, 1, operation_id)
        try:
            response = await self.client.post(
                f"{self.settings.provider_urls[provider]}/operations/{operation}",
                json={
                    "operation_id": operation_id,
                    "run_id": run_id,
                    "remaining_attempts": 1,
                    **fields,
                },
            )
            result = response.json()
            if not isinstance(result, dict) or type(result.get("attempts")) is not int:
                raise ApplicationError("Provider returned no attributable attempt receipt.", 502)
            await self._settle(run_id, operation_id, result["attempts"], complete=True)
            run = await self.get(run_id)
            expected_mode = run.get("provider_modes", {}).get(provider, run["mode"])
            if result.get("mode") != expected_mode or result.get("provider") != provider:
                raise ApplicationError(
                    "Provider response origin/mode did not match its operation.", 502
                )
            if (
                response.status_code == 404
                and operation == "metadata"
                and result.get("code") == "NOT_FOUND"
            ):
                return {**result, "record": None}
            response.raise_for_status()
            return result
        except (httpx.HTTPError, ValueError):
            raise ApplicationError(
                f"{PROVIDERS[provider][0]} is unavailable; saved work remains usable.", 503
            ) from None

    async def details(self, run_id: str, source_ref: str):
        lock = self._review_locks.setdefault((run_id, source_ref, "details"), asyncio.Lock())
        async with lock:
            return await self._details(run_id, source_ref)

    async def _details(self, run_id: str, source_ref: str):
        run = await self.get(run_id)
        record = next((r for r in run["entities"] if r["source_ref"] == source_ref), None)
        if record is None:
            raise ApplicationError("Source does not belong to this run.", 404)
        if record.get("details_loaded"):
            return run
        data = await self._provider_call(
            run_id, run["provider"], "details", {"record_id": record["record_id"]}
        )
        try:
            updated = SourceRecord.model_validate(data["record"]).model_dump()
        except (ValueError, KeyError):
            raise ApplicationError(
                "Provider details were malformed; saved metadata was retained.", 502
            ) from None
        if updated["source_ref"] != source_ref or updated["mode"] != run["mode"]:
            raise ApplicationError("Detail response did not match the selected source.")
        updated["branch_ranks"] = record["branch_ranks"]
        # Detail actions have their own scope after discovery/cancellation.
        await self._observe_review(run_id, updated)
        return await self.get(run_id)

    async def _observe_review(self, run_id: str, record: dict):
        # Review is explicit and remains available after a terminal agent deadline.
        def edit(doc):
            ref = record["source_ref"]
            previous = next(r for r in doc["entities"] if r["source_ref"] == ref)
            version_changed = previous["version"] != record["version"]
            eligible, warnings = filter_record(record, doc["filters"])
            value = {
                **record,
                "eligible": eligible,
                "filter_warnings": warnings,
                "rank_score": rank_score(record["branch_ranks"]),
                "details_loaded": True,
            }
            previous.clear()
            previous.update(value)
            doc["_observations"][f"{ref}@{record['version']}"] = copy.deepcopy(record)
            if (
                ref in doc["selections"]
                and doc["selections"][ref].get("citation_source", "discovery") == "discovery"
                and version_changed
            ):
                doc["revision"] += 1
                doc["selections"][ref]["metadata_update_available"] = True
                doc["selections"][ref]["latest_version"] = record["version"]
            if ref in doc["selections"] and not eligible:
                doc["selections"][ref]["warning"] = (
                    "Updated metadata no longer matches the required filters."
                )
            self._rerank(doc)

        await self.store.mutate(run_id, edit, "entity.updated")

    @staticmethod
    def doi(value: str) -> str:
        value = (
            unquote(value.strip())
            .removeprefix("https://doi.org/")
            .removeprefix("http://doi.org/")
            .removeprefix("doi:")
            .strip()
            .lower()
        )
        if not re.fullmatch(r"10\.\d{4,9}/\S+", value) or len(value) > 500:
            raise ApplicationError("This record does not contain a supported DOI.", 422)
        return value

    async def metadata_check(self, run_id: str, source_ref: str):
        lock = self._review_locks.setdefault((run_id, source_ref, "metadata"), asyncio.Lock())
        async with lock:
            return await self._metadata_check(run_id, source_ref)

    async def _metadata_check(self, run_id: str, source_ref: str):
        run = await self.get(run_id)
        if run["selections"].get(source_ref, {}).get("state") != "included":
            raise ApplicationError("Include this source before requesting its DOI check.")
        source = next(r for r in run["entities"] if r["source_ref"] == source_ref)
        doi = self.doi(source.get("doi") or "")
        previous = run["checks"].get(source_ref)
        if previous and previous.get("doi") != doi:
            previous = None
        if (
            previous
            and previous.get("doi") == doi
            and previous.get("status")
            in {"registry_match", "registry_conflict", "unsupported_agency", "registry_not_found"}
        ):
            return run
        check = {
            "status": "running",
            "doi": doi,
            "agency": previous.get("agency") if previous else None,
            "observations": [],
            "conflicts": [],
            "started_at": now(),
        }
        if previous and previous.get("agency_evidence"):
            check["agency_evidence"] = copy.deepcopy(previous["agency_evidence"])
        await self._save_check(run_id, source_ref, check)
        try:
            if not check["agency"]:
                agency = await self._provider_call(run_id, "crossref", "agency", {"doi": doi})
                check["agency"] = str(agency.get("agency", "")).lower()
                check["agency_evidence"] = {
                    "provider": "crossref",
                    "operation": "agency",
                    "retrieved_at": now(),
                    "doi": doi,
                }
                await self._save_check(run_id, source_ref, check)
            if check["agency"] not in {"crossref", "datacite"}:
                check["status"] = "unsupported_agency" if check["agency"] else "agency_unresolved"
            else:
                result = await self._provider_call(
                    run_id, check["agency"], "metadata", {"doi": doi}
                )
                if not result.get("record"):
                    check["status"] = "registry_not_found"
                else:
                    registry = SourceRecord.model_validate(result["record"]).model_dump()
                    if (
                        registry["provider"] != check["agency"]
                        or self.doi(registry.get("doi") or "") != doi
                        or registry["mode"]
                        != run.get("provider_modes", {}).get(check["agency"], run["mode"])
                    ):
                        raise ApplicationError("Registry observation did not match the routed DOI.")
                    check["record"] = registry
                    check["observations"] = [registry]
                    check["unchecked_fields"] = []
                    for name in ("title", "authors", "year", "venue", "resource_type"):
                        left, right = source.get(name), registry.get(name)
                        if left in (None, "", []) or right in (None, "", []):
                            check["unchecked_fields"].append(name)
                        if (
                            left not in (None, "", [])
                            and right not in (None, "", [])
                            and str(left).casefold().strip() != str(right).casefold().strip()
                        ):
                            check["conflicts"].append(
                                {"field": name, "discovery": left, "registry": right}
                            )
                    check["status"] = (
                        "registry_conflict" if check["conflicts"] else "registry_match"
                    )
        except (ApplicationError, ValueError, KeyError, TypeError):
            check["status"] = "unavailable" if check["agency"] else "agency_unresolved"
        check["completed_at"] = now()
        await self._save_check(run_id, source_ref, check)
        return await self.get(run_id)

    async def _save_check(self, run_id: str, ref: str, check: dict):
        def edit(doc):
            doc["checks"][ref] = copy.deepcopy(check)
            if ref in doc["selections"]:
                doc["revision"] += 1

        await self.store.mutate(run_id, edit, "verification.updated")

    async def export(self, run_id: str):
        run = await self.get(run_id)
        selected = [
            (ref, value) for ref, value in run["selections"].items() if value["state"] == "included"
        ]
        if not selected:
            raise ApplicationError("Include at least one source before exporting.")
        manifest = {
            "schema_version": 1,
            "run_id": run_id,
            "revision": run["revision"],
            "mode": run["mode"],
            "question": run["question"],
            "provider": run["provider"],
            "filters": run["filters"],
            "plan": run["plan"],
            "run_status": run["status"],
            "created_at": run["created_at"],
            "exported_at": now(),
            "usage": run["usage"],
            "operations": run["operations"],
            "runtime": run["runtime"],
            "snapshot_cursor": run["cursor"],
            "warnings": run["warnings"],
            "sources": [
                {"source_ref": ref, "selection": item, "registry_check": run["checks"].get(ref)}
                for ref, item in selected
            ],
        }
        lines = [
            "# Research Scout bibliography",
            "",
            f"Mode: {run['mode']}. Saved revision: {run['revision']}.",
            "Metadata/abstract discovery; not a full-text review or exhaustive literature search.",
            "",
        ]
        if run["mode"] == "fixture":
            lines += [
                "**Authored fictional fixture records for software validation; do not cite as real publications.**",
                "",
            ]
        for ref, item in selected:
            record = item["source_snapshot"]
            title = record.get("title") or "[title unavailable]"
            authors = "; ".join(record.get("authors", [])) or "[authors unavailable]"
            year = record.get("year") or "date unavailable"
            lines += [
                f"- {authors} ({year}). {title}. {record.get('venue') or '[venue unavailable]'}. "
                f"{record.get('url') or ''}",
                f"  Source: {record['source_ref']}, version {record['version']}; DOI: {record.get('doi') or '[unavailable]'}. ",
            ]
            if item.get("metadata_update_available"):
                lines += [
                    "  Warning: newer metadata is available; this export preserves the explicitly selected snapshot."
                ]
            if record.get("truncated_fields"):
                lines += [
                    "  Warning: provider-truncated fields: "
                    + ", ".join(record["truncated_fields"])
                    + "; no missing values were generated."
                ]
            check = run["checks"].get(ref)
            if check:
                lines += [
                    f"  Registry check: {check['status']}; records remain separately attributed in manifest.json."
                ]
        result = {
            "revision": run["revision"],
            "bibliography": "\n".join(lines).rstrip() + "\n",
            "manifest": manifest,
        }

        def remember(doc):
            doc["_exports"].append(copy.deepcopy(result))
            doc["_exports"] = doc["_exports"][-20:]

        await self.store.mutate(run_id, remember, "export.created")
        return result
