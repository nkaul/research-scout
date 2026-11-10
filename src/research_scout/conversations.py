"""Durable exploration turns, deterministic routing and optional saved-evidence generation.

Discovery children use the existing real Deep Agents/application MCP path. Exact
DOI inputs use public registry services, while saved-source inspection does no
external work. The explicit generate branch streams a bounded OpenAI answer over
saved records. Each observation retains its provider and version.
"""

from __future__ import annotations

import asyncio
import copy
import json
import re
import time
import uuid
from contextlib import aclosing
from typing import TYPE_CHECKING, TypedDict

from langgraph.errors import NodeCancelledError
from langgraph.graph import END, START, StateGraph

from .contracts import (
    AccessObservation,
    ConversationRequest,
    ResearchRequest,
    SourceRecord,
    TurnRequest,
    filter_record,
    fingerprint,
    now,
)
from .generation import MODEL, GenerationError, GenerationHTTPError
from .settings import DISCOVERY_PROVIDER_IDS
from .store import TERMINAL, Store

if TYPE_CHECKING:
    from .core import Core

LABELS = {
    "openalex": "OpenAlex",
    "semantic_scholar": "Semantic Scholar",
    "crossref": "Crossref",
    "datacite": "DataCite",
    "arxiv": "arXiv",
    "openaire": "OpenAIRE",
    "europe_pmc": "Europe PMC",
    "unpaywall": "Unpaywall",
}
PUBLIC_HISTORY_BYTES = 3 * 1024 * 1024
PUBLIC_EXCERPT_BYTES = 1024 * 1024
PUBLIC_AUDIT_BYTES = 1024 * 1024


def error(message: str, status: int = 409):
    from .core import ApplicationError

    return ApplicationError(message, status)


def exact_doi(text: str) -> str | None:
    """Only unambiguous whole-input identifiers are routed as DOI lookups."""
    from .core import Core

    try:
        return Core.doi(text)
    except Exception:
        return None


def preview(record: dict, run_id: str, *, registry_only=False) -> dict:
    """Small display copy; immutable source identity/version always remain exact."""
    result = {
        key: copy.deepcopy(record[key])
        for key in (
            "source_ref",
            "provider",
            "record_id",
            "version",
            "year",
            "mode",
            "content_state",
            "content_origin",
            "published_at",
            "updated_at",
            "version_relationships",
            "provider_identifiers",
            "missing_fields",
            "fictional",
            "branch_ranks",
            "rank_score",
        )
        if key in record
    }
    result.update(run_id=run_id, registry_only=registry_only)
    result["title"] = (record.get("title") or "Untitled provider record")[:320]
    result["authors"] = [author[:100] for author in record.get("authors", [])[:4]]
    for key, cap in (
        ("abstract", 1200),
        ("description", 1200),
        ("venue", 160),
        ("doi", 500),
        ("url", 1000),
    ):
        value = record.get(key)
        result[key] = value[:cap] if isinstance(value, str) else value
    result["preview_truncated"] = (
        any(
            isinstance(record.get(key), str) and len(record[key]) > cap
            for key, cap in (("title", 320), ("abstract", 1200), ("venue", 160), ("url", 1000))
        )
        or len(record.get("authors", [])) > 4
    )
    if isinstance(result.get("abstract"), str):
        result["abstract"] = result["abstract"].encode()[:2400].decode(errors="ignore")
    result["abstract_chars_available"] = len(record.get("abstract") or "")
    result["abstract_truncated"] = len(record.get("abstract") or "") > len(
        result.get("abstract") or ""
    ) or "abstract" in record.get("truncated_fields", [])
    result["preview_truncated"] = result["preview_truncated"] or result["abstract_truncated"]
    if isinstance(result.get("description"), str):
        result["description"] = result["description"].encode()[:2400].decode(errors="ignore")
    result["descriptions"] = [
        item[:600].encode()[:1200].decode(errors="ignore")
        for item in record.get("descriptions", [])[:3]
    ]
    result["description_truncated"] = len(record.get("description") or "") > len(
        result.get("description") or ""
    )
    result["preview_truncated"] = result["preview_truncated"] or result["description_truncated"]
    result["abstract_truncated"] = bool(record.get("abstract")) and (
        len(record["abstract"]) > 400 or "abstract" in record.get("truncated_fields", [])
    )
    return result


def observation_reference(source: dict) -> dict:
    """Public comparison pointer; the complete provider observation stays saved."""
    result = {
        key: copy.deepcopy(source[key])
        for key in (
            "source_ref",
            "provider",
            "record_id",
            "version",
            "run_id",
            "title",
            "doi",
            "year",
            "mode",
            "registry_only",
            "fictional",
            "content_state",
            "relevance",
            "abstract_chars_available",
            "abstract_truncated",
            "description_truncated",
        )
        if key in source
    }
    result["observation_reference"] = True
    result["abstract_available"] = bool(
        source.get("abstract") or source.get("abstract_chars_available")
    )
    result["description_available"] = bool(source.get("description") or source.get("descriptions"))
    return result


def _public_bytes(value) -> int:
    # Store events use JSON's default ASCII escaping, including for Unicode.
    return len(json.dumps(value).encode())


def _saved_counts(turn):
    return {
        **{key: len(turn.get(key, [])) for key in ("sources", "papers", "related_sources")},
        **{
            key: len(turn.get("retrieval", {}).get(key, []))
            for key in ("llm_requests", "source_requests", "assessments")
        },
    }


def stop_access_projection(turn: dict, reason: str):
    """End pending display states without releasing or replaying durable grants."""
    if turn.get("routing") != "auto":
        return
    for paper in turn.get("papers", []):
        if paper.get("access", {}).get("status") in {"queued", "running"}:
            paper["access"] = {"status": "failed", "reason": reason}


