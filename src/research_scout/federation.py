"""Deterministic paper identity and bounded, progressive DOI access enrichment.

Canonical papers are an application view over immutable provider observations.
No model creates identity relationships, no provider fields are blended and no
access URL is downloaded. Access operations use the conversation's durable grant
path; a saved intent is never automatically dispatched a second time.
"""

from __future__ import annotations

import asyncio
import copy
import math
import re
from typing import TYPE_CHECKING
from urllib.parse import unquote, urlsplit
from weakref import WeakValueDictionary

from .contracts import AccessObservation

if TYPE_CHECKING:
    from .core import Core

MAX_ACCESS_LOOKUPS = 12
TURN_RESEARCH_LIMIT = 24
PROVIDER_ORDER = (
    "openalex",
    "crossref",
    "arxiv",
    "europe_pmc",
    "openaire",
    "semantic_scholar",
    "datacite",
)


def normalize_doi(value: object) -> str | None:
    """Normalize only complete DOI identifiers or credential-free resolver URLs.

    This deliberately does not extract a DOI from prose, titles or arbitrary URLs.
    Query strings/fragments are not part of this supported DOI contract.
    """
    if not isinstance(value, str) or len(value) > 1500:
        return None
    candidate = value.strip()
    if re.match(r"^https?://", candidate, re.I):
        try:
            parsed = urlsplit(candidate)
            if (
                parsed.hostname not in {"doi.org", "dx.doi.org"}
                or parsed.username
                or parsed.password
                or parsed.port is not None
                or parsed.query
                or parsed.fragment
            ):
                return None
            candidate = parsed.path.removeprefix("/")
        except ValueError:
            return None
    else:
        candidate = re.sub(r"^doi:\s*", "", candidate, flags=re.I)
    candidate = unquote(candidate).strip().lower()
    if len(candidate) > 500 or not re.fullmatch(r"10\.\d{4,9}/[^\s?#\x00-\x1f\x7f]+", candidate):
        return None
    return candidate


def _identity(source: dict) -> tuple[str, str, str, str]:
    provider, reference = source.get("provider"), source.get("source_ref")
    run_id, version = source.get("run_id"), source.get("version")
    if (
        provider not in PROVIDER_ORDER
        or not isinstance(reference, str)
        or not reference.startswith(f"{provider}:")
        or reference == f"{provider}:"
        or reference != f"{provider}:{source.get('record_id')}"
        or not isinstance(run_id, str)
        or not isinstance(version, str)
        or not version
    ):
        raise ValueError("Canonical papers require attributable source/run/version identities.")
    return provider, reference, run_id, version


def _representative_order(source: dict) -> tuple:
    relevance = source.get("relevance") or {}
    label = relevance.get("label") if isinstance(relevance, dict) else None
    label_order = {"relevant": 0, None: 1, "partial": 2, "unknown": 3, "irrelevant": 4}
    abstract = source.get("abstract") or ""
    description = source.get("description") or ""
    content = abstract if isinstance(abstract, str) else ""
    supporting = description if isinstance(description, str) else ""
    score = relevance.get("score", 0) if isinstance(relevance, dict) else 0
    if type(score) not in {float, int} or not math.isfinite(score):
        score = 0
    return (
        label_order.get(label, 3),
        -bool(content.strip()),
        -bool(supporting.strip()),
        -min(len(content.strip()), 4000),
        -float(score),
        PROVIDER_ORDER.index(source["provider"]),
        source["source_ref"],
        source["run_id"],
        source["version"],
    )


