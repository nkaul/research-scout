"""Live, read-only integrations. No retries or provider/transport fallback.

Primary references checked 2026-10-26:
https://help.openalex.org/access/connector/
https://github.com/ourresearch/openalex-mcp-server/blob/main/src/server.ts
https://www.crossref.org/documentation/retrieve-metadata/rest-api/
https://support.datacite.org/docs/api-get-doi
https://api.semanticscholar.org/api-docs/
"""

import asyncio
import hashlib
import json
import math
import os
import re
import time
from contextlib import nullcontext
from datetime import UTC, datetime
from urllib.parse import quote

import httpx

from . import rest_discovery
from .journal import ProviderError, atomic_json
from .normalization import (
    crossref_record,
    datacite_record,
    openalex_record,
    semantic_scholar_record,
    unpaywall_access,
)
from .oauth import openalex_session
from .upstream import LOCAL_POOL_PROVIDERS, check_request_origin, upstream_url


def normalized_rows(rows, normalizer):
    """Normalize lazily so a malformed/later item cannot hide an earlier valid one."""
    for raw in rows:
        try:
            if not isinstance(raw, dict):
                raise ProviderError("INVALID_RECORD", "Expected a provider record object.")
            yield normalizer(raw)
        except (ProviderError, TypeError, ValueError, AttributeError):
            yield {"normalization_error": "INVALID_RECORD"}


def local_semantic_scores(encoder, query: str, texts: list[str]) -> tuple[list[float], dict]:
    """Validate one configured query/document embedding space and compute cosine."""
    configuration = dict(encoder.configuration)
    required = ("model", "revision", "dimensions", "query_mode", "document_mode", "similarity")
    if (
        any(not configuration.get(key) for key in required)
        or configuration["similarity"] != "cosine"
    ):
        raise ProviderError(
            "ENCODER_CONFIGURATION",
            "A versioned compatible query/document encoder configuration is required.",
            503,
        )
    dimension = configuration["dimensions"]
    if not isinstance(dimension, int) or not 1 <= dimension <= 8192:
        raise ProviderError(
            "ENCODER_CONFIGURATION",
            "Configured encoder dimensions exceed the bounded local path.",
            503,
        )
    query_vector = encoder.encode_query(query)
    document_vectors = encoder.encode_documents(texts)
    if len(document_vectors) != len(texts) or dict(encoder.configuration) != configuration:
        raise ProviderError(
            "ENCODER_INVALID",
            "Encoder configuration or document cardinality changed during encoding.",
        )

    def unit(vector):
        if len(vector) != dimension or any(
            not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v)
            for v in vector
        ):
            raise ProviderError(
                "ENCODER_INVALID", "Query/document vectors must have finite compatible dimensions."
            )
        length = math.sqrt(sum(v * v for v in vector))
        if not length or not math.isfinite(length):
            raise ProviderError(
                "ENCODER_INVALID", "Zero or nonfinite vectors cannot receive a semantic score."
            )
        return [v / length for v in vector]

    normalized_query = unit(query_vector)
    scores = [
        sum(q * d for q, d in zip(normalized_query, unit(vector), strict=True))
        for vector in document_vectors
    ]
    if hasattr(encoder, "input_scope"):
        configuration["input_scope"] = dict(encoder.input_scope)
    return scores, configuration


native_mcp_session = openalex_session


def mcp_payload(result) -> dict:
    if getattr(result, "isError", False) or getattr(result, "is_error", False):
        raise ProviderError(
            "UPSTREAM_TOOL_ERROR", "OpenAlex returned a tool error; no fallback was attempted."
        )
    structured = getattr(result, "structuredContent", None) or getattr(
        result, "structured_content", None
    )
    if isinstance(structured, dict):
        return structured
    for block in getattr(result, "content", []):
        text = getattr(block, "text", None)
        if text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
    raise ProviderError(
        "UPSTREAM_SCHEMA", "OpenAlex did not return a structured JSON record/result."
    )