def bounded_history(snapshot: dict) -> dict:
    """Bound public snapshots while retaining all immutable data in local storage."""
    if _public_bytes(snapshot) <= PUBLIC_HISTORY_BYTES:
        return snapshot
    excerpt_bytes, audit_bytes = PUBLIC_EXCERPT_BYTES, PUBLIC_AUDIT_BYTES
    automatic = [turn for turn in snapshot["turns"] if turn.get("routing") == "auto"]
    for turn in reversed(automatic):
        turn["saved_result_counts"] = _saved_counts(turn)
        for paper in turn.get("papers", []):
            representative = paper["representative"]
            excerpts = {
                key: representative[key]
                for key in ("abstract", "description", "descriptions")
                if representative.get(key)
            }
            required = _public_bytes(excerpts)
            if required <= excerpt_bytes:
                excerpt_bytes -= required
            elif excerpts:
                representative["abstract_available"] = bool(
                    representative.get("abstract") or representative.get("abstract_chars_available")
                )
                representative["description_available"] = bool(
                    representative.get("description") or representative.get("descriptions")
                )
                for key in excerpts:
                    representative.pop(key, None)
                representative["excerpt_compacted"] = True
                turn["history_compacted"] = True
        for request in turn.get("retrieval", {}).get("llm_requests", []):
            required = _public_bytes(request.get("body"))
            if required <= audit_bytes:
                audit_bytes -= required
            elif request.get("body") is not None:
                request["body"] = {
                    "compacted": True,
                    "reason": "Open the saved turn to inspect its request body.",
                }
                request["body_compacted"] = True
                turn["history_compacted"] = True
    # Identity and audit-summary duplication can still make a long history large.
    # Drop older result projections only; the dedicated saved-turn route restores them.
    for turn in automatic[:-1]:
        if _public_bytes(snapshot) <= PUBLIC_HISTORY_BYTES:
            return snapshot
        turn["history_compacted"] = True
        for key in ("sources", "papers", "related_sources"):
            turn[key] = []
        for key in ("llm_requests", "source_requests", "assessments"):
            if "retrieval" in turn:
                turn["retrieval"][key] = []
    if _public_bytes(snapshot) <= PUBLIC_HISTORY_BYTES:
        return snapshot
    # A single unusually rich turn may itself exceed the SSE bound. Its complete
    # observations remain available through the originating saved run inspectors.
    for turn in automatic:
        turn["history_compacted"] = True
        turn["sources"] = []
        turn["related_sources"] = []
        for request in turn.get("retrieval", {}).get("llm_requests", []):
            if request.get("body") is not None:
                request["body"] = {"compacted": True}
                request["body_compacted"] = True
        for paper in turn.get("papers", []):
            paper["representative"] = observation_reference(paper["representative"])
            paper["representative"]["excerpt_compacted"] = True
    if _public_bytes(snapshot) > PUBLIC_HISTORY_BYTES:
        for turn in automatic:
            for paper in turn.get("papers", []):
                paper["observations_omitted"] = len(paper["observations"])
                paper["observations"] = []
    if _public_bytes(snapshot) > PUBLIC_HISTORY_BYTES:
        # Extremely large identity/access fields still have a deterministic safe
        # projection. Counts and exact saved-run links remain in the turn header.
        for turn in automatic:
            turn["papers"] = []
            turn["projection_limited"] = True
            for key in ("llm_requests", "source_requests", "assessments"):
                if "retrieval" in turn:
                    turn["retrieval"][key] = []
    return snapshot


class ConversationStore(Store):
    @staticmethod
    def public(document: dict) -> dict:
        result = copy.deepcopy(
            {key: value for key, value in document.items() if not key.startswith("_")}
        )
        for turn in result["turns"]:
            activity = []
            for key, operation in turn.get("_operations", {}).items():
                provider = operation.get("provider", key)
                name = operation.get("operation", "hybrid_search")
                activity.append(
                    {
                        "provider": provider,
                        "operation": name,
                        "status": operation.get("status", "admitted"),
                        "attempts": operation.get("attempts", 0),
                        "source_count": 0
                        if name == "agency"
                        else sum(source["provider"] == provider for source in turn["sources"]),
                        **(
                            {"error_code": operation["error_code"]}
                            if operation.get("error_code")
                            else {}
                        ),
                        **({"doi": operation["doi"]} if operation.get("doi") else {}),
                    }
                )
                if name == "access" and turn.get("access"):
                    activity[-1]["access_location_count"] = len(turn["access"]["oa_locations"])
                elif name == "access":
                    paper = next(
                        (
                            paper
                            for paper in turn.get("papers", [])
                            if paper.get("doi") == operation.get("doi")
                        ),
                        None,
                    )
                    if paper and paper.get("access", {}).get("observation"):
                        activity[-1]["access_location_count"] = len(
                            paper["access"]["observation"]["oa_locations"]
                        )
            if turn.get("retrieval"):
                activity.append(
                    {
                        "provider": "openai",
                        "operation": "search_refinement",
                        "status": turn["retrieval"]["status"],
                        "attempts": turn["usage"]["model_http_attempts"],
                        "source_count": 0,
                    }
                )
            turn["activity"] = activity
            turn["provider_activity"] = copy.deepcopy(activity)
            if turn.get("routing") == "auto" and turn["action"] == "discover":
                turn["sources"] = [observation_reference(source) for source in turn["sources"]]
                for paper in turn.get("papers", []):
                    paper["observations"] = [
                        observation_reference(source) for source in paper["observations"]
                    ]
                turn["related_sources"] = [
                    observation_reference(source) for source in turn.get("related_sources", [])
                ]
            for key in tuple(turn):
                if key.startswith("_"):
                    del turn[key]
        return bounded_history(result)

    def _recover(self, document: dict) -> bool:
        changed = False
        for turn in document["turns"]:
            if turn["status"] not in TERMINAL:
                turn["status"] = "INTERRUPTED"
                turn["completed_at"] = now()
                turn["warnings"].append("Application restarted; this turn was not replayed.")
                if turn.get("generation"):
                    turn["generation"]["status"] = "interrupted"
                    if "model" in turn.get("_operations", {}):
                        turn["_operations"]["model"]["status"] = "interrupted"
                if turn.get("retrieval"):
                    turn["retrieval"]["status"] = "interrupted"
                stop_access_projection(
                    turn,
                    "Application restarted before access lookup completed; no lookup was replayed.",
                )
                changed = True
        document["status"] = "IDLE"
        if changed:
            document["revision"] += 1
        return changed


class TurnState(TypedDict):
    conversation_id: str
    turn_id: str
    intent: str