def buildpapers(sources: list[dict], existingpapers: list[dict] | None = None) -> list[dict]:
    """Return canonical groups without changing or synthesizing source fields.

    Existing groups supply stable ordering and saved access state only. They do
    not resurrect removed/ineligible sources. Conflicting titles, years and
    content remain in their complete original observations for inspection.
    """
    previous = {paper["paper_id"]: paper for paper in existingpapers or []}
    groups: dict[str, dict] = {}
    identity_dois = {}
    for source in sources:
        identity = _identity(source)
        doi = normalize_doi(source.get("doi"))
        if identity in identity_dois and identity_dois[identity] != doi:
            raise ValueError(
                "One immutable source identity cannot assert different DOI relationships."
            )
        identity_dois[identity] = doi
        paper_id = f"doi:{doi}" if doi else f"source:{source['source_ref']}"
        group = groups.setdefault(paper_id, {"doi": doi, "observations": {}})
        earlier = group["observations"].get(identity)
        # Exact identity repeats are one observation; select a whole snapshot.
        if earlier is None or _representative_order(source) < _representative_order(earlier):
            group["observations"][identity] = source
    ordered = [paper_id for paper_id in previous if paper_id in groups]
    ordered.extend(paper_id for paper_id in groups if paper_id not in previous)
    papers = []
    for paper_id in ordered:
        group = groups[paper_id]
        observations = list(group["observations"].values())
        representative = min(observations, key=_representative_order)
        saved_access = previous.get(paper_id, {}).get("access")
        papers.append(
            {
                "paper_id": paper_id,
                "doi": group["doi"],
                "representative": copy.deepcopy(representative),
                "observations": copy.deepcopy(observations),
                "providers": sorted(
                    {item["provider"] for item in observations}, key=PROVIDER_ORDER.index
                ),
                "access": copy.deepcopy(saved_access)
                if saved_access
                else {"status": "queued"}
                if group["doi"]
                else {"status": "not_applicable", "reason": "No supported DOI was supplied."},
            }
        )
    return papers


def unique_evidence(sources: list[dict]) -> list[dict]:
    """One whole provider observation per canonical paper for optional writing."""
    return [paper["representative"] for paper in buildpapers(sources)]


def public_access(access: dict) -> dict:
    """Bound repeated SSE access metadata; the full observation stays private."""
    result = copy.deepcopy(access)
    observation = result.get("observation")
    if isinstance(observation, dict):
        locations = observation.get("oa_locations", [])
        observation["locations_omitted"] = observation.get("locations_omitted", 0) + max(
            0, len(locations) - 8
        )
        observation["oa_locations"] = locations[:8]
    return result


