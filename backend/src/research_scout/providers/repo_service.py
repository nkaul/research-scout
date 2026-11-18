"""Isolated public GitHub metadata/README provider; fixed endpoints, no clones."""

from __future__ import annotations

import argparse
import asyncio
import base64
import copy
import hashlib
import json
import os
import re
import time
from contextlib import asynccontextmanager
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from ..contracts import fingerprint, now
from ..paths import repository_path
from ..repo_contracts import MAX_READMES, MAX_REPO_REQUESTS, RepoOperationRequest
from ..repo_evidence import (
    MAX_README_BYTES,
    PARSER_POLICY,
    github_query,
    normalize_repository,
    rank_repositories,
    selected_readme_evidence,
    version_repository,
)
from ..repo_reading import promote_source, readable_source
from .journal import Journal, ProviderError, atomic_json

API = "https://api.github.com"
API_VERSION = "2026-03-10"
CACHE_POLICY = "public-github-normalized-reader-v2"
HTTP_DEADLINE_SECONDS = 20


class GitHubError(ProviderError):
    def __init__(self, code, message, status=502, retry_after=None):
        super().__init__(code, message, status)
        self.retry_after = retry_after


class PublicGitHub:
    def __init__(self, journal, receipt, request, *, client, token=None):
        self.journal, self.receipt, self.request = journal, receipt, request
        self.client, self.token = client, token
        self.search_attempts = 0
        self.readme_attempts = 0
        self.identity_attempts = 0

    def usage(self):
        return {
            "github_http_attempts": self.receipt["attempts"],
            "search_attempts": self.search_attempts,
            "readme_attempts": self.readme_attempts,
            "identity_attempts": self.identity_attempts,
            "model_http_attempts": 0,
            "simulated_attempts": 0,
        }

    async def reserve(self, category):
        stamp = time.time()
        async with self.journal.lock:
            blocked = self.journal.read("github_rate", "blocked") or {}
            if blocked.get("until", 0) > stamp:
                raise GitHubError(
                    "GITHUB_COOLDOWN",
                    "GitHub requests are paused by a saved provider cooldown; no request was sent.",
                    429,
                    round(blocked["until"] - stamp),
                )
            limit, period = ((27 if self.token else 9), 60) if category == "search" else (50, 3600)
            key = f"{'search' if category == 'search' else 'core'}:{int(stamp // period)}"
            window = self.journal.read("github_rate", key) or {"attempts": 0}
            if window["attempts"] >= limit:
                raise GitHubError(
                    "LOCAL_RATE_LIMIT",
                    "The conservative local GitHub rate window is exhausted; no request was sent.",
                    429,
                    period - int(stamp % period),
                )
            window["attempts"] += 1
            atomic_json(self.journal.path("github_rate", key), window)
        await self.journal.attempt(self.receipt, self.request.remaining_attempts)
        if category == "search":
            self.search_attempts += 1
        elif category == "identity":
            self.identity_attempts += 1
        else:
            self.readme_attempts += 1

    async def get(self, path, *, params=None, maximum=2 * 1024 * 1024, cache_key):
        if not re.fullmatch(
            r"/search/repositories|/repos/[A-Za-z0-9-]+/[A-Za-z0-9_.-]+(?:/readme)?", path
        ):
            raise GitHubError(
                "INVALID_ENDPOINT",
                "Only the fixed GitHub search/README metadata routes are permitted.",
                400,
            )
        cache = self.journal.read("repo_cache", cache_key)
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "ResearchScout-PublicRepos/1.0",
        }
        if self.token and path == "/search/repositories":
            headers["Authorization"] = "Bearer " + self.token
        if (
            cache
            and isinstance(cache.get("etag"), str)
            and "\n" not in cache["etag"]
            and "\r" not in cache["etag"]
        ):
            headers["If-None-Match"] = cache["etag"][:512]
        await self.reserve(
            "search"
            if path == "/search/repositories"
            else "core"
            if path.endswith("/readme")
            else "identity"
        )
        try:
            async with (
                asyncio.timeout(HTTP_DEADLINE_SECONDS),
                self.client.stream("GET", API + path, params=params, headers=headers) as response,
            ):
                if response.status_code == 304 and cache:
                    return None, {
                        "cache_hit": True,
                        "etag": cache.get("etag"),
                        "cached_value": copy.deepcopy(cache["value"]),
                        "validated_at": now(),
                    }
                if response.status_code in {403, 429}:
                    delay = 60
                    retry = response.headers.get("retry-after")
                    try:
                        delay = (
                            max(1, int(retry))
                            if retry and retry.isdigit()
                            else max(1, int(parsedate_to_datetime(retry).timestamp() - time.time()))
                            if retry
                            else delay
                        )
                    except (ValueError, TypeError, OverflowError):
                        pass
                    known_rate = (
                        response.status_code == 429
                        or response.headers.get("x-ratelimit-remaining") == "0"
                        or retry is not None
                    )
                    if response.headers.get("x-ratelimit-remaining") == "0":
                        try:
                            delay = max(
                                delay,
                                int(response.headers.get("x-ratelimit-reset", "0"))
                                - int(time.time()),
                            )
                        except ValueError:
                            pass
                    delay = min(delay, 86400)
                    async with self.journal.lock:
                        atomic_json(
                            self.journal.path("github_rate", "blocked"),
                            {"until": time.time() + delay},
                        )
                    # A secondary limit may be a 403 without quota headers. Stop
                    # conservatively without mislabelling an ordinary denial.
                    raise GitHubError(
                        "GITHUB_RATE_LIMIT" if known_rate else "GITHUB_FORBIDDEN",
                        "GitHub rate limited this request; no retry or fallback was attempted."
                        if known_rate
                        else "GitHub denied this public request; a conservative cooldown stopped further README requests.",
                        429 if known_rate else 403,
                        delay,
                    )
                if response.status_code != 200:
                    raise GitHubError(
                        "README_MISSING"
                        if response.status_code == 404 and path.endswith("/readme")
                        else "GITHUB_FORBIDDEN"
                        if response.status_code == 403
                        else "GITHUB_HTTP_ERROR",
                        f"GitHub returned HTTP {response.status_code}; no redirect or fallback was followed.",
                        response.status_code,
                    )
                chunks, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > maximum:
                        raise GitHubError(
                            "RESPONSE_TOO_LARGE",
                            "GitHub response exceeded the bounded metadata size.",
                            413,
                        )
                    chunks.append(chunk)
                try:
                    payload = json.loads(b"".join(chunks))
                except (ValueError, UnicodeError):
                    raise GitHubError(
                        "GITHUB_SCHEMA", "GitHub did not return bounded JSON metadata."
                    ) from None
                return payload, {
                    "cache_hit": False,
                    "etag": response.headers.get("etag"),
                    "validated_at": now(),
                }
        except (httpx.TimeoutException, TimeoutError):
            raise GitHubError(
                "GITHUB_TIMEOUT", "GitHub timed out; no automatic retry was made.", 504
            ) from None
        except httpx.HTTPError:
            raise GitHubError(
                "GITHUB_CONNECTION", "GitHub connection failed; no automatic retry was made."
            ) from None

    def cache(self, key, metadata, value):
        if metadata.get("etag"):
            atomic_json(
                self.journal.path("repo_cache", key),
                {"etag": metadata["etag"], "value": value, "fetched_at": now()},
            )

    async def search(self):
        try:
            query = github_query(self.request.query, self.request.keywords)
        except ValueError as error:
            raise GitHubError("INSUFFICIENT_QUERY", str(error), 422) from None
        params = {"q": query, "per_page": self.request.limit, "page": 1}
        key = fingerprint([CACHE_POLICY, API_VERSION, "search", params])
        payload, meta = await self.get("/search/repositories", params=params, cache_key=key)
        if meta["cache_hit"]:
            value = meta["cached_value"]
        else:
            if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
                raise GitHubError("GITHUB_SCHEMA", "Repository search did not return an item list.")
            records = [
                record
                for row in payload["items"][: self.request.limit]
                if isinstance(row, dict) and (record := normalize_repository(row, "live"))
            ]
            value = {
                "records": records,
                "incomplete_results": bool(payload.get("incomplete_results")),
            }
            self.cache(key, meta, value)
        return copy.deepcopy(value), params, meta

    async def readme(self, record):
        path = f"/repos/{record['full_name']}/readme"
        key = fingerprint(
            [
                CACHE_POLICY,
                API_VERSION,
                "public-anonymous-readme",
                PARSER_POLICY,
                record["record_id"],
                record["full_name"],
            ]
        )
        payload, meta = await self.get(path, maximum=400 * 1024, cache_key=key)
        if meta["cache_hit"]:
            return meta["cached_value"], meta
        result = parse_readme(payload, record)
        self.cache(key, meta, result)
        return result, meta

    async def verify_identity(self, record):
        path = f"/repos/{record['full_name']}"
        payload, meta = await self.get(
            path,
            maximum=256 * 1024,
            cache_key=fingerprint(
                [
                    CACHE_POLICY,
                    API_VERSION,
                    "identity",
                    self.request.operation_id,
                    record["record_id"],
                    record["full_name"],
                ]
            ),
        )
        current = normalize_repository(payload, "live") if isinstance(payload, dict) else None
        if (
            current is None
            or current["record_id"] != record["record_id"]
            or current["full_name"] != record["full_name"]
        ):
            raise GitHubError(
                "README_IDENTITY_CHANGED",
                "The anonymous post-README public repository identity did not match the search candidate; README evidence was discarded.",
                409,
            )
        return {
            "repository_id_revalidated": True,
            "identity_checked_at": now(),
            "identity_basis": "search numeric ID matched anonymous public metadata after README acquisition",
        }, meta