class Conversations:
    def __init__(self, core: Core):
        self.core = core
        self.store = ConversationStore(
            core.settings.state_dir / "conversations", event_limit=core.settings.event_limit
        )
        self.tasks: dict[str, asyncio.Task] = {}
        graph = StateGraph(TurnState)
        graph.add_node("plan", self._plan)
        graph.add_node("execute", self._dispatch)
        graph.add_node("respond", self._respond)
        graph.add_edge(START, "plan")
        graph.add_edge("plan", "execute")
        graph.add_edge("execute", "respond")
        graph.add_edge("respond", END)
        self.graph = graph.compile(name="scout_exploration_routing")

    async def close(self):
        for task in self.tasks.values():
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        self.store.close()

    async def get(self, conversation_id: str, *, private=False):
        try:
            return await self.store.get(conversation_id, private=private)
        except KeyError:
            raise error("Exploration conversation not found.", 404) from None

    async def get_turn(self, conversation_id: str, turn_id: str):
        """Restore one saved public turn without provider, model or embedding calls."""
        document = await self.get(conversation_id, private=True)
        turn = next((turn for turn in document["turns"] if turn["id"] == turn_id), None)
        if turn is None:
            raise error("Exploration turn not found.", 404)
        document["turns"] = [turn]
        return self.store.public(document)["turns"][0]

    async def create(self, request: ConversationRequest):
        stamp = now()
        document = {
            "id": uuid.uuid4().hex,
            "title": "New exploration",
            "status": "IDLE",
            "created_at": stamp,
            "updated_at": stamp,
            "revision": 0,
            "routing": request.routing,
            "providers": list(
                request.providers or (["openalex"] if request.routing == "manual" else [])
            ),
            "filters": request.filters.model_dump(),
            "turns": [],
            "cursor": "",
            "_sequence": 0,
            "_stream_id": uuid.uuid4().hex,
            "_events": [],
        }
        return await self.store.add(document)

    async def _automatic_sources(self, message, filters, *, agentic=False):
        """Route from a local health snapshot; this never probes an upstream API."""
        health = {item["id"]: item for item in (await self.core.providers())["providers"]}
        eligible, plan = [], []
        for provider, item in health.items():
            role = (
                "discovery"
                if provider in DISCOVERY_PROVIDER_IDS
                else "access"
                if provider == "unpaywall"
                else "registry"
            )
            status, reason = "eligible", "Local service is ready for discovery."
            capabilities = item.get("capabilities", {})
            last_error = str(item.get("last_error") or "")
            if item.get("mode") != self.core.settings.provider_modes[provider]:
                status, reason = (
                    "skipped",
                    "Local service mode does not match the admitted configuration.",
                )
            elif (
                item.get("status") not in {"ready", "ok"} or item.get("access_configured") is False
            ):
                status, reason = (
                    "skipped",
                    str(
                        item.get("blocked_reason")
                        or "Local service is unavailable or needs access."
                    )[:400],
                )
            elif any(
                marker in last_error.upper()
                for marker in ("RATE_LIMIT", "QUOTA", "AUTH", "ACCESS", "OAUTH", "UNAVAILABLE")
            ):
                status, reason = (
                    "skipped",
                    f"Last known provider failure: {last_error[:100]}; no automatic retry.",
                )
            elif role == "discovery" and not (
                isinstance(capabilities, dict) and capabilities.get("search")
            ):
                status, reason = "skipped", "The service does not advertise discovery capability."
            elif role == "discovery" and agentic and item.get("mode") != "live":
                status, reason = "skipped", "AI refinement admits live observations only."
            elif (
                provider == "semantic_scholar"
                and item.get("mode") == "live"
                and not (
                    item.get("access_method") == "api_key"
                    or bool(
                        {"search", "lexical", "semantic"}.intersection(
                            item.get("verified_capabilities", [])
                        )
                    )
                )
            ):
                status, reason = (
                    "skipped",
                    "Semantic Scholar needs configured access or verified search before automatic selection.",
                )
            elif role == "registry":
                status, reason = (
                    "metadata_only",
                    "Registration-aware exact DOI metadata; not a topic-discovery source.",
                )
            elif role == "access":
                status, reason = (
                    "enrichment",
                    "Resolve unique discovered DOIs after discovery; no full-text download.",
                )
            if role == "discovery" and status == "eligible":
                eligible.append(provider)
            plan.append(
                {
                    "provider": provider,
                    "role": role,
                    "status": status,
                    "reason": reason,
                    "health_status": str(item.get("status", "unavailable")),
                    "mode": self.core.settings.provider_modes[provider],
                    "readiness": str(item.get("readiness", "unknown")),
                    **({"last_error": last_error[:100]} if last_error else {}),
                }
            )
        bio = bool(
            re.search(
                r"\b(?:bio\w*|medic\w*|clinic\w*|cancer|gene\w*|protein\w*|patient\w*|disease\w*|health\w*|drug\w*|vaccine\w*)\b",
                message,
                re.I,
            )
        )
        preferred = (
            ["openalex", "europe_pmc", "crossref", "openaire"]
            if bio
            else ["openalex", "crossref", "arxiv", "openaire"]
        )
        if filters.get("resource_type") in {"book", "book-chapter"}:
            preferred = ["openalex", "crossref", "openaire", "semantic_scholar"]
        selected = [provider for provider in preferred if provider in eligible]
        for provider in eligible:
            if len(selected) >= 2:
                break
            if provider not in selected:
                selected.append(provider)
        selected = selected[:4]
        if not agentic:
            for item in plan:
                if item["role"] == "discovery" and item["status"] == "eligible":
                    item["status"] = "selected" if item["provider"] in selected else "skipped"
                    item["reason"] = (
                        "Selected for this question by the bounded automatic route."
                        if item["provider"] in selected
                        else "Ready source outside this turn's bounded source plan."
                    )
        return selected, eligible, plan

    async def _saved_abstract_evidence(self, sources: list[dict]) -> list[dict]:
        """Read richer originating-provider records locally; never fetch upstream here.

        A new answer can use explicitly fetched details without mutating earlier
        conversation/source/citation snapshots. Its admitted version is exact.
        """
        result, runs = [], {}
        for item in sources:
            if not item.get("run_id"):
                result.append(item)
                continue
            if item["run_id"] not in runs:
                runs[item["run_id"]] = await self.core.get(item["run_id"])
            run = runs[item["run_id"]]
            record = next(
                (
                    record
                    for record in run["entities"]
                    if record["source_ref"] == item["source_ref"]
                ),
                None,
            )
            if record and item.get("relevance") and record["version"] != item["version"]:
                private = await self.core.get(item["run_id"], private=True)
                record = copy.deepcopy(
                    private["_observations"].get(f"{item['source_ref']}@{item['version']}")
                )
                if record:
                    record["eligible"], _ = filter_record(record, run["filters"])
            if (
                record is None
                or record["provider"] != item["provider"]
                or record["mode"] != item["mode"]
                or not record.get("eligible")
            ):
                raise error("Saved source details no longer match the admitted research scope.")
            richer = preview(record, item["run_id"])
            richer["abstract"] = record.get("abstract")
            richer["abstract_truncated"] = "abstract" in record.get("truncated_fields", [])
            richer["abstract_chars_available"] = len(record.get("abstract") or "")
            richer["evidence_source"] = (
                "saved_provider_details" if record.get("details_loaded") else "saved_discovery"
            )
            if item.get("relevance"):
                richer["relevance"] = copy.deepcopy(item["relevance"])
                richer["evidence_source"] = "saved_reviewed_observation"
            result.append(richer)
        return result

    async def submit(self, conversation_id: str, request: TurnRequest):
        body = request.model_dump(exclude={"idempotency_key", "expected_revision"})
        if request.routing is None:
            body.pop("routing", None)  # retain historical send-key identities
        if not request.agentic:
            body.pop("agentic", None)  # retain pre-refinement idempotency identities
        key_hash, request_hash = fingerprint(request.idempotency_key), fingerprint(body)
        async with self.core._start_lock:
            conversation = await self.get(conversation_id, private=True)
            for turn in conversation["turns"]:
                if turn["_idempotency_hash"] == key_hash:
                    if turn["_request_hash"] != request_hash:
                        raise error("This send key already belongs to another message.")
                    return self.store.public(conversation)
            if request.expected_revision != conversation["revision"]:
                raise error("Exploration changed; reload its saved snapshot before sending.")
            if self.core.active_turn:
                raise error("Another exploration turn is active. Saved work remains available.")
            if self.core.active_run:
                current = await self.core.get(self.core.active_run)
                if current["status"] not in TERMINAL:
                    raise error("A discovery run is active. Saved work remains available.")
            if len(conversation["turns"]) >= 16:
                raise error(
                    "This bounded exploration is full. Start a new one; saved work remains available."
                )
            doi = exact_doi(request.message)
            action = (
                "lookup"
                if request.action == "lookup" or (request.action == "discover" and doi)
                else request.action
            )
            if action in {"lookup", "access"} and not doi:
                raise error("Paste an exact DOI or doi.org URL for a registry lookup.", 422)
            generation_sources, omitted = [], 0
            if action == "generate":
                prior = [
                    turn
                    for turn in conversation["turns"]
                    if turn["sources"] and turn["action"] != "generate"
                ]
                generation_sources = copy.deepcopy(prior[-1]["sources"]) if prior else []
                generation_sources = [
                    source
                    for source in generation_sources
                    if not source.get("relevance") or source["relevance"].get("label") == "relevant"
                ]
                if request.source_ref:
                    generation_sources = [
                        source
                        for source in generation_sources
                        if source["source_ref"] == request.source_ref
                        and (not request.run_id or source["run_id"] == request.run_id)
                    ]
                from .federation import unique_evidence

                generation_sources = unique_evidence(generation_sources)
                generation_sources = await self._saved_abstract_evidence(generation_sources)
                try:
                    _, generation_sources, omitted = self.core.generation.prepare(
                        request.message, generation_sources
                    )
                    readiness = self.core.generation.readiness()
                    if readiness["status"] != "ready":
                        raise GenerationError(readiness["blocked_reason"])
                except GenerationError as exc:
                    raise error(str(exc), 409) from None
            routing = request.routing or (
                "manual" if request.providers is not None else conversation.get("routing", "manual")
            )
            providers = request.providers or conversation["providers"] or ["openalex"]
            if (
                routing == "manual"
                and request.providers is None
                and conversation.get("routing") == "auto"
            ):
                providers = ["openalex"]
            filters = request.filters.model_dump() if request.filters else conversation["filters"]
            eligible_providers, source_plan = [], []
            if action == "discover":
                if routing == "auto":
                    providers, eligible_providers, source_plan = await self._automatic_sources(
                        request.message, filters, agentic=request.agentic
                    )
                    if request.agentic and not eligible_providers:
                        raise error(
                            "No ready live discovery sources are available for AI refinement."
                        )
                elif len(providers) > 2:
                    raise error("Manual routing supports at most two discovery providers.", 422)
                # Same deterministic context boundary as legacy research runs.
                for provider in providers:
                    ResearchRequest(
                        question=request.message,
                        provider=provider,
                        filters=filters,
                        idempotency_key="preflight",
                    )
                if request.agentic:
                    readiness = self.core.retrieval.readiness()
                    if not readiness["ready"]:
                        raise error(readiness["blocked_reason"])
                    if any(
                        self.core.settings.provider_modes[provider] != "live"
                        for provider in providers
                    ):
                        raise error(
                            "AI refinement requires live providers; fixture results are not sent to the model."
                        )
            elif request.agentic:
                raise error("AI search refinement applies only to topic discovery.", 422)
            turn_id = uuid.uuid4().hex
            token = f"{conversation_id}:{turn_id}"
            turn = {
                "id": turn_id,
                "message": request.message,
                "action": action,
                "routing": routing,
                "eligible_providers": list(eligible_providers),
                "source_plan": source_plan,
                "agentic": bool(request.agentic and action == "discover"),
                "providers": ["unpaywall"]
                if action == "access"
                else ["crossref"]
                if action == "lookup"
                else list(providers),
                "filters": copy.deepcopy(filters),
                "status": "QUEUED",
                "created_at": now(),
                "run_ids": [],
                "sources": [],
                "papers": [],
                "response": "",
                "warnings": [
                    "No ready discovery sources were selected from the local health snapshot."
                ]
                if action == "discover" and routing == "auto" and not providers
                else [],
                "usage": {"research_attempts": 0, "model_http_attempts": 0, "model_cost_usd": 0},
                "plan": {"routing": "deterministic", "generation": "disabled", "intent": action},
                "_idempotency_hash": key_hash,
                "_request_hash": request_hash,
                "_doi": doi,
                "_operations": {},
                "_source_ref": request.source_ref,
                "_run_id": request.run_id,
                "_filter_requested": request.filters is not None,
            }
            if action == "generate":
                turn["providers"] = []
                turn["sources"] = generation_sources
                turn["plan"].update(
                    generation="openai_responses", model=MODEL, omitted_source_count=omitted
                )
                turn["generation"] = {
                    "status": "admitted",
                    "model": MODEL,
                    "profile": "demo",
                    "omitted_source_count": omitted,
                    "reservation_usd": self.core.generation.config.max_turn_cost_usd,
                }
            if turn["agentic"]:
                from .retrieval import POLICY

                turn["related_sources"] = []
                turn["plan"].update(routing="bounded_agentic_retrieval", model=MODEL)
                turn["retrieval"] = {
                    "status": "planning",
                    "round": 1,
                    "max_rounds": 2,
                    "model": MODEL,
                    "max_model_calls": 9 if routing == "auto" else 5,
                    "assessments": [],
                    "rejected_count": 0,
                    "query_history": [],
                    "policy": POLICY,
                    "provider_quality": {},
                    "llm_requests": [],
                    "source_requests": [],
                }

            def accept(document):
                document["turns"].append(turn)
                document["status"] = "RUNNING"
                document["revision"] += 1
                if len(document["turns"]) == 1:
                    document["title"] = request.message[:100]
                if action == "discover":
                    document["routing"] = routing
                    document["providers"], document["filters"] = (
                        list(providers),
                        copy.deepcopy(filters),
                    )

            result = await self.store.mutate(conversation_id, accept, "turn.accepted")
            self.core.active_turn = token
            self.tasks[token] = asyncio.create_task(self._run(conversation_id, turn_id))
            self.tasks[token].add_done_callback(lambda _task: self.tasks.pop(token, None))
            return result

    async def _edit(self, conversation_id, turn_id, edit, kind):
        def mutate(document):
            turn = next(item for item in document["turns"] if item["id"] == turn_id)
            if turn["status"] in TERMINAL:
                return
            edit(turn)
            document["revision"] += 1

        return await self.store.mutate(conversation_id, mutate, kind)

    async def _turn(self, conversation_id, turn_id, *, private=True):
        conversation = await self.get(conversation_id, private=private)
        turn = next((turn for turn in conversation["turns"] if turn["id"] == turn_id), None)
        if turn is None:
            raise error("Exploration turn not found.", 404)
        return turn

    async def _plan(self, state: TurnState):
        turn = await self._turn(state["conversation_id"], state["turn_id"])
        await self._edit(
            state["conversation_id"],
            state["turn_id"],
            lambda item: item.update(status="RUNNING"),
            "plan.ready",
        )
        return {"intent": turn["action"]}

    async def _dispatch(self, state: TurnState):
        conversation_id, turn_id = state["conversation_id"], state["turn_id"]
        if state["intent"] == "discover":
            turn = await self._turn(conversation_id, turn_id)
            if turn.get("agentic"):
                await self.core.retrieval.run(conversation_id, turn_id)
            else:
                await self._discover(conversation_id, turn_id)
            turn = await self._turn(conversation_id, turn_id)
            if turn.get("routing") == "auto" and turn["status"] not in TERMINAL:
                await self.core.federation.enrich_turn(conversation_id, turn_id)
        elif state["intent"] == "lookup":
            await self._lookup(conversation_id, turn_id)
        elif state["intent"] == "access":
            await self._access(conversation_id, turn_id)
        elif state["intent"] == "generate":
            await self._generate(conversation_id, turn_id)
        else:
            await self._saved(conversation_id, turn_id)
        return {}

    async def _discover(
        self,
        conversation_id,
        turn_id,
        *,
        provider_override=None,
        round_index=0,
        search_queries=None,
        publish_sources=True,
    ):
        token = f"{conversation_id}:{turn_id}"
        turn = await self._turn(conversation_id, turn_id)
        snapshots = []
        for provider in [provider_override] if provider_override else turn["providers"]:
            operation_key = f"r{round_index}:{provider}" if round_index else provider
            current = await self._turn(conversation_id, turn_id)
            if current["status"] in TERMINAL:
                return snapshots

            # A persisted operation intent precedes the child admission/dispatch.
            def admit_child(item, provider=provider, operation_key=operation_key):
                if (
                    sum(
                        operation.get("attempts", 0) + operation.get("hold", 0)
                        for operation in item["_operations"].values()
                    )
                    + 4
                    > 24
                ):
                    raise error("The exploration turn's request allowance is exhausted or held.")
                item["_operations"][operation_key] = {
                    "provider": provider,
                    "status": "admitted",
                    "attempts": 0,
                    "hold": 4,
                    "operation": "hybrid_search",
                    "round": round_index,
                }

            await self._edit(conversation_id, turn_id, admit_child, "provider.started")
            run = await self.core.create(
                ResearchRequest(
                    question=turn["message"],
                    provider=provider,
                    filters=turn["filters"],
                    idempotency_key=f"chat:{token}:{operation_key}",
                ),
                owner_turn=token,
                launch=False,
                search_queries=search_queries,
            )
            await self._edit(
                conversation_id,
                turn_id,
                lambda item, run_id=run["id"]: item["run_ids"].append(run_id),
                "provider.admitted",
            )
            linked = await self._turn(conversation_id, turn_id)
            if linked["status"] in TERMINAL:
                await self.core.cancel(run["id"])
                return snapshots
            self.core.launch_admitted(run["id"])
            last_cursor = None
            while True:
                async with self.core.store.changed:
                    snapshot = await self.core.get(run["id"])
                    if snapshot["cursor"] != last_cursor:
                        last_cursor = snapshot["cursor"]

                        def publish(
                            item, snapshot=snapshot, provider=provider, operation_key=operation_key
                        ):
                            if publish_sources:
                                others = [
                                    source
                                    for source in item["sources"]
                                    if source["run_id"] != snapshot["id"]
                                ]
                                item["sources"] = others + [
                                    preview(source, snapshot["id"])
                                    for source in sorted(
                                        snapshot["entities"],
                                        key=lambda source: (
                                            -source.get("rank_score", 0),
                                            source["source_ref"],
                                        ),
                                    )
                                    if source.get("eligible")
                                ]
                            item["_operations"][operation_key] = {
                                "provider": provider,
                                "operation": "hybrid_search",
                                "round": round_index,
                                "status": snapshot["status"],
                                "attempts": snapshot["usage"]["research_attempts"],
                                "hold": sum(snapshot["usage"]["reserved_by_provider"].values()),
                            }
                            item["usage"]["research_attempts"] = sum(
                                operation.get("attempts", 0)
                                for operation in item["_operations"].values()
                            )
                            for warning in snapshot["warnings"]:
                                label = f"{LABELS[provider]}: {warning}"
                                if label not in item["warnings"]:
                                    item["warnings"].append(label)

                        await self._edit(
                            conversation_id,
                            turn_id,
                            publish,
                            "source.available"
                            if publish_sources and snapshot["entities"]
                            else "provider.updated",
                        )
                        if publish_sources:
                            await self.core.federation.refresh_turn(conversation_id, turn_id)
                    if snapshot["status"] in TERMINAL:
                        break
                    try:
                        await asyncio.wait_for(self.core.store.changed.wait(), timeout=5)
                    except TimeoutError:
                        pass
            if self.core.active_run == snapshot["id"]:
                self.core.active_run = None
            snapshots.append(snapshot)
        return snapshots

    async def _saved(self, conversation_id, turn_id):
        conversation = await self.get(conversation_id, private=True)
        turn = next(item for item in conversation["turns"] if item["id"] == turn_id)
        previous = [
            item for item in conversation["turns"] if item["id"] != turn_id and item["sources"]
        ]
        sources = copy.deepcopy(previous[-1]["sources"]) if previous else []
        sources = [
            source
            for source in sources
            if not source.get("relevance") or source["relevance"].get("label") == "relevant"
        ]
        if turn["_run_id"]:
            sources = [source for source in sources if source["run_id"] == turn["_run_id"]]
        if turn["_source_ref"]:
            sources = [source for source in sources if source["source_ref"] == turn["_source_ref"]]
        else:
            match = re.search(r"\b(?:paper|source)\s+(\d+)\b", turn["message"], re.I)
            if match:
                index = int(match[1]) - 1
                sources = sources[index : index + 1] if index >= 0 else []
        if turn["_filter_requested"]:
            sources = [source for source in sources if filter_record(source, turn["filters"])[0]]

        def retain_saved(item):
            item["sources"] = sources
            item["papers"] = copy.deepcopy(previous[-1].get("papers", [])) if previous else []

        await self._edit(conversation_id, turn_id, retain_saved, "saved.sources")
        await self.core.federation.refresh_turn(conversation_id, turn_id)

    async def _registry_call(self, conversation_id, turn_id, provider, operation, doi):
        operation_id = fingerprint(f"{conversation_id}:{turn_id}:{provider}:{operation}:{doi}")[:32]

        def admit(item):
            if operation_id in item["_operations"]:
                raise error("This DOI operation was already admitted; it will not be replayed.")
            if (
                sum(
                    operation.get("attempts", 0) + operation.get("hold", 0)
                    for operation in item["_operations"].values()
                )
                + 1
                > 24
            ):
                raise error("The exploration turn's request allowance is exhausted or held.")
            item["_operations"][operation_id] = {
                "provider": provider,
                "operation": operation,
                "doi": doi,
                "status": "admitted",
                "attempts": 0,
                "hold": 1,
            }
            if provider not in item["providers"] and not (
                item.get("routing") == "auto" and operation == "access"
            ):
                item["providers"].append(provider)

        await self._edit(conversation_id, turn_id, admit, "registry.admitted")
        if (await self._turn(conversation_id, turn_id))["status"] in TERMINAL:
            raise asyncio.CancelledError
        try:
            response = await self.core.client.post(
                f"{self.core.settings.provider_urls[provider]}/operations/{operation}",
                json={
                    "operation_id": operation_id,
                    "run_id": turn_id,
                    "remaining_attempts": 1,
                    "doi": doi,
                },
            )
            payload = response.json()
            if (
                not isinstance(payload, dict)
                or payload.get("provider") != provider
                or payload.get("mode") != self.core.settings.provider_modes[provider]
                or type(payload.get("attempts")) is not int
                or not 0 <= payload["attempts"] <= 1
            ):
                raise error("Registry response did not match the admitted operation.", 502)
        except BaseException:
            await self._edit(
                conversation_id,
                turn_id,
                lambda item: item["_operations"][operation_id].update(status="uncertain"),
                "registry.uncertain",
            )
            raise

        def settle(item):
            item["_operations"][operation_id].update(
                status="completed" if response.is_success else "failed",
                attempts=payload["attempts"],
                hold=0,
            )
            if not response.is_success:
                item["_operations"][operation_id]["error_code"] = str(
                    payload.get("code") or f"HTTP_{response.status_code}"
                )[:80]
                if provider == "unpaywall" and payload.get("code") == "ACCESS_NOT_CONFIGURED":
                    item["warnings"].append(
                        "Unpaywall requires your configured contact email before an access lookup; no upstream request was made."
                    )
            item["usage"]["research_attempts"] = sum(
                operation.get("attempts", 0) for operation in item["_operations"].values()
            )

        await self._edit(
            conversation_id,
            turn_id,
            settle,
            "registry.completed" if response.is_success else "registry.failed",
        )
        response.raise_for_status()
        return payload

    async def _lookup(self, conversation_id, turn_id):
        turn = await self._turn(conversation_id, turn_id)
        agency = await self._registry_call(
            conversation_id, turn_id, "crossref", "agency", turn["_doi"]
        )
        provider = agency.get("agency")
        if provider not in {"crossref", "datacite"}:
            await self._edit(
                conversation_id,
                turn_id,
                lambda item: item["warnings"].append(
                    "The DOI registration agency is unavailable or unsupported; no blind registry fallback was attempted."
                ),
                "registry.unresolved",
            )
            return
        current = await self._turn(conversation_id, turn_id)
        if current["status"] in TERMINAL:
            return
        payload = await self._registry_call(
            conversation_id, turn_id, provider, "metadata", turn["_doi"]
        )
        record = SourceRecord.model_validate(payload["record"]).model_dump()
        if (
            record["provider"] != provider
            or exact_doi(record.get("doi") or "") != turn["_doi"]
            or record["mode"] != self.core.settings.provider_modes[provider]
        ):
            raise error("Registry observation did not match the DOI route.", 502)
        await self._edit(
            conversation_id,
            turn_id,
            lambda item: item.update(sources=[preview(record, "", registry_only=True)]),
            "source.available",
        )

    async def _access(self, conversation_id, turn_id):
        turn = await self._turn(conversation_id, turn_id)
        payload = await self._registry_call(
            conversation_id, turn_id, "unpaywall", "access", turn["_doi"]
        )
        try:
            observation = AccessObservation.model_validate(payload["access"]).model_dump()
            if (
                exact_doi(observation["doi"]) != turn["_doi"]
                or observation["mode"] != self.core.settings.provider_modes["unpaywall"]
            ):
                raise ValueError("Mismatched access observation.")
        except (ValueError, KeyError):

            def rejected(item):
                for operation in item["_operations"].values():
                    if (
                        operation.get("provider") == "unpaywall"
                        and operation.get("operation") == "access"
                    ):
                        operation.update(status="failed", error_code="INVALID_ACCESS_OBSERVATION")

            await self._edit(conversation_id, turn_id, rejected, "access.rejected")
            raise error(
                "Access observation did not match the admitted DOI or provider profile.", 502
            ) from None
        await self._edit(
            conversation_id,
            turn_id,
            lambda item: item.update(access=observation),
            "access.available",
        )

    async def _generate(self, conversation_id, turn_id):
        service = self.core.generation
        operation_id = f"{conversation_id}:{turn_id}"
        text, deltas, last_flush, completed, entry = "", 0, 0.0, False, None
        turn = await self._turn(conversation_id, turn_id)
        payload, sources, _ = service.prepare(turn["message"], turn["sources"])
        try:
            entry = await service.reserve(operation_id)

            def admitted(item):
                item["generation"].update(
                    status="admitted", reservation_usd=entry["reservation_usd"]
                )
                item["usage"].update(
                    model_cost_usd=None, model_cost_hold_usd=entry["reservation_usd"]
                )
                item["_operations"]["model"] = {
                    "provider": "openai",
                    "operation": "generation",
                    "status": "admitted",
                    "attempts": 0,
                }

            await self._edit(conversation_id, turn_id, admitted, "generation.admitted")
            if (await self._turn(conversation_id, turn_id))["status"] in TERMINAL:
                raise asyncio.CancelledError
            await service.dispatched(operation_id)

            def dispatched(item):
                item["generation"].update(status="streaming", delta_events=0)
                item["usage"]["model_http_attempts"] = 1
                item["_operations"]["model"].update(status="streaming", attempts=1)

            await self._edit(conversation_id, turn_id, dispatched, "generation.started")
            if (await self._turn(conversation_id, turn_id))["status"] in TERMINAL:
                raise asyncio.CancelledError
            flushed_length = 0
            async with aclosing(service.streamer(payload)) as events:
                async with asyncio.timeout(service.config.timeout_seconds):
                    async for event in events:
                        current = await self._turn(conversation_id, turn_id)
                        if current["status"] in TERMINAL:
                            raise asyncio.CancelledError
                        if not isinstance(event, dict):
                            raise GenerationError("Malformed model stream event.")
                        kind = event.get("type")
                        if kind == "response.output_text.delta":
                            delta = event.get("delta")
                            if not isinstance(delta, str):
                                raise GenerationError("Malformed model text delta.")
                            text += delta
                            deltas += 1
                            if len(text.encode()) > 16_000:
                                raise GenerationError(
                                    "Streamed model output exceeded its byte envelope."
                                )
                            clock = time.monotonic()
                            if (
                                flushed_length == 0
                                or len(text) - flushed_length >= 96
                                or clock - last_flush >= 0.08
                            ):

                                def publish(item, text=text, deltas=deltas):
                                    item["response"] = text
                                    item["generation"].update(
                                        status="streaming", delta_events=deltas
                                    )

                                await self._edit(conversation_id, turn_id, publish, "answer.delta")
                                flushed_length, last_flush = len(text), clock
                        elif kind in {
                            "response.completed",
                            "response.incomplete",
                            "response.failed",
                        }:
                            response = event.get("response") or {}
                            actual_model = response.get("model", MODEL)
                            if actual_model != MODEL and not actual_model.startswith(MODEL + "-"):
                                raise GenerationError(
                                    "The response used an unexpected model profile."
                                )
                            if response.get("service_tier", "default") not in {
                                "default",
                                "standard",
                            }:
                                raise GenerationError(
                                    "The response used an unexpected service tier."
                                )
                            entry = await service.settle(operation_id, response.get("usage"))

                            def usage(
                                item,
                                text=text,
                                entry=entry,
                                actual_model=actual_model,
                                deltas=deltas,
                            ):
                                item["response"] = text
                                item["generation"].update(
                                    input_tokens=entry["input_tokens"],
                                    output_tokens=entry["output_tokens"],
                                    cost_usd=entry["cost_usd"],
                                    cost_basis=entry["cost_basis"],
                                    cost_is_estimate=True,
                                    actual_model=actual_model,
                                    delta_events=deltas,
                                )
                                item["usage"].update(
                                    model_cost_usd=entry["cost_usd"], model_cost_hold_usd=0
                                )

                            await self._edit(conversation_id, turn_id, usage, "generation.usage")
                            if (
                                kind != "response.completed"
                                or response.get("status", "completed") != "completed"
                            ):
                                raise GenerationError(
                                    "The model stream ended with an incomplete or failed response."
                                )
                            completed = True
                            break
                        elif kind == "error" or "function_call" in str(kind):
                            raise GenerationError(
                                "The model stream failed or attempted an unadmitted tool operation."
                            )
            if not completed:
                raise GenerationError(
                    "The model stream ended without a completed response; no retry."
                )
            try:
                citations = service.citations(text, sources)
            except GenerationError:
                await self._edit(
                    conversation_id,
                    turn_id,
                    lambda item: item["generation"].update(status="invalid_citations"),
                    "generation.invalid_citations",
                )
                raise

            def finish(item):
                item.update(
                    response=text, citations=citations, status="SUCCEEDED", completed_at=now()
                )
                item["generation"].update(
                    status="completed",
                    validation={
                        "references": "validated",
                        "entailment": "not automatically certified",
                    },
                )
                item["_operations"]["model"]["status"] = "completed"

            await self._edit(conversation_id, turn_id, finish, "answer.completed")
        except asyncio.CancelledError:
            await service.uncertain(operation_id, "cancelled_or_interrupted")
            await self._edit(
                conversation_id,
                turn_id,
                lambda item: item["generation"].update(status="interrupted"),
                "generation.interrupted",
            )
            raise
        except Exception as exc:
            if isinstance(exc, GenerationHTTPError) and exc.status in {401, 403}:
                service.access_error = "OpenAI rejected access. Configure a valid credential/model grant before another generation."
            await service.uncertain(operation_id, "failed_unknown_cost")
            explanation = (
                str(exc)
                if isinstance(exc, GenerationError)
                else f"Generation stopped ({type(exc).__name__})."
            )

            def fail(item):
                item.update(
                    response=text
                    or "The model could not produce a completed cited answer. Saved evidence remains available.",
                    status="PARTIAL" if text else "FAILED",
                    completed_at=now(),
                )
                if item["generation"]["status"] != "invalid_citations":
                    item["generation"]["status"] = (
                        "incomplete" if entry and entry.get("cost_usd") is not None else "failed"
                    )
                item["generation"]["validation"] = {"references": "not accepted"}
                item["warnings"].append(
                    explanation
                    + " Unvalidated draft text is not an accepted research answer; no automatic retry."
                )
                if "model" in item["_operations"]:
                    item["_operations"]["model"]["status"] = "failed"

            await self._edit(conversation_id, turn_id, fail, "generation.failed")

    async def _respond(self, state: TurnState):
        conversation_id, turn_id = state["conversation_id"], state["turn_id"]
        turn = await self._turn(conversation_id, turn_id)
        if turn["action"] == "generate":
            return {}
        if turn["action"] == "access":
            observation = turn.get("access")
            if observation:
                available = "yes" if observation["is_oa"] else "no"
                response = (
                    f"Unpaywall DOI access lookup: {observation['doi']}.\n\n"
                    f"Provider-reported open access: {available}; status: {observation['oa_status']}. "
                    f"{len(observation['oa_locations'])} access location(s) supplied.\n\n"
                    "These are separate access observations, not abstracts or scientific evidence. "
                    "No PDF or full text was downloaded."
                )
                await self._edit(
                    conversation_id,
                    turn_id,
                    lambda item: item.update(
                        response=response, status="SUCCEEDED", completed_at=now()
                    ),
                    "answer.completed",
                )
            return {}
        sources = turn["sources"]
        lines = []
        if turn.get("retrieval", {}).get("status") == "clarification_needed":
            await self._edit(
                conversation_id,
                turn_id,
                lambda item: item.update(
                    response=item["retrieval"]["clarification_question"],
                    status="EMPTY",
                    completed_at=now(),
                ),
                "retrieval.clarification",
            )
            return {}
        if turn["action"] == "lookup":
            lines.append(f"DOI lookup: {turn['_doi']}.")
        elif turn["action"] == "saved":
            lines.append("Saved source records; no new provider or model calls.")
        else:
            for provider in turn["providers"]:
                selected = [source for source in sources if source["provider"] == provider]
                operations = [
                    op
                    for key, op in turn["_operations"].items()
                    if op.get("provider", key) == provider
                ]
                operation = operations[-1] if operations else {}
                lines.append(
                    f"{LABELS[provider]}: {len(selected)} source records · {operation.get('status', 'not started').lower()}."
                )
        display_sources = sources
        if turn.get("routing") == "auto" and turn.get("papers"):
            display_sources = [paper["representative"] for paper in turn["papers"]]
            lines.append(
                f"{len(display_sources)} unique papers from {len(sources)} provider observations; duplicate DOI observations retain their separate provenance."
            )
        for index, source in enumerate(display_sources[:6], 1):
            lines.append(
                f"{index}. {source['title']} ({source.get('year') or 'year unavailable'}). Source: {LABELS[source['provider']]}."
            )
            if turn["action"] == "saved" and source.get("abstract"):
                lines.append(f"Provider excerpt: “{source['abstract']}”")
            elif turn["action"] == "saved" and source.get("description"):
                lines.append(f"Provider description excerpt: “{source['description']}”")
        if not sources:
            lines.append(
                "No usable source records are available for this turn. Check the provider status and warnings below."
            )
        if turn.get("agentic"):
            lines.append(
                f"AI search refinement reviewed {len(turn['retrieval']['assessments'])} candidate observations; "
                f"{turn['retrieval']['rejected_count']} were withheld as unrelated. "
                f"{len(turn.get('related_sources', []))} adjacent or uncertain records are kept separately from directly relevant results. "
                "Relevance labels are model judgments over metadata/excerpts, not verified scientific findings. "
                "Stream answer remains a separate action over saved evidence."
            )
        else:
            lines.append(
                "This turn used deterministic routing and no language-model call. Stream answer is a separate explicit action over saved live evidence."
                if self.core.generation.config.enabled
                else "Generation is disabled. These are attributed provider records, not a generated research answer or full-text review."
            )
        if any(source.get("fictional") or source.get("mode") == "fixture" for source in sources):
            lines.append("Fixture records are fictional test data.")
        failed = bool(turn["warnings"]) or any(
            operation.get("status") not in {"SUCCEEDED", "EMPTY", "completed"}
            for operation in turn["_operations"].values()
        )
        status = (
            ("PARTIAL" if failed else "SUCCEEDED") if sources else ("FAILED" if failed else "EMPTY")
        )

        def finish(item):
            item.update(response="\n\n".join(lines), status=status, completed_at=now())

        await self._edit(conversation_id, turn_id, finish, "answer.completed")
        return {}

    async def _run(self, conversation_id, turn_id):
        token = f"{conversation_id}:{turn_id}"
        try:
            await asyncio.wait_for(
                self.graph.ainvoke(
                    {"conversation_id": conversation_id, "turn_id": turn_id, "intent": ""},
                    config={"recursion_limit": 8},
                ),
                timeout=420,
            )
        except (asyncio.CancelledError, NodeCancelledError):
            await self._stop_children(conversation_id, turn_id)

            def interrupt(item):
                item.update(status="INTERRUPTED", completed_at=now())
                stop_access_projection(
                    item, "The turn stopped before access lookup completed; no lookup was replayed."
                )

            await self._edit(
                conversation_id,
                turn_id,
                interrupt,
                "turn.interrupted",
            )
            raise asyncio.CancelledError from None
        except Exception as exc:
            error_name = type(exc).__name__
            await self._stop_children(conversation_id, turn_id)

            def fail(item):
                item.update(
                    status="PARTIAL" if item["sources"] else "FAILED",
                    completed_at=now(),
                    response="This route could not complete. Saved source records remain available; no alternate provider or generated answer was substituted.",
                )
                item["warnings"].append(
                    f"Routing stopped ({error_name}). Check provider readiness; uncertain request outcomes remain held."
                )
                stop_access_projection(
                    item,
                    "The turn stopped before access lookup completed; unresolved attempts remain held and no lookup was retried.",
                )

            await self._edit(conversation_id, turn_id, fail, "turn.failed")
        finally:
            await self.store.mutate(
                conversation_id, lambda document: document.update(status="IDLE"), "turn.finished"
            )
            if self.core.active_turn == token:
                self.core.active_turn = None

    async def _stop_children(self, conversation_id, turn_id):
        turn = await self._turn(conversation_id, turn_id)
        # The run's owner is committed before its conversation link. Reconcile
        # that narrow interruption window locally; never redispatch a child.
        token = f"{conversation_id}:{turn_id}"
        owned = {
            run["id"]
            for run in await self.core.store.list()
            if run.get("conversation_turn") == token
        }
        for run_id in owned | set(turn["run_ids"]):
            run = await self.core.get(run_id)
            if run["status"] not in TERMINAL:
                await self.core.cancel(run_id)

    async def cancel(self, conversation_id, turn_id):
        turn = await self._turn(conversation_id, turn_id)
        if turn["status"] in TERMINAL:
            return await self.get(conversation_id)

        def stop(item):
            item.update(
                status="CANCELLED",
                completed_at=now(),
                response=item["response"]
                or "Exploration stopped. Already observed sources remain available.",
            )
            if item["action"] == "generate":
                item["generation"]["status"] = "cancelled"
                item["warnings"].append(
                    "Generation stopped; unresolved model charges remain reserved."
                )
            if item.get("retrieval"):
                item["retrieval"]["status"] = "cancelled"
            stop_access_projection(
                item,
                "The turn was cancelled before access lookup completed; no lookup was retried.",
            )

        await self._edit(
            conversation_id,
            turn_id,
            stop,
            "turn.cancelled",
        )
        await self._stop_children(conversation_id, turn_id)
        token = f"{conversation_id}:{turn_id}"
        task = self.tasks.get(token)
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return await self.get(conversation_id)