class Federation:
    def __init__(self, core: Core):
        self.core = core
        self._enrich_locks: WeakValueDictionary[tuple[str, str], asyncio.Lock] = (
            WeakValueDictionary()
        )

    async def refresh_turn(self, conversation_id: str, turn_id: str):
        def refresh(turn):
            turn["papers"] = buildpapers(turn["sources"], turn.get("papers"))

        return await self.core.conversations._edit(
            conversation_id, turn_id, refresh, "papers.available"
        )

    @staticmethod
    def _access_gate(turn: dict) -> str | None:
        plan = turn.get("source_plan")
        if not isinstance(plan, list):
            return None  # Older/manual snapshots have no readiness projection.
        access = next((item for item in plan if item.get("provider") == "unpaywall"), None)
        if access is None or access.get("status") != "enrichment":
            return "Unpaywall is unavailable or requires access configuration; no lookup was sent."
        return None

    @staticmethod
    def _used_or_held(turn: dict) -> int:
        return sum(
            operation.get("attempts", 0) + operation.get("hold", 0)
            for operation in turn.get("_operations", {}).values()
        )

    async def _publish_access(self, conversation_id, turn_id, paper_id, access):
        def publish(turn):
            paper = next(
                (paper for paper in turn.get("papers", []) if paper["paper_id"] == paper_id), None
            )
            if paper is not None:
                if access.get("observation"):
                    turn.setdefault("_access_observations", {})[paper_id] = copy.deepcopy(
                        access["observation"]
                    )
                paper["access"] = public_access(access)

        await self.core.conversations._edit(
            conversation_id, turn_id, publish, "paper.access.updated"
        )

    def _observation(self, payload: dict, doi: str) -> dict:
        mode = self.core.settings.provider_modes["unpaywall"]
        if payload.get("provider") != "unpaywall" or payload.get("mode") != mode:
            raise ValueError("Access envelope does not match its provider route.")
        observation = AccessObservation.model_validate(payload["access"]).model_dump()
        if normalize_doi(observation["doi"]) != doi or observation["mode"] != mode:
            raise ValueError("Access observation does not match its admitted DOI.")
        return observation

    @staticmethod
    def _failure(exception: Exception) -> dict:
        # Provider/transport text may include contact data: use fixed public reasons.
        response = getattr(exception, "response", None)
        status = getattr(response, "status_code", None)
        try:
            payload = response.json() if response is not None else {}
            code = payload.get("code") if isinstance(payload, dict) else None
        except (ValueError, AttributeError):
            code = None
        if status == 404 and code == "NOT_FOUND":
            return {
                "status": "not_found",
                "reason": "Unpaywall has no access observation for this DOI.",
            }
        if code in {"ACCESS_NOT_CONFIGURED", "CAPABILITY_UNAVAILABLE"}:
            return {
                "status": "blocked",
                "reason": "Unpaywall requires access configuration; no access data is available.",
            }
        if code == "ATTEMPT_LIMIT":
            return {
                "status": "deferred_budget",
                "reason": "The provider's bounded request allowance is exhausted.",
            }
        return {
            "status": "failed",
            "reason": "The DOI access lookup failed or returned an invalid observation; it was not retried.",
        }

    async def enrich_turn(self, conversation_id: str, turn_id: str):
        """Resolve at most twelve unique primary DOIs once, before turn completion.

        A persisted running intent, unknown operation outcome or terminal access
        state is never retried. Conversation admission remains the atomic budget
        authority, including grants held by uncertain research operations.
        """
        key = (conversation_id, turn_id)
        lock = self._enrich_locks.setdefault(key, asyncio.Lock())
        async with lock:
            await self.refresh_turn(conversation_id, turn_id)
            conversations = self.core.conversations
            turn = await conversations._turn(conversation_id, turn_id)
            if turn["status"] != "RUNNING":
                return
            blocked_reason = self._access_gate(turn)
            for initial in turn.get("papers", []):
                if initial["doi"] is None:
                    continue
                current = await conversations._turn(conversation_id, turn_id)
                if current["status"] != "RUNNING":
                    return
                paper = next(
                    (
                        paper
                        for paper in current.get("papers", [])
                        if paper["paper_id"] == initial["paper_id"]
                    ),
                    None,
                )
                if paper is None or paper["access"]["status"] != "queued":
                    continue
                doi, paper_id = paper["doi"], paper["paper_id"]
                intents = current.get("_federation_access", [])
                if blocked_reason:
                    access = {"status": "blocked", "reason": blocked_reason}
                elif doi in intents:
                    access = {
                        "status": "failed",
                        "reason": "A saved lookup intent already exists; its uncertain outcome was not retried.",
                    }
                elif (
                    len(intents) >= MAX_ACCESS_LOOKUPS
                    or self._used_or_held(current) >= TURN_RESEARCH_LIMIT
                ):
                    access = {
                        "status": "deferred_budget",
                        "reason": "Automatic access lookup is limited to 12 unique DOIs and the turn's remaining 24 research requests.",
                    }
                else:
                    access = None
                if access:
                    await self._publish_access(conversation_id, turn_id, paper_id, access)
                    continue
                admitted = False

                def admit(item, doi=doi, paper_id=paper_id):
                    nonlocal admitted
                    selected = next(
                        (
                            paper
                            for paper in item.get("papers", [])
                            if paper["paper_id"] == paper_id
                        ),
                        None,
                    )
                    saved_intents = item.setdefault("_federation_access", [])
                    if (
                        item["status"] != "RUNNING"
                        or selected is None
                        or selected["access"]["status"] != "queued"
                        or doi in saved_intents
                        or len(saved_intents) >= MAX_ACCESS_LOOKUPS
                        or self._used_or_held(item) >= TURN_RESEARCH_LIMIT
                    ):
                        return
                    saved_intents.append(doi)
                    selected["access"] = {"status": "running"}
                    admitted = True

                await conversations._edit(conversation_id, turn_id, admit, "paper.access.started")
                if not admitted:
                    latest = await conversations._turn(conversation_id, turn_id)
                    if latest["status"] != "RUNNING":
                        return
                    latest_paper = next(
                        (
                            paper
                            for paper in latest.get("papers", [])
                            if paper["paper_id"] == paper_id
                        ),
                        None,
                    )
                    if latest_paper is None or latest_paper["access"]["status"] != "queued":
                        continue
                    await self._publish_access(
                        conversation_id,
                        turn_id,
                        paper_id,
                        {
                            "status": "deferred_budget",
                            "reason": "The remaining research allowance was reserved before this lookup could start.",
                        },
                    )
                    continue
                try:
                    payload = await conversations._registry_call(
                        conversation_id, turn_id, "unpaywall", "access", doi
                    )
                    access = {"status": "succeeded", "observation": self._observation(payload, doi)}
                except asyncio.CancelledError:
                    raise
                except Exception as exception:  # noqa: BLE001 - one DOI cannot stop other papers
                    access = self._failure(exception)
                    if access["status"] == "blocked":
                        blocked_reason = access["reason"]
                await self._publish_access(conversation_id, turn_id, paper_id, access)
