"""Separate dataset discovery lifecycle over verified saved research intent."""

from __future__ import annotations

import asyncio
import copy
import re
import time
import uuid
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from .agents.datasets import run_dataset_specialist
from .contracts import fingerprint, now
from .dataset_contracts import DatasetCatalogRequest, DatasetRecord, DatasetSearchRequest
from .dataset_terms import informative_tokens, tokens
from .store import TERMINAL, Store

DATASET_PROVIDERS = {"hugging_face": "Hugging Face", "datacite": "DataCite"}


class DatasetStore(Store):
    def _commit(self, document, event_kind):
        document["revision"] = document["_sequence"] + 1
        super()._commit(document, event_kind)

    @staticmethod
    def public(document):
        return copy.deepcopy(
            {key: value for key, value in document.items() if not key.startswith("_")}
        )

    def _recover(self, document):
        if document["status"] in TERMINAL:
            return False
        document["status"] = "INTERRUPTED"
        document["completed_at"] = now()
        document["warnings"].append(
            "Dataset discovery was interrupted by restart; no catalog request was replayed."
        )
        for activity in document["provider_activity"]:
            if activity["status"] in {"queued", "running"}:
                activity["status"] = "interrupted"
        for span in document.get("timing_spans", []):
            if not span.get("completed_at"):
                span["status"] = "interrupted"
        return True


class DatasetState(TypedDict):
    search_id: str


def problem_context(conversation, turn, resource_type="datasets"):
    from .planning import validated_shared_plan

    if resource_type not in {"datasets", "repos"}:
        raise ValueError("Unsupported saved research resource type.")
    retrieval = turn.get("retrieval") or {}
    if turn.get("agentic") is False and turn.get("action") == "discover":
        if retrieval:
            raise ValueError(
                "This AI-refined search cannot be treated as a direct query. Start a new direct topic search."
            )
        if turn.get("status") not in {
            "QUEUED",
            "RUNNING",
            "SUCCEEDED",
            "PARTIAL",
            "EMPTY",
            "FAILED",
        }:
            raise ValueError(
                "Start a new direct topic search before finding resources from this stopped query."
            )
        query = turn.get("message")
        if not isinstance(query, str) or len(query.strip()) < 3:
            raise ValueError("The saved direct research query is unavailable.")
        if len(query) > 400:
            raise ValueError(
                "Direct Data and Repos queries support at most 400 characters. Start a shorter direct topic search; the original query will not be truncated."
            )
        informative = informative_tokens(query)
        terms = list(dict.fromkeys(word for word in tokens(query) if word in informative))[:12]
        context = {
            "conversation_id": conversation["id"],
            "turn_id": turn["id"],
            "intent": query,
            "domain": None,
            "keywords": terms,
            "tags": [],
            "query": query,
            "semantic_query": None,
            "retrieval_keywords": [],
            "resource_type": resource_type,
            "query_mode": "direct",
            "query_origin": "user_direct_query",
            "canonical_query": query,
            "canonical_semantic_query": None,
            "resource_query": None,
            "shared_plan": None,
            "context_expansion": None,
            "assumptions": [],
            "original_question": query,
            "intent_frame": None,
            "filters": copy.deepcopy(turn.get("filters") or {}),
            "literature_filters": copy.deepcopy(turn.get("filters") or {}),
            "origin": "saved_direct_query",
        }
        context["fingerprint"] = fingerprint(context)
        return context
    if (
        not turn.get("agentic")
        or turn.get("action") != "discover"
        or retrieval.get("status") not in {"retrieving", "reviewing", "refining", "completed"}
    ):
        raise ValueError(
            "First run an AI-refined topic search; dataset discovery reuses its saved model plan."
        )
    query = retrieval.get("lexical_query")
    if not isinstance(query, str) or len(query.strip()) < 3 or not retrieval.get("intent"):
        raise ValueError("The saved research intent is not yet ready for dataset matching.")
    resources, expansion = validated_shared_plan(retrieval)
    resource = getattr(resources, resource_type)
    context = {
        "conversation_id": conversation["id"],
        "turn_id": turn["id"],
        "intent": retrieval["intent"],
        "domain": retrieval.get("domain"),
        "keywords": retrieval.get("query_terms", [])[:12],
        "tags": retrieval.get("tags", [])[:8],
        "query": resource.lexical_query,
        "semantic_query": resource.semantic_query,
        "retrieval_keywords": list(resource.query_terms),
        "resource_type": resource_type,
        "query_mode": "ai",
        "query_origin": "saved_model_resource_query",
        "canonical_query": query,
        "canonical_semantic_query": retrieval.get("semantic_query"),
        "resource_query": resource.model_dump(),
        "shared_plan": copy.deepcopy(retrieval["shared_plan"]),
        "context_expansion": expansion.model_dump(),
        "assumptions": list(retrieval.get("assumptions") or []),
        "original_question": turn["message"],
        "intent_frame": retrieval.get("intent_frame"),
        "filters": copy.deepcopy(turn.get("filters") or {}),
        "literature_filters": copy.deepcopy(turn.get("filters") or {}),
        "origin": "saved_agentic_retrieval_plan",
    }
    context["fingerprint"] = fingerprint(context)
    return context