def parse_readme(payload, record):
    if (
        not isinstance(payload, dict)
        or payload.get("encoding") != "base64"
        or not isinstance(payload.get("content"), str)
    ):
        raise GitHubError(
            "README_ENCODING",
            "README encoding is missing or unsupported; metadata remains available.",
        )
    size = payload.get("size")
    if type(size) is not int or size < 0 or size > MAX_README_BYTES:
        raise GitHubError(
            "README_TOO_LARGE", "README is outside the 256 KiB decoded inspection bound.", 413
        )
    content = "".join(payload["content"].split())
    if len(content) > 4 * ((MAX_README_BYTES + 2) // 3):
        raise GitHubError(
            "README_TOO_LARGE", "Encoded README exceeded its bound before decoding.", 413
        )
    try:
        raw = base64.b64decode(content, validate=True)
        if len(raw) != size or len(raw) > MAX_README_BYTES:
            raise ValueError("size mismatch")
        text = raw.decode("utf-8", errors="strict")
    except (ValueError, UnicodeError):
        raise GitHubError(
            "README_ENCODING", "README base64, UTF-8 or declared size is invalid."
        ) from None
    sha = payload.get("sha")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", sha):
        raise GitHubError("README_VERSION", "README blob version is invalid.")
    blob = b"blob " + str(len(raw)).encode() + b"\0" + raw
    if (
        hashlib.sha1(blob).hexdigest() if len(sha) == 40 else hashlib.sha256(blob).hexdigest()
    ) != sha:
        raise GitHubError("README_VERSION", "README content does not match its reported blob SHA.")
    git_url = payload.get("git_url")
    expected = f"{API}/repos/{record['full_name']}/git/blobs/{sha}"
    if not isinstance(git_url, str) or git_url.lower() != expected.lower():
        raise GitHubError(
            "README_SOURCE", "README blob URL does not match the bound public repository and SHA."
        )
    filename = payload.get("path")
    if (
        not isinstance(filename, str)
        or len(filename) > 1000
        or filename.startswith("/")
        or any(part in {".", ".."} for part in filename.split("/"))
    ):
        raise GitHubError("README_SOURCE", "README source path is invalid.")
    web_url = payload.get("html_url")
    parsed = urlsplit(web_url or "")
    if (
        parsed.scheme != "https"
        or parsed.netloc.lower() != "github.com"
        or not parsed.path.lower().startswith("/" + record["full_name"].lower() + "/blob/")
        or parsed.query
        or parsed.fragment
    ):
        web_url = None
    evidence, truncated = selected_readme_evidence(
        text, record_id=record["record_id"], sha=sha, source_url=expected
    )
    return {
        "status": "available",
        "sha": sha,
        "source_url": expected,
        "web_url": web_url,
        "path": filename,
        "evidence": evidence,
        "truncated": truncated,
        "decoded_bytes": len(raw),
        "parser_policy": PARSER_POLICY,
        "assessment_scope": "bounded_first_pass_excerpts",
        "observed_at": now(),
        "repository_id_revalidated": False,
        "identity_basis": "numeric ID at search; anonymous named README read",
        "_source_artifact": readable_source(text),
    }


def fixture_records(request):
    records = []
    for index in range(request.limit):
        row = {
            "id": 9000 + index,
            "private": False,
            "visibility": "public",
            "full_name": f"scout-fixture/{'retrieval-toolkit' if index == 0 else 'pharmacy-metrics' if index == 1 else 'research-tool-' + str(index)}",
            "html_url": f"https://github.com/scout-fixture/{'retrieval-toolkit' if index == 0 else 'pharmacy-metrics' if index == 1 else 'research-tool-' + str(index)}",
            "description": "Authored fixture metadata for local repository evidence review.",
            "default_branch": "main",
            "language": "Python",
            "topics": ["retrieval"] if index == 0 else [],
            "stargazers_count": 99999 if index == 1 else 7,
            "forks_count": 1,
            "open_issues_count": 2,
            "license": {"spdx_id": "MIT"},
            "archived": False,
            "fork": False,
            "updated_at": "2026-11-14T00:00:00Z",
            "pushed_at": "2026-11-13T00:00:00Z",
        }
        records.append(normalize_repository(row, "fixture"))
    return records


def fixture_readme(record, request):
    text = (
        "# Fixture repository\n\n## Overview\nThis authored fixture provides retrieval augmented generation and evidence selection for language models.\n\n## Architecture\nA bounded Python library ranks retrieved context and records source evidence.\n\n## Installation\nDo not execute fixture commands.\n"
        if record["record_id"] == "9000"
        else "# Fixture repository\n\n## Overview\nAn authored pharmacy logistics and COVID biologics reporting fixture.\n"
    )
    raw = text.encode()
    sha = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    payload = {
        "encoding": "base64",
        "content": base64.b64encode(raw).decode(),
        "size": len(raw),
        "sha": sha,
        "path": "README.md",
        "git_url": f"{API}/repos/{record['full_name']}/git/blobs/{sha}",
        "html_url": f"https://github.com/{record['full_name']}/blob/main/README.md",
    }
    return parse_readme(payload, record)


def create_repo_provider_app(mode="fixture", *, state_dir=None, http_client=None, token=None):
    if mode not in {"fixture", "live"}:
        raise ValueError("Repository provider mode must be fixture or live.")
    directory = repository_path(state_dir or os.getenv("SCOUT_STATE_DIR", ".scout"))
    journal = Journal(directory / "providers" / "github" / mode, MAX_REPO_REQUESTS)
    configured_token = token if token is not None else os.getenv("SCOUT_GITHUB_TOKEN", "").strip()
    if "\n" in configured_token or "\r" in configured_token:
        raise ValueError("GitHub token has an invalid format.")

    @asynccontextmanager
    async def lifespan(_app):
        journal.acquire_writer()
        try:
            yield
        finally:
            journal.close()

    app = FastAPI(title="Research Scout public GitHub provider", lifespan=lifespan)
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    app.state.journal = journal

    @app.exception_handler(ProviderError)
    async def error_handler(_request, error):
        return JSONResponse(
            {"provider": "github", "error": {"code": error.code, "message": str(error)}},
            status_code=error.status,
        )

    @app.get("/health")
    async def health():
        return {
            "provider": "github",
            "status": "ok",
            "mode": mode,
            "capabilities": {"repositories": True, "readme_evidence": True},
            "access_configured": True,
            "authenticated": bool(configured_token) if mode == "live" else False,
            "transport": "official_rest",
            "readme_limit": MAX_READMES,
            "identity_check_limit": MAX_READMES,
            "request_limit": MAX_REPO_REQUESTS,
            "http_deadline_seconds": HTTP_DEADLINE_SECONDS,
            "vectors": False,
        }

    @app.get("/saved-readmes/{artifact_id}")
    async def saved_readme(artifact_id: str):
        if not re.fullmatch(r"[0-9a-f]{64}", artifact_id):
            raise GitHubError("INVALID_ARTIFACT", "Saved README identity is invalid.", 400)
        saved = journal.read("repo_readme_sources", artifact_id)
        if not saved or saved.get("artifact_id") != artifact_id:
            raise GitHubError(
                "ARTIFACT_UNAVAILABLE", "No saved readable README artifact is available.", 404
            )
        return saved

    @app.post("/operations/repositories")
    async def repositories(request: RepoOperationRequest):
        scope = request.model_dump()
        scope.update(provider="github", mode=mode)
        receipt, replay = await journal.begin(scope, "repository_discovery")

        async def execute(client):
            if replay:
                for event in receipt["events"]:
                    yield json.dumps(event) + "\n"
                return
            api = PublicGitHub(
                journal, receipt, request, client=client, token=configured_token or None
            )
            records, readme_requests, identity_requests = [], [], []

            def usage():
                return (
                    api.usage()
                    if mode == "live"
                    else {
                        "github_http_attempts": 0,
                        "search_attempts": 0,
                        "readme_attempts": 0,
                        "identity_attempts": 0,
                        "model_http_attempts": 0,
                        "simulated_attempts": receipt["attempts"],
                    }
                )

            async def emit(event):
                event = copy.deepcopy(event)
                event.update(provider="github", mode=mode, usage=usage())
                await journal.append(receipt, event)
                return json.dumps(event) + "\n"

            try:
                began, clock = now(), time.perf_counter()
                query = github_query(request.query, request.keywords)
                yield await emit(
                    {
                        "type": "stage",
                        "id": "github-search",
                        "operation": "repository_search",
                        "status": "running",
                        "started_at": began,
                        "executed_arguments": {
                            "q": query,
                            "per_page": request.limit,
                            "page": 1,
                            "readme_limit": min(MAX_READMES, request.limit),
                            "identity_check_limit": min(MAX_READMES, request.limit),
                            "request_limit": 1 + 2 * min(MAX_READMES, request.limit),
                        },
                    }
                )
                if mode == "fixture":
                    await journal.attempt(receipt, request.remaining_attempts)
                    records, arguments, cache = (
                        fixture_records(request),
                        {"q": query, "per_page": request.limit, "page": 1},
                        {"cache_hit": False},
                    )
                    incomplete = False
                else:
                    value, arguments, cache = await api.search()
                    records, incomplete = value["records"], value["incomplete_results"]
                records = rank_repositories(
                    records,
                    {
                        "query": request.query,
                        "keywords": request.keywords,
                        "tags": request.tags,
                        "domain": request.domain,
                        "intent": request.intent,
                    },
                )
                cohort = {row["record_id"] for row in records[:MAX_READMES]}
                for row in records:
                    if row["record_id"] in cohort:
                        row["readme"]["status"] = "pending"
                        row.update(version_repository(row))
                yield await emit(
                    {
                        "type": "stage",
                        "id": "github-search",
                        "operation": "repository_search",
                        "status": "succeeded",
                        "started_at": began,
                        "completed_at": now(),
                        "duration_ms": (time.perf_counter() - clock) * 1000,
                        "cache_hit": cache["cache_hit"],
                        "executed_arguments": arguments,
                        "incomplete_results": incomplete,
                    }
                )
                for row in records:
                    yield await emit({"type": "repository", "record": row})
                for row in [item for item in records if item["record_id"] in cohort]:
                    began, clock = now(), time.perf_counter()
                    stage_id = f"readme:{row['record_id']}"
                    yield await emit(
                        {
                            "type": "stage",
                            "id": stage_id,
                            "operation": "readme",
                            "record_id": row["record_id"],
                            "status": "running",
                            "started_at": began,
                            "executed_arguments": {"path": f"/repos/{row['full_name']}/readme"},
                        }
                    )
                    attempts_before = receipt["attempts"]
                    try:
                        if mode == "fixture":
                            await journal.attempt(receipt, request.remaining_attempts)
                            readme, cache = fixture_readme(row, request), {"cache_hit": False}
                        else:
                            readme, cache = await api.readme(row)
                        identity_started, identity_clock = now(), time.perf_counter()
                        identity_id = f"identity:{row['record_id']}"
                        identity_path = f"/repos/{row['full_name']}"
                        identity_before = receipt["attempts"]
                        yield await emit(
                            {
                                "type": "stage",
                                "id": identity_id,
                                "operation": "identity_check",
                                "record_id": row["record_id"],
                                "status": "running",
                                "started_at": identity_started,
                                "executed_arguments": {
                                    "path": identity_path,
                                    "expected_record_id": row["record_id"],
                                    "anonymous": True,
                                },
                            }
                        )
                        identity_error = None
                        try:
                            if mode == "fixture":
                                await journal.attempt(receipt, request.remaining_attempts)
                                verified = {
                                    "repository_id_revalidated": True,
                                    "identity_checked_at": now(),
                                    "identity_basis": "authored fixture public numeric ID verification",
                                }
                            else:
                                verified, _ = await api.verify_identity(row)
                            readme.update(verified)
                        except ProviderError as failure:
                            identity_error = {
                                "code": failure.code,
                                "message": str(failure),
                                "retry_after_seconds": getattr(failure, "retry_after", None),
                            }
                            raise
                        finally:
                            identity_requests.append(
                                {
                                    "record_id": row["record_id"],
                                    "full_name": row["full_name"],
                                    "path": identity_path,
                                    "attempted": mode == "live"
                                    and receipt["attempts"] > identity_before,
                                    "simulated": mode == "fixture"
                                    and receipt["attempts"] > identity_before,
                                    "status": "failed" if identity_error else "succeeded",
                                    "error": identity_error,
                                }
                            )
                            yield await emit(
                                {
                                    "type": "stage",
                                    "id": identity_id,
                                    "operation": "identity_check",
                                    "record_id": row["record_id"],
                                    "status": "failed" if identity_error else "succeeded",
                                    "started_at": identity_started,
                                    "completed_at": now(),
                                    "duration_ms": (time.perf_counter() - identity_clock) * 1000,
                                    "executed_arguments": {
                                        "path": identity_path,
                                        "expected_record_id": row["record_id"],
                                        "anonymous": True,
                                    },
                                    "error": identity_error,
                                }
                            )
                        row["readme"] = readme
                        outcome, error = "succeeded", None
                    except ProviderError as failure:
                        status = (
                            "missing"
                            if failure.code == "README_MISSING"
                            else "blocked"
                            if failure.status in {403, 413, 429}
                            else "error"
                        )
                        row["readme"] = {
                            **row["readme"],
                            "status": status,
                            "error": {
                                "code": failure.code,
                                "message": str(failure),
                                "retry_after_seconds": getattr(failure, "retry_after", None),
                            },
                        }
                        outcome, error = "failed", row["readme"]["error"]
                        cache = {"cache_hit": False}
                    pending_source = row["readme"].pop("_source_artifact", None)
                    row.update(version_repository(row))
                    if (
                        pending_source is not None
                        and row["readme"].get("repository_id_revalidated") is True
                    ):
                        artifact_id, artifact = promote_source(row, pending_source)
                        atomic_json(journal.path("repo_readme_sources", artifact_id), artifact)
                        row["readme"].update(artifact_available=True, artifact_id=artifact_id)
                    readme_requests.append(
                        {
                            "record_id": row["record_id"],
                            "full_name": row["full_name"],
                            "path": f"/repos/{row['full_name']}/readme",
                            "status": row["readme"]["status"],
                            "attempted": mode == "live" and receipt["attempts"] > attempts_before,
                            "simulated": mode == "fixture"
                            and receipt["attempts"] > attempts_before,
                            "cache_hit": cache["cache_hit"],
                            "error": error,
                        }
                    )
                    records = rank_repositories(
                        records,
                        {
                            "query": request.query,
                            "keywords": request.keywords,
                            "tags": request.tags,
                            "domain": request.domain,
                            "intent": request.intent,
                        },
                    )
                    yield await emit({"type": "repository", "record": row})
                    yield await emit(
                        {
                            "type": "stage",
                            "id": stage_id,
                            "operation": "readme",
                            "record_id": row["record_id"],
                            "status": outcome,
                            "started_at": began,
                            "completed_at": now(),
                            "duration_ms": (time.perf_counter() - clock) * 1000,
                            "executed_arguments": {"path": f"/repos/{row['full_name']}/readme"},
                            "cache_hit": cache["cache_hit"],
                            "error": error,
                        }
                    )
                    if error and error["code"] in {
                        "GITHUB_RATE_LIMIT",
                        "LOCAL_RATE_LIMIT",
                        "GITHUB_COOLDOWN",
                        "GITHUB_FORBIDDEN",
                    }:
                        break
                for row in records:
                    if row["readme"]["status"] == "pending":
                        row["readme"].update(
                            status="blocked",
                            error={
                                "code": "README_DEFERRED",
                                "message": "Remaining README work was deferred after the provider stopped.",
                            },
                        )
                        row.update(version_repository(row))
                        readme_requests.append(
                            {
                                "record_id": row["record_id"],
                                "full_name": row["full_name"],
                                "path": f"/repos/{row['full_name']}/readme",
                                "status": "blocked",
                                "attempted": False,
                                "simulated": False,
                                "cache_hit": False,
                                "error": row["readme"]["error"],
                            }
                        )
                    yield await emit({"type": "repository", "record": row})
                partial = incomplete or any(
                    row["readme"]["status"] in {"blocked", "error"} for row in records
                )
                yield await emit(
                    {
                        "type": "complete",
                        "status": "partial" if partial else "succeeded",
                        "query": query,
                        "record_count": len(records),
                        "readme_limit": min(MAX_READMES, request.limit),
                        "identity_check_limit": min(MAX_READMES, request.limit),
                        "request_limit": 1 + 2 * min(MAX_READMES, request.limit),
                        "readme_requests": readme_requests,
                        "identity_requests": identity_requests,
                        "executed_arguments": {
                            "search": arguments,
                            "readme_requests": readme_requests,
                            "readme_limit": min(MAX_READMES, request.limit),
                            "identity_requests": identity_requests,
                            "identity_check_limit": min(MAX_READMES, request.limit),
                            "request_limit": 1 + 2 * min(MAX_READMES, request.limit),
                        },
                        "incomplete_results": incomplete,
                    }
                )
                await journal.finish(receipt)
            except asyncio.CancelledError:
                await journal.finish(receipt, interrupted=True)
                raise
            except (ProviderError, ValueError, httpx.HTTPError) as error:
                code = (
                    error.code
                    if isinstance(error, ProviderError)
                    else "REPOSITORY_OPERATION_FAILED"
                )
                yield await emit(
                    {
                        "type": "complete",
                        "status": "partial" if records else "failed",
                        "record_count": len(records),
                        "error": {
                            "code": code,
                            "message": str(error)
                            if isinstance(error, ProviderError)
                            else "Repository operation failed; no retry was made.",
                        },
                        "readme_limit": min(MAX_READMES, request.limit),
                        "identity_check_limit": min(MAX_READMES, request.limit),
                        "request_limit": 1 + 2 * min(MAX_READMES, request.limit),
                        "readme_requests": readme_requests,
                        "identity_requests": identity_requests,
                    }
                )
                await journal.finish(receipt)

        async def stream():
            if http_client:
                async for event in execute(http_client):
                    yield event
            else:
                async with httpx.AsyncClient(
                    timeout=20, follow_redirects=False, trust_env=False
                ) as client:
                    async for event in execute(client):
                        yield event

        return StreamingResponse(stream(), media_type="application/x-ndjson")

    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8121)
    parser.add_argument("--mode", choices=["fixture", "live"], default=None)
    args = parser.parse_args()
    mode = args.mode or os.getenv("SCOUT_GITHUB_MODE") or os.getenv("SCOUT_MODE", "fixture")
    uvicorn.run(create_repo_provider_app(mode), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