class LiveAdapter:
    def __init__(self, provider: str, http_client=None, mcp_factory=None, encoder=None):
        self.provider, self.http_client = provider, http_client
        self.mcp_factory = mcp_factory or native_mcp_session
        self.encoder = encoder
        self.cache = None
        self.base_url = upstream_url(provider)
        self.pools: dict[str, asyncio.Future] = {}
        self.control_requests = 0
        self.semantic_lock = asyncio.Lock()
        self.last_semantic_attempt = 0.0
        self.request_lock = asyncio.Lock()
        self.connection_lock = asyncio.Lock()
        self.request_interval = {
            "arxiv": 3.0,
            "openaire": 0.2,
            "europe_pmc": 1.0,
            "unpaywall": 1.0,
            "semantic_scholar": 1.0,
            "crossref": 1.0,
        }.get(provider, 0.0)
        self.last_request_at = 0.0
        self.cooldown_until = 0.0
        self.last_verified_at: str | None = None
        self.verified_capabilities: set[str] = set()
        self.last_error: str | None = None

    def verified(self, capability: str):
        self.last_verified_at = datetime.now(UTC).isoformat()
        self.verified_capabilities.add(capability)
        self.last_error = None

    async def admit_rest(self):
        if not self.request_interval:
            return
        # Shared pacing covers search and details, not one independent limiter per route.
        async with self.request_lock:
            now = time.monotonic()
            if now < self.cooldown_until:
                raise ProviderError(
                    "UPSTREAM_COOLDOWN",
                    "The provider cooldown is active; retry explicitly later.",
                    429,
                )
            await asyncio.sleep(max(0, self.request_interval - (now - self.last_request_at)))
            self.last_request_at = time.monotonic()

    def needs_attempt(self, branch: str) -> bool:
        return self.provider == "openalex" or branch == "lexical"

    async def http_get(
        self, url: str, params: dict | None = None, before_call=None, *, response_format="json"
    ):
        async with self.connection_lock if self.provider == "arxiv" else nullcontext():
            return await self._http_get(url, params, before_call, response_format=response_format)

    async def _http_get(self, url: str, params: dict | None, before_call, *, response_format):
        check_request_origin(self.provider, url)
        await self.admit_rest()
        if before_call:
            await before_call()
        headers = {"User-Agent": "ResearchScout/0.1 (read-only scholarly research)"}
        if self.provider == "semantic_scholar" and os.getenv("SCOUT_SEMANTIC_SCHOLAR_API_KEY"):
            headers["x-api-key"] = os.environ["SCOUT_SEMANTIC_SCHOLAR_API_KEY"]
        if self.provider == "openaire" and os.getenv("SCOUT_OPENAIRE_API_TOKEN"):
            headers["Authorization"] = "Bearer " + os.environ["SCOUT_OPENAIRE_API_TOKEN"]
        contact = os.getenv("SCOUT_CONTACT_EMAIL")
        if self.provider == "crossref" and contact:
            headers["User-Agent"] = f"ResearchScout/0.1 (mailto:{contact})"
        try:
            if self.http_client is not None:
                response = await self.http_client.get(
                    url, params=params, headers=headers, follow_redirects=False
                )
            else:
                async with httpx.AsyncClient(
                    timeout=25,
                    follow_redirects=False,
                    transport=httpx.AsyncHTTPTransport(retries=0),
                    trust_env=False,
                ) as client:
                    response = await client.get(url, params=params, headers=headers)
            if response.status_code == 404:
                raise ProviderError(
                    "NOT_FOUND", "No record was returned by the selected provider.", 404
                )
            if response.status_code in (401, 403):
                raise ProviderError(
                    "ACCESS_UNAVAILABLE", "Selected provider access is unavailable.", 503
                )
            if response.status_code == 429:
                try:
                    cooldown = max(1.0, min(300.0, float(response.headers.get("Retry-After", "1"))))
                except ValueError:
                    cooldown = 1.0
                self.cooldown_until = time.monotonic() + cooldown
                raise ProviderError(
                    "UPSTREAM_RATE_LIMIT",
                    "Selected provider rate limit reached; no automatic retry.",
                    429,
                )
            response.raise_for_status()
            if len(response.content) > 4_000_000:
                raise ProviderError(
                    "RESPONSE_LIMIT", "Provider response exceeds the configured response bound."
                )
            if response_format == "atom":
                return response.text
            payload = response.json()
            if not isinstance(payload, dict):
                raise ProviderError(
                    "UPSTREAM_SCHEMA", "Expected an object from the selected provider."
                )
            return payload
        except ProviderError as error:
            self.last_error = error.code
            raise
        except (httpx.HTTPError, ValueError) as error:
            self.last_error = "UPSTREAM_UNAVAILABLE"
            raise ProviderError(
                "UPSTREAM_UNAVAILABLE",
                "Selected provider request failed; saved records remain available.",
            ) from error

    async def mcp_call(
        self, tool_name: str, arguments: dict, before_call=None
    ) -> tuple[dict, dict]:
        try:
            async with self.mcp_factory() as session:
                tools = await session.list_tools()
                self.control_requests += 1
                selected = next((tool for tool in tools.tools if tool.name == tool_name), None)
                if selected is None or tool_name not in {"search_works", "get_work"}:
                    raise ProviderError(
                        "CAPABILITY_UNAVAILABLE",
                        "The required read-only OpenAlex tool is unavailable.",
                        503,
                    )
                schema = selected.inputSchema
                properties = schema.get("properties", {})
                if any(name not in properties for name in arguments) or any(
                    name not in arguments for name in schema.get("required", [])
                ):
                    raise ProviderError(
                        "CAPABILITY_SCHEMA",
                        "OpenAlex tool arguments differ from the checked contract.",
                        503,
                    )
                if tool_name == "search_works":
                    allowed_modes = properties.get("mode", {}).get("enum", [])
                    if arguments["mode"] not in allowed_modes:
                        raise ProviderError(
                            "CAPABILITY_SCHEMA",
                            "The requested native OpenAlex mode is not advertised.",
                            503,
                        )
                for key, value in arguments.items():
                    specification = properties[key]
                    if (
                        isinstance(value, (int, float))
                        and not isinstance(value, bool)
                        and (
                            value < specification.get("minimum", -math.inf)
                            or value > specification.get("maximum", math.inf)
                        )
                    ):
                        raise ProviderError(
                            "CAPABILITY_SCHEMA",
                            "A requested value is outside the provider's advertised bounds.",
                            422,
                        )
                    if isinstance(value, list):
                        choices = specification.get("items", {}).get("enum")
                        if choices and any(item not in choices for item in value):
                            raise ProviderError(
                                "CAPABILITY_SCHEMA",
                                "A requested filter value is not advertised by the provider.",
                                422,
                            )
                if before_call:
                    await before_call()
                result = await session.call_tool(tool_name, arguments)
                payload = mcp_payload(result)
                provenance = {
                    "transport": "official_mcp",
                    "tool": tool_name,
                    "tool_schema_hash": hashlib.sha256(
                        json.dumps(schema, sort_keys=True).encode()
                    ).hexdigest(),
                    "executed_arguments": arguments,
                    "canonical_oql": payload.get("canonical_oql") or payload.get("oql"),
                    "reproduce_url": payload.get("reproduce_url"),
                    "provider_usage": payload.get("usage"),
                    "provider_internal_attempts": "unknown",
                }
                self.verified("details" if tool_name == "get_work" else arguments["mode"])
                return payload, provenance
        except ProviderError as error:
            self.last_error = error.code
            raise
        except Exception as error:
            # SDK/network exception text can contain transport/header data. Never export it.
            pending = [error]
            while pending:
                nested = pending.pop()
                if isinstance(nested, ProviderError):
                    self.last_error = nested.code
                    raise nested from None
                pending.extend(getattr(nested, "exceptions", ()))
            self.last_error = "MCP_UNAVAILABLE"
            raise ProviderError(
                "MCP_UNAVAILABLE",
                "OpenAlex MCP connection failed; check OAuth/client configuration. No transport fallback was attempted.",
                503,
            ) from error

    async def search(
        self, branch: str, request: dict, before_call=None, before_embedding=None
    ) -> tuple[list[dict], dict]:
        if self.provider == "openalex":
            arguments = {
                "query": request.get(f"{branch}_query") or request["query"],
                "mode": "keyword" if branch == "lexical" else "semantic",
                "limit": request["limits"]["per_branch"],
                "rerank": False,
            }
            if len(arguments["query"]) > 2000:
                raise ProviderError(
                    "QUERY_LIMIT",
                    "Native OpenAlex query text is limited to 2,000 characters; it was not silently truncated.",
                    422,
                )
            filters = request["filters"]
            for local, remote in (("year_from", "from_year"), ("year_to", "to_year")):
                if filters.get(local) is not None:
                    arguments[remote] = filters[local]
            if filters.get("resource_type"):
                arguments["types"] = [filters["resource_type"]]

            async def semantic_admission():
                async with self.semantic_lock:
                    await asyncio.sleep(
                        max(0, 1.0 - (time.monotonic() - self.last_semantic_attempt))
                    )
                    if before_call:
                        await before_call()
                    self.last_semantic_attempt = time.monotonic()

            payload, provenance = await self.mcp_call(
                "search_works",
                arguments,
                semantic_admission if branch == "semantic" else before_call,
            )
            rows = payload.get("results")
            if not isinstance(rows, list):
                raise ProviderError("UPSTREAM_SCHEMA", "OpenAlex search lacks a results array.")
            return normalized_rows(
                rows[: request["limits"]["per_branch"]], openalex_record
            ), provenance
        if self.provider not in LOCAL_POOL_PROVIDERS:
            raise ProviderError(
                "CAPABILITY_UNAVAILABLE", "This registry service does not support discovery.", 400
            )
        future = self.pools.setdefault(
            request["operation_id"], asyncio.get_running_loop().create_future()
        )
        if branch == "semantic":
            if self.encoder is None:
                raise ProviderError(
                    "SEMANTIC_UNAVAILABLE",
                    "No compatible local encoder is configured; relevance search is not native vector search.",
                    503,
                )
            try:
                records = await asyncio.shield(future)
            except asyncio.CancelledError:
                if future.cancelled():
                    raise ProviderError(
                        "CANDIDATE_POOL_UNAVAILABLE",
                        "The selected provider's lexical pool failed; no local semantic reranking can run.",
                    ) from None
                raise
            texts = [
                (r.get("title") or "") + "\n" + (r.get("abstract") or r.get("description") or "")
                for r in records
            ]
            if any(len(text) > 12000 for text in texts):
                raise ProviderError(
                    "ENCODER_INPUT_LIMIT", "Metadata exceeds the bounded local encoder input.", 422
                )
            if before_embedding:
                await before_embedding(len(texts) + 1)
            try:
                scores, configuration = await asyncio.wait_for(
                    asyncio.to_thread(
                        local_semantic_scores,
                        self.encoder,
                        request.get("semantic_query") or request["query"],
                        texts,
                    ),
                    timeout=20,
                )
            except TimeoutError as error:
                raise ProviderError(
                    "ENCODER_TIMEOUT",
                    "Local encoding exceeded its 20-second result-admission deadline; late output is discarded.",
                ) from error
            ranked = [
                records[i]
                for i in sorted(
                    range(len(records)), key=lambda i: (-scores[i], records[i]["record_id"])
                )
            ]
            self.verified("semantic")
            return ranked, {
                "semantic_execution": "local_candidate_pool_rerank",
                "scope": "fetched_lexical_pool_only",
                "encoder": configuration,
                "embedding_batches": 2,
                "embedding_texts": len(texts) + 1,
            }
        try:
            pool_limit = min(20, request["limits"]["total"])
            cache_key = (
                "lexical-pool-v1:"
                + hashlib.sha256(
                    json.dumps(
                        {
                            "provider": self.provider,
                            "upstream": self.base_url,
                            "query": request.get("lexical_query") or request["query"],
                            "filters": request["filters"],
                            "limit": pool_limit,
                            **(
                                {"query_policy": rest_discovery.CROSSREF_QUERY_POLICY}
                                if self.provider == "crossref"
                                else {}
                            ),
                        },
                        sort_keys=True,
                    ).encode()
                ).hexdigest()
            )
            cached = self.cache.read("cache", cache_key) if self.cache else None
            if cached:
                # Explicit new operations may reuse a recent pool; saved operation
                # replay is owned by Journal and is independent of this TTL.
                age = (
                    datetime.now(UTC) - datetime.fromisoformat(cached["observed_at"])
                ).total_seconds()
                ttl = 86400 if self.provider == "arxiv" else 900
                if not 0 <= age < ttl:
                    cached = None
            if cached:
                rows = cached["records"]

                def normalizer(record):
                    return record

                provenance = {
                    **cached["provenance"],
                    "cached_pool": True,
                    "cache_observed_at": cached["observed_at"],
                }
            elif self.provider != "semantic_scholar":
                raw_rows, normalizer, provenance = await rest_discovery.lexical_page(
                    self,
                    request.get("lexical_query") or request["query"],
                    pool_limit,
                    before_call,
                    request["filters"],
                )
                rows = raw_rows[:pool_limit]
            else:
                params = {
                    "query": request.get("lexical_query") or request["query"],
                    "limit": pool_limit,
                    "fields": "paperId,title,authors,year,venue,externalIds,url,abstract,publicationTypes",
                }
                data = await self.http_get(self.base_url + "/paper/search", params, before_call)
                rows = data.get("data")
                if not isinstance(rows, list):
                    raise ProviderError(
                        "UPSTREAM_SCHEMA", "Semantic Scholar search lacks a data array."
                    )
                rows = rows[:pool_limit]
                normalizer = semantic_scholar_record
                provenance = {
                    "transport": "official_rest",
                    "executed_arguments": params,
                    "filters": "deterministic_metadata_postfilter",
                    "semantic_scope": "lexical_candidate_pool",
                    "page_count": 1,
                    "pagination": "bounded_first_page_no_automatic_followup",
                }
            if not cached:
                self.verified("lexical")

            def publish_pool():
                records = []
                invalid = False
                published = False

                def finish_pool():
                    nonlocal published
                    if published:
                        return
                    published = True
                    if not future.done():
                        future.set_result(records)
                    if self.cache and not cached and not invalid:
                        atomic_json(
                            self.cache.path("cache", cache_key),
                            {
                                "records": records,
                                "provenance": provenance,
                                "observed_at": datetime.now(UTC).isoformat(),
                            },
                        )

                raw_pool = rows[:pool_limit]
                for index, record in enumerate(normalized_rows(raw_pool, normalizer)):
                    if "normalization_error" not in record:
                        records.append(record)
                    else:
                        invalid = True
                    if index == len(raw_pool) - 1:
                        finish_pool()
                    yield record
                finish_pool()

            return publish_pool(), provenance
        except BaseException:
            if not future.done():
                future.cancel()
            raise

    async def details(self, record_id: str, before_call=None) -> dict:
        if self.provider == "openalex":
            payload, _ = await self.mcp_call("get_work", {"id": record_id}, before_call)
            return openalex_record(payload)
        if self.provider == "semantic_scholar":
            data = await self.http_get(
                f"{self.base_url}/paper/{quote(record_id, safe='')}",
                {
                    "fields": "paperId,title,authors,year,venue,externalIds,url,abstract,publicationTypes"
                },
                before_call,
            )
            record = semantic_scholar_record(data)
            self.verified("details")
            return record
        if self.provider in {"crossref", "arxiv", "openaire", "europe_pmc"}:
            record = await rest_discovery.details(self, record_id, before_call)
            self.verified("details")
            return record
        raise ProviderError(
            "CAPABILITY_UNAVAILABLE", "Details belong to the originating discovery service.", 400
        )

    async def agency(self, doi: str, before_call=None) -> str | None:
        data = await self.http_get(
            f"{self.base_url}/works/{quote(doi, safe='/')}/agency", before_call=before_call
        )
        agency = (data.get("message") or {}).get("agency", {}).get("id")
        if not isinstance(agency, str) or not agency:
            raise ProviderError("UPSTREAM_SCHEMA", "Crossref response lacks an agency identifier.")
        self.verified("agency")
        return agency

    async def metadata(self, doi: str, before_call=None) -> dict:
        if self.provider == "crossref":
            data = await self.http_get(
                f"{self.base_url}/works/{quote(doi, safe='/')}", before_call=before_call
            )
            record = crossref_record(data.get("message", {}))
        else:
            data = await self.http_get(
                f"{self.base_url}/dois/{quote(doi, safe='/')}", before_call=before_call
            )
            record = datacite_record(data.get("data", {}))
        self.verified("metadata")
        return record

    @staticmethod
    def unpaywall_email():
        email = os.getenv("SCOUT_UNPAYWALL_EMAIL", "").strip()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or email.rsplit("@", 1)[
            -1
        ].lower() in {"example.com", "example.org", "example.net"}:
            return None
        return email

    async def access(self, doi: str, before_call=None):
        if self.provider != "unpaywall":
            raise ProviderError(
                "CAPABILITY_UNAVAILABLE", "This provider does not own OA access lookup.", 400
            )
        email = self.unpaywall_email()
        if not email:
            raise ProviderError(
                "ACCESS_NOT_CONFIGURED",
                "Configure a real SCOUT_UNPAYWALL_EMAIL before lookup.",
                503,
            )
        data = await self.http_get(
            self.base_url + "/" + quote(doi, safe="/"), {"email": email}, before_call
        )
        observed = unpaywall_access(data, doi)
        self.verified("access")
        return observed