def match_dataset(record, context):
    """A transparent lexical applicability hint, not a model/scientific judgment."""
    anchors = list(
        dict.fromkeys(
            str(item).lower()
            for item in [*context["keywords"], *context["tags"]]
            if isinstance(item, str) and len(item.strip()) > 2
        )
    )[:20]
    if not anchors:
        anchors = list(
            dict.fromkeys(
                word.lower() for word in re.findall(r"[^\W_]+", context["query"]) if len(word) > 3
            )
        )[:12]
    body = " ".join(
        str(item or "")
        for item in [
            record.get("title"),
            record.get("description"),
            *record.get("tags", []),
            *record.get("tasks", []),
        ]
    ).lower()
    body_tokens = set(tokens(body))
    matched = [
        anchor
        for anchor in anchors
        if informative_tokens(anchor) and set(tokens(anchor)).issubset(body_tokens)
    ]
    domain = str(context.get("domain") or "").lower()
    ml_domain = any(
        value in domain
        for value in (
            "machine learning",
            "language model",
            "artificial intelligence",
            "natural language",
            "computer science",
        )
    )
    ml_markers = {
        "retrieval",
        "rag",
        "learning",
        "llm",
        "transformer",
        "neural",
        "benchmark",
        "qa",
        "question",
        "classification",
        "regression",
        "translation",
        "speech",
        "audio",
        "vision",
        "image",
        "text",
        "corpus",
        "nlp",
        "code",
    }
    if ml_domain and not (body_tokens & ml_markers or {"language", "model"}.issubset(body_tokens)):
        matched = []
    missing = [
        label
        for field, label in [
            ("license", "Reuse license"),
            ("description", "Dataset description"),
            ("version", "Pinned dataset version"),
        ]
        if not record.get(field)
    ]
    missing.extend(
        [
            "Variables/schema have not been profiled",
            "Population/time/geographic suitability has not been verified",
        ]
    )
    return {
        "status": "candidate" if matched else "unknown",
        "matched_terms": matched,
        "missing_constraints": missing,
        "reason": "Metadata mentions: "
        + ", ".join(matched[:4])
        + ". Verify dataset documentation and task fit."
        if matched
        else "Available metadata does not establish a match to the saved research intent.",
        "method": "saved_intent_lexical_metadata_v1",
        "model_reviewed": False,
    }


