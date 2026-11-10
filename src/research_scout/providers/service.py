"""One FastAPI application/process owns exactly one provider integration."""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from itertools import islice
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .adapters import LiveAdapter
from .fixtures import FixtureAdapter
from .journal import Journal, ProviderError, atomic_json
from .normalization import eligible, normalize_doi
from .oauth import access_status
from .upstream import DISCOVERY_PROVIDERS, LOCAL_POOL_PROVIDERS

PROVIDERS = (
    "openalex",
    "semantic_scholar",
    "crossref",
    "datacite",
    "arxiv",
    "openaire",
    "europe_pmc",
    "unpaywall",
)
CAPS = {
    "openalex": 8,
    "semantic_scholar": 8,
    "crossref": 6,
    "datacite": 3,
    "arxiv": 8,
    "openaire": 8,
    "europe_pmc": 8,
    "unpaywall": 12,
}


class Operation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: str = Field(min_length=1, max_length=200, pattern=r"^[\w.:-]+$")
    run_id: str = Field(min_length=1, max_length=200, pattern=r"^[\w.:-]+$")
    provider: str | None = None


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year_from: int | None = Field(default=None, ge=1000, le=3000)
    year_to: int | None = Field(default=None, ge=1000, le=3000)
    resource_type: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def ordered_years(self):
        if (
            self.year_from is not None
            and self.year_to is not None
            and self.year_from > self.year_to
        ):
            raise ValueError("year_from must not exceed year_to")
        return self


class Limits(BaseModel):
    model_config = ConfigDict(extra="forbid")
    per_branch: int = Field(default=10, ge=1, le=10)
    total: int = Field(default=20, ge=1, le=20)
    remaining_attempts: int = Field(default=8, ge=0, le=8)


class Search(Operation):
    query: str = Field(min_length=1, max_length=4000)
    lexical_query: str | None = Field(default=None, min_length=1, max_length=2000)
    semantic_query: str | None = Field(default=None, min_length=1, max_length=2000)
    filters: Filters = Field(default_factory=Filters)
    limits: Limits = Field(default_factory=Limits)


class Detail(Operation):
    record_id: str = Field(min_length=1, max_length=300)
    remaining_attempts: int = Field(default=1, ge=0, le=8)


class Metadata(Operation):
    doi: str = Field(min_length=3, max_length=300)
    remaining_attempts: int = Field(default=1, ge=0, le=8)


def error_body(error: ProviderError, provider: str, mode: str, attempts: int = 0) -> dict:
    return {
        "error": error.code,
        "code": error.code,
        "message": str(error),
        "provider": provider,
        "mode": mode,
        "attempts": attempts,
    }


def create_provider_app(
    provider: str,
    mode: Literal["fixture", "live"] = "fixture",
    *,
    state_dir=None,
    http_client=None,
    mcp_factory=None,
    encoder=None,
    encoder_status: str | None = None,
    fixture_delay: float = 0.85,
) -> FastAPI:
    if provider not in PROVIDERS or mode not in {"fixture", "live"}:
        raise ValueError("Choose one supported provider and fixture/live mode.")
    directory = (
        Path(state_dir or os.getenv("SCOUT_STATE_DIR", ".scout")) / "providers" / provider / mode
    )
    rate_limits = ()
    if mode == "live" and provider == "openaire":
        rate_limits = (
            (
                "authenticated-hour" if os.getenv("SCOUT_OPENAIRE_API_TOKEN") else "anonymous-hour",
                3600,
                7200 if os.getenv("SCOUT_OPENAIRE_API_TOKEN") else 60,
            ),
        )
    if mode == "live" and provider == "unpaywall":
        rate_limits = (("daily", 86400, 100_000),)
    journal = Journal(directory, CAPS[provider], rate_limits=rate_limits)
    adapter = (
        FixtureAdapter(provider, fixture_delay)
        if mode == "fixture"
        else LiveAdapter(provider, http_client, mcp_factory, encoder)
    )
    if isinstance(adapter, LiveAdapter):
        adapter.cache = journal

    @asynccontextmanager
    async def lifespan(_app):
        journal.acquire_writer()
        try:
            yield
        finally:
            journal.close()

    app = FastAPI(title=f"Research Scout {provider} provider", version="0.1.0", lifespan=lifespan)
    app.state.provider, app.state.mode, app.state.journal, app.state.adapter = (
        provider,
        mode,
        journal,
        adapter,
    )

    @app.exception_handler(ProviderError)
    async def provider_error_handler(_request, error):
        return JSONResponse(error_body(error, provider, mode), status_code=error.status)

    def scope(request: Operation):
        if request.provider is not None and request.provider != provider:
            raise ProviderError(
                "PROVIDER_SCOPE",
                "This service owns a different provider; no fallback was attempted.",
                400,
            )
        value = request.model_dump()
        value.update(provider=provider, mode=mode)
        return value

    @app.get("/health")
    async def health():
        discovery = provider in DISCOVERY_PROVIDERS
        access = access_status() if provider == "openalex" and mode == "live" else {}
        configured = (
            mode == "fixture"
            or provider != "openalex"
            or bool(access.get("configured") or mcp_factory)
        )
        if mode == "live" and provider == "unpaywall":
            configured = bool(adapter.unpaywall_email())
        verified = isinstance(adapter, LiveAdapter) and bool(adapter.last_verified_at)
        blocked_reason = None
        if not configured:
            blocked_reason = (
                "Configure a real SCOUT_UNPAYWALL_EMAIL before access lookup."
                if provider == "unpaywall"
                else "Run scripts/connect_openalex.py to authorize the official MCP."
            )
        elif provider in LOCAL_POOL_PROVIDERS and mode == "live" and encoder is None:
            blocked_reason = "Semantic reranking needs a configured compatible local encoder; lexical search remains available."
        return {
            "status": "ok",
            "provider": provider,
            "mode": mode,
            "fixture": mode == "fixture",
            "capabilities": {
                "search": discovery,
                "lexical": discovery,
                "semantic": discovery
                and (mode == "fixture" or provider == "openalex" or encoder is not None),
                "details": discovery,
                "agency": provider == "crossref",
                "metadata": provider in {"crossref", "datacite"},
                "access": provider == "unpaywall",
            },
            "access_configured": configured,
            "readiness": "fixture"
            if mode == "fixture"
            else "needs_access"
            if not configured
            else "verified"
            if verified
            else "configured_unverified",
            "access_method": "fixture"
            if mode == "fixture"
            else access.get("method")
            if provider == "openalex"
            else "api_key"
            if provider == "semantic_scholar" and os.getenv("SCOUT_SEMANTIC_SCHOLAR_API_KEY")
            else "contact_email"
            if provider == "unpaywall" and configured
            else "bearer_token"
            if provider == "openaire" and os.getenv("SCOUT_OPENAIRE_API_TOKEN")
            else "public_anonymous",
            "key_recommended": mode == "live"
            and provider == "semantic_scholar"
            and not bool(os.getenv("SCOUT_SEMANTIC_SCHOLAR_API_KEY")),
            "blocked_reason": blocked_reason,
            "encoder_status": "not_applicable"
            if provider not in LOCAL_POOL_PROVIDERS
            else "authored_fixture"
            if mode == "fixture"
            else "configured_local"
            if encoder is not None
            else encoder_status or "ENCODER_NOT_CONFIGURED",
            "upstream_url": adapter.base_url if isinstance(adapter, LiveAdapter) else None,
            "last_verified_at": adapter.last_verified_at
            if isinstance(adapter, LiveAdapter)
            else None,
            "verified_capabilities": sorted(adapter.verified_capabilities)
            if isinstance(adapter, LiveAdapter)
            else [],
            "last_error": adapter.last_error if isinstance(adapter, LiveAdapter) else None,
            "capability_status": "authored_fixture"
            if mode == "fixture"
            else "partially_verified"
            if verified
            else "runtime_proof_required",
            "semantic_execution": "authored_fixture_not_model"
            if mode == "fixture"
            else "provider_native"
            if provider == "openalex"
            else "local_candidate_pool"
            if encoder
            else "unavailable",
            "run_attempt_cap": CAPS[provider],
        }

    @app.get("/operations/{operation_id}")
    async def operation_status(operation_id: str):
        saved = journal.read("operations", operation_id)
        if saved is None:
            raise HTTPException(404, "Unknown operation")
        return {k: v for k, v in saved.items() if k != "fingerprint"}

    @app.post("/operations/search")
    async def search(request: Search):
        value = scope(request)
        if provider not in DISCOVERY_PROVIDERS:
            raise ProviderError(
                "CAPABILITY_UNAVAILABLE",
                "This provider does not own a discovery capability.",
                400,
            )
        if not request.query.strip():
            raise ProviderError("INVALID_QUERY", "A nonempty query is required.", 422)
        if request.limits.total < request.limits.per_branch * 2 and provider == "openalex":
            raise ProviderError(
                "UNION_LIMIT", "Native hybrid union must accommodate both raw branch sets.", 422
            )
        receipt, replay = await journal.begin(value, "search")

        async def events():
            if replay:
                for event in receipt["events"]:
                    yield json.dumps({**event, "replayed": True}) + "\n"
                return
            queue: asyncio.Queue = asyncio.Queue(maxsize=48)
            outcomes: dict[str, dict] = {}
            unique = set()
            allowance = request.limits.remaining_attempts

            async def reserve():
                await journal.attempt(receipt, allowance)

            async def reserve_embedding(texts):
                await journal.embedding(receipt, texts)

            async def branch_work(branch):
                await queue.put({"kind": "branch.started", "branch": branch})
                try:
                    if allowance <= 0:
                        raise ProviderError(
                            "ATTEMPT_LIMIT",
                            "No operation grant remains; no provider connection was started.",
                            429,
                        )
                    if mode == "fixture":
                        await reserve()
                        rows, provenance = await adapter.search(branch, value)
                    else:
                        rows, provenance = await adapter.search(
                            branch, value, reserve, reserve_embedding
                        )
                    raw_count, retained, invalid_count = 0, 0, 0
                    raw_limit = (
                        request.limits.per_branch
                        if provider == "openalex" or mode == "fixture"
                        else request.limits.total
                    )
                    for rank, record in enumerate(islice(rows, raw_limit), 1):
                        raw_count += 1
                        if "normalization_error" in record:
                            invalid_count += 1
                            continue
                        if not eligible(record, value["filters"]):
                            continue
                        key = record["record_id"]
                        if key not in unique and len(unique) >= request.limits.total:
                            continue
                        unique.add(key)
                        record = {
                            **record,
                            "branch_ranks": {branch: rank},
                            "branch": branch,
                            "query_provenance": provenance,
                            "filter_status": "pass",
                            "requested_filters": value["filters"],
                        }
                        await queue.put(
                            {"kind": "source", "branch": branch, "rank": rank, "record": record}
                        )
                        retained += 1
                        await asyncio.sleep(0)
                    outcome = {
                        "kind": "branch.completed",
                        "branch": branch,
                        "raw_count": raw_count,
                        "count": retained,
                        "filtered_count": raw_count - retained - invalid_count,
                        "invalid_count": invalid_count,
                        "provenance": provenance,
                    }
                except asyncio.CancelledError:
                    raise
                except Exception as error:  # noqa: BLE001 - sanitize arbitrary SDK/plugin errors at the service boundary
                    if not isinstance(error, ProviderError):
                        error = ProviderError(
                            "PROVIDER_ERROR",
                            "Selected branch failed; no substitute provider was queried.",
                        )
                    outcome = {
                        "kind": "branch.failed",
                        "branch": branch,
                        **error_body(error, provider, mode),
                    }
                outcomes[branch] = outcome
                await queue.put(outcome)
                await queue.put(None)

            tasks = [asyncio.create_task(branch_work(branch)) for branch in ("lexical", "semantic")]
            finished = 0
            try:
                while finished < 2:
                    event = await queue.get()
                    if event is None:
                        finished += 1
                        continue
                    event = {
                        **event,
                        "provider": provider,
                        "mode": mode,
                        "operation_id": request.operation_id,
                        "run_id": request.run_id,
                    }
                    await journal.append(receipt, event)
                    yield json.dumps(event, ensure_ascii=False, allow_nan=False) + "\n"
                failed = sum(
                    o["kind"] == "branch.failed" or o.get("invalid_count", 0)
                    for o in outcomes.values()
                )
                status = (
                    "partial"
                    if failed and unique
                    else "failed"
                    if failed
                    else "succeeded"
                    if unique
                    else "empty"
                )
                for event in (
                    {
                        "kind": "usage",
                        "attempts": receipt["attempts"],
                        "embedding_batches": receipt.get("embedding_batches", 0),
                        "embedding_texts": receipt.get("embedding_texts", 0),
                        "provider_internal_attempts": "unknown"
                        if mode == "live" and provider == "openalex"
                        else None,
                    },
                    {
                        "kind": "complete",
                        "status": status,
                        "count": len(unique),
                        "attempts": receipt["attempts"],
                    },
                ):
                    event.update(
                        provider=provider,
                        mode=mode,
                        operation_id=request.operation_id,
                        run_id=request.run_id,
                    )
                    await journal.append(receipt, event)
                    if event["kind"] == "complete":
                        await journal.finish(receipt)
                    yield json.dumps(event) + "\n"
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                if receipt["status"] != "complete":
                    await journal.finish(receipt, interrupted=True)
                if isinstance(adapter, LiveAdapter):
                    adapter.pools.pop(request.operation_id, None)

        return StreamingResponse(
            events(),
            media_type="application/x-ndjson",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    async def singleton(request, kind):
        value = scope(request)
        if (
            (kind == "agency" and provider != "crossref")
            or (kind == "metadata" and provider not in {"crossref", "datacite"})
            or (kind == "details" and provider not in DISCOVERY_PROVIDERS)
            or (kind == "access" and provider != "unpaywall")
        ):
            raise ProviderError(
                "CAPABILITY_UNAVAILABLE", "Operation is not owned by this provider service.", 400
            )
        if kind != "details":
            value["doi"] = normalize_doi(value["doi"])
        else:
            value["record_id"] = value["record_id"].removeprefix(f"{provider}:")
        receipt, replay = await journal.begin(value, kind)
        if replay:
            result = {**receipt["result"], "replayed": True}
            return JSONResponse(result, status_code=result.pop("http_status", 200))
        cache_key = f"{mode}:{kind}:{value.get('record_id') or value.get('doi')}"
        saved = journal.read("cache", cache_key)
        if saved and kind == "access":
            timestamp = saved.get("cache_observed_at") or (saved.get("access") or {}).get(
                "observed_at"
            )
            try:
                age = (datetime.now(UTC) - datetime.fromisoformat(timestamp)).total_seconds()
            except (ValueError, TypeError):
                age = 86400
            if not 0 <= age < 86400:
                saved = None
        if saved:
            result = {**saved, "attempts": 0, "cached": True, "mode": mode, "provider": provider}
            await journal.finish(receipt, result)
            return result

        async def reserve():
            await journal.attempt(receipt, request.remaining_attempts)

        try:
            if request.remaining_attempts <= 0:
                raise ProviderError(
                    "ATTEMPT_LIMIT",
                    "No operation grant remains; no provider connection was started.",
                    429,
                )
            method = getattr(adapter, kind)
            identity = value.get("record_id") or value["doi"]
            if mode == "fixture":
                await reserve()
                observed = await method(identity)
            else:
                observed = await method(identity, reserve)
            result = {
                "agency"
                if kind == "agency"
                else "access"
                if kind == "access"
                else "record": observed,
                "attempts": receipt["attempts"],
                "mode": mode,
                "provider": provider,
                "cached": False,
            }
            if kind == "access":
                result.update(cache_observed_at=observed["observed_at"], cache_ttl_seconds=86400)
            atomic_json(journal.path("cache", cache_key), result)
            await journal.finish(receipt, result)
            return result
        except asyncio.CancelledError:
            await journal.finish(receipt, interrupted=True)
            raise
        except Exception as error:  # noqa: BLE001 - never leak transport/credential exception text
            if not isinstance(error, ProviderError):
                error = ProviderError(
                    "PROVIDER_ERROR",
                    "Selected provider operation failed; no fallback was attempted.",
                )
            result = {
                **error_body(error, provider, mode, receipt["attempts"]),
                "http_status": error.status,
            }
            await journal.finish(receipt, result)
            return JSONResponse(
                {k: v for k, v in result.items() if k != "http_status"}, status_code=error.status
            )

    @app.post("/operations/details")
    async def details(request: Detail):
        return await singleton(request, "details")

    @app.post("/operations/agency")
    async def agency(request: Metadata):
        return await singleton(request, "agency")

    @app.post("/operations/metadata")
    async def metadata(request: Metadata):
        return await singleton(request, "metadata")

    @app.post("/operations/access")
    async def access(request: Metadata):
        return await singleton(request, "access")

    return app