class DatasetDiscovery:
    def __init__(self, core, *, specialist_runner=None):
        self.core = core
        self.store = DatasetStore(core.settings.state_dir / "dataset-searches", event_limit=64)
        self.tasks = {}
        self.admission = asyncio.Lock()
        self.dispatch = asyncio.Lock()
        self.specialist_runner = specialist_runner or run_dataset_specialist
        graph = StateGraph(DatasetState)
        graph.add_node("dataset_discovery_specialist", self._collect)
        graph.add_edge(START, "dataset_discovery_specialist")
        graph.add_edge("dataset_discovery_specialist", END)
        self.graph = graph.compile(name="scout_dataset_discovery")

    def provider_url(self, provider):
        return self.core.settings.dataset_provider_urls[provider]

    async def providers(self):
        async def status(provider, label):
            try:
                response = await self.core.client.get(
                    self.provider_url(provider) + "/health", timeout=1
                )
                response.raise_for_status()
                item = response.json()
                if item.get("provider") != provider or not item.get("capabilities", {}).get(
                    "datasets"
                ):
                    raise ValueError("Dataset capability not advertised.")
                return {
                    "id": provider,
                    "label": label,
                    "status": "ready",
                    "mode": item["mode"],
                    "transport": "official_rest",
                    "native_semantic_search": False,
                    "scope": "catalog_metadata_only",
                }
            except Exception:
                return {
                    "id": provider,
                    "label": label,
                    "status": "unavailable",
                    "mode": self.core.settings.dataset_provider_modes[provider],
                    "blocked_reason": "The isolated dataset catalog service is unavailable.",
                }

        return {
            "providers": await asyncio.gather(
                *(status(provider, label) for provider, label in DATASET_PROVIDERS.items())
            )
        }

    async def list(self, conversation_id=None, turn_id=None):
        # Read bounded headers without copying every retained metadata payload.
        async with self.store.lock:
            rows = sorted(
                self.store.runs.values(), key=lambda item: item["created_at"], reverse=True
            )
            matching = [
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
                        )
                    }
                )
                for row in matching
            ]

    async def get(self, search_id, *, private=False):
        from .core import ApplicationError

        try:
            return await self.store.get(search_id, private=private)
        except KeyError:
            raise ApplicationError("Dataset search not found.", 404) from None

    async def create(self, request: DatasetSearchRequest, *, launch=True):
        from .core import ApplicationError

        providers = list(dict.fromkeys(request.providers))
        signature = fingerprint(
            {
                "conversation_id": request.conversation_id,
                "turn_id": request.turn_id,
                "providers": sorted(providers),
                "limit": request.limit,
            }
        )
        async with self.admission:
            for saved in self.store.runs.values():
                if saved.get("_idempotency_key") == request.idempotency_key:
                    if saved["_request_fingerprint"] != signature:
                        raise ApplicationError(
                            "Dataset request key belongs to a different saved intent or scope."
                        )
                    return self.store.public(saved)
            # A retry identifies the accepted client scope before consulting a
            # parent plan that may have refined or stopped since admission.
            conversation = await self.core.conversations.get(request.conversation_id, private=True)
            turn = next(
                (item for item in conversation["turns"] if item["id"] == request.turn_id), None
            )
            if turn is None:
                raise ApplicationError("Saved research query not found.", 404)
            try:
                context = problem_context(conversation, turn)
            except ValueError as exc:
                raise ApplicationError(str(exc)) from None
            if sum(item["status"] not in TERMINAL for item in self.store.runs.values()) >= 2:
                raise ApplicationError(
                    "Two dataset searches are already active. Stop or finish one before starting another."
                )
            search_id = uuid.uuid4().hex
            document = {
                "id": search_id,
                "question": turn["message"],
                "context": context,
                "providers": providers,
                "limit": request.limit,
                "status": "RUNNING",
                "created_at": now(),
                "records": [],
                "provider_activity": [
                    {"provider": provider, "status": "queued", "attempts": 0, "record_count": 0}
                    for provider in providers
                ],
                "timing_spans": [],
                "warnings": [],
                "usage": {"catalog_attempts": 0, "model_http_attempts": 0},
                "revision": 0,
                "cursor": "",
                "_idempotency_key": request.idempotency_key,
                "_request_fingerprint": signature,
                "_sequence": 0,
                "_stream_id": uuid.uuid4().hex,
                "_events": [],
                "_claimed_providers": [],
                "_provider_receipts": {},
                "operations": {},
            }
            result = await self.store.add(document)
            if launch:
                self.launch(search_id)
            return result

    def launch(self, search_id):
        if search_id not in self.tasks:
            self.tasks[search_id] = asyncio.create_task(self._run(search_id))

    async def _run(self, search_id):
        try:
            await self.graph.ainvoke({"search_id": search_id})
            saved = await self.get(search_id)
            if saved["status"] in TERMINAL:
                return
            failed = [item for item in saved["provider_activity"] if item["status"] == "failed"]
            status = (
                "PARTIAL"
                if failed and saved["records"]
                else "FAILED"
                if failed
                else "SUCCEEDED"
                if saved["records"]
                else "EMPTY"
            )
            await self.store.mutate(
                search_id,
                lambda item: item.update(status=status, completed_at=now()),
                "datasets.completed",
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            saved = await self.get(search_id)
            if saved["status"] not in TERMINAL:
                await self.store.mutate(
                    search_id,
                    lambda item: item.update(
                        status="PARTIAL" if item["records"] else "FAILED",
                        completed_at=now(),
                        warnings=[
                            *item["warnings"],
                            "Dataset discovery could not finish. Saved metadata remains available; no automatic retry was made.",
                        ],
                    ),
                    "datasets.failed",
                )

    async def _collect(self, state):
        saved = await self.get(state["search_id"])

        async def run(provider):
            try:
                await self.specialist_runner(
                    saved["context"],
                    provider,
                    mcp_url=self.core.settings.core_url.rstrip("/") + "/mcp/",
                    search_id=saved["id"],
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                current = await self.get(saved["id"])
                if current["status"] in TERMINAL:
                    return

                def failed(item):
                    activity = next(
                        row for row in item["provider_activity"] if row["provider"] == provider
                    )
                    if activity["status"] not in {"succeeded", "failed"}:
                        activity.update(
                            status="failed",
                            error_code="SPECIALIST_UNAVAILABLE",
                            message="Dataset specialist failed before a complete catalog receipt; no retry was made.",
                        )

                await self.store.mutate(saved["id"], failed, "datasets.provider_failed")

        await asyncio.gather(*(run(provider) for provider in saved["providers"]))
        return {}

    async def search_provider(self, search_id, provider):
        from .core import ApplicationError

        async with self.dispatch:
            saved = await self.get(search_id, private=True)
            if provider not in saved["providers"]:
                raise ApplicationError(
                    "Dataset provider is outside this search's fixed scope.", 403
                )
            if provider in saved["_provider_receipts"]:
                return saved["_provider_receipts"][provider]
            if saved["status"] in TERMINAL or provider in saved["_claimed_providers"]:
                raise ApplicationError(
                    "Dataset operation is stopped or already admitted; no redispatch is allowed."
                )
            clock, started_at = time.perf_counter(), now()

            def started(item):
                item["_claimed_providers"].append(provider)
                next(
                    row for row in item["provider_activity"] if row["provider"] == provider
                ).update(status="running")
                item["timing_spans"].append(
                    {
                        "id": provider,
                        "phase": "dataset_catalog",
                        "label": f"{DATASET_PROVIDERS[provider]} catalog metadata",
                        "provider": provider,
                        "started_at": started_at,
                        "status": "running",
                    }
                )

            await self.store.mutate(search_id, started, "datasets.provider_started")
        context = saved["context"]
        request = DatasetCatalogRequest(
            run_id=search_id,
            operation_id=f"datasets:{search_id}:{provider}",
            query=context["query"],
            keywords=context["retrieval_keywords"],
            limit=saved["limit"],
        )
        try:
            response = await self.core.client.post(
                self.provider_url(provider) + "/operations/datasets",
                json=request.model_dump(),
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            if (
                payload.get("provider") != provider
                or payload.get("mode") != self.core.settings.dataset_provider_modes[provider]
                or not isinstance(payload.get("records"), list)
            ):
                raise ValueError("Dataset catalog identity/schema mismatch.")
            records = []
            for record in payload["records"][: saved["limit"]]:
                if (
                    not isinstance(record, dict)
                    or record.get("provider") != provider
                    or record.get("resource_type") != "dataset"
                    or record.get("mode") != payload["mode"]
                ):
                    raise ValueError("Dataset record identity mismatch.")
                record = DatasetRecord.model_validate(record).model_dump()
                record["match"] = match_dataset(record, context)
                records.append(record)
            result = {
                "provider": provider,
                "status": payload.get("status", "failed"),
                "record_count": len(records),
                "attempts": payload.get("attempts", 1),
            }

            def received(item):
                if item["status"] in TERMINAL:
                    return
                seen = {row["dataset_id"] for row in item["records"]}
                item["records"].extend(
                    record for record in records if record["dataset_id"] not in seen
                )
                item["records"].sort(
                    key=lambda row: (
                        row["match"]["status"] != "candidate",
                        -len(row["match"]["matched_terms"]),
                        row["provider"],
                        row["record_id"],
                    )
                )
                next(
                    row for row in item["provider_activity"] if row["provider"] == provider
                ).update(
                    **result,
                    query=payload.get("query"),
                    executed_arguments=payload.get("executed_arguments"),
                    error=payload.get("error"),
                )
                item["_provider_receipts"][provider] = result
                item["usage"]["catalog_attempts"] += result["attempts"]
                next(span for span in item["timing_spans"] if span["provider"] == provider).update(
                    status=result["status"],
                    completed_at=now(),
                    duration_ms=(time.perf_counter() - clock) * 1000,
                )

            await self.store.mutate(search_id, received, "datasets.provider_completed")
            return result
        except asyncio.CancelledError:
            raise
        except Exception:

            def failed(item):
                if item["status"] in TERMINAL:
                    return
                next(
                    row for row in item["provider_activity"] if row["provider"] == provider
                ).update(
                    status="failed",
                    error_code="CATALOG_UNAVAILABLE",
                    message="Catalog request failed; no fallback or automatic retry was made.",
                )
                next(span for span in item["timing_spans"] if span["provider"] == provider).update(
                    status="failed",
                    completed_at=now(),
                    duration_ms=(time.perf_counter() - clock) * 1000,
                )

            await self.store.mutate(search_id, failed, "datasets.provider_failed")
            return {"provider": provider, "status": "failed", "record_count": 0}

    async def cancel(self, search_id):
        saved = await self.get(search_id)
        if saved["status"] in TERMINAL:
            return saved

        def stopped(item):
            item.update(status="CANCELLED", completed_at=now())
            for activity in item["provider_activity"]:
                if activity["status"] in {"running", "queued"}:
                    activity["status"] = "cancelled"
            for span in item["timing_spans"]:
                if not span.get("completed_at"):
                    span.update(status="cancelled", completed_at=now())

        result = await self.store.mutate(search_id, stopped, "datasets.cancelled")
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
