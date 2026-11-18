"""Public catalog metadata only: no dataset files, redirects or executable loaders."""

from __future__ import annotations

import html
import re
import time
from urllib.parse import quote, urlsplit

import httpx
from fastapi import FastAPI

from ..contracts import fingerprint, now
from ..dataset_contracts import DatasetCatalogRequest
from ..dataset_terms import informative_tokens, query_anchors
from .journal import Journal, ProviderError

ENDPOINTS = {
    "hugging_face": "https://huggingface.co/api/datasets",
    "datacite": "https://api.datacite.org/dois",
}


def text(value, maximum=20000):
    return html.unescape(re.sub(r"<[^>]+>", " ", str(value or ""))).strip()[:maximum] or None


def description_fields(value, *, omitted_descriptions=False):
    """Describe known local clipping, without claiming upstream completeness."""
    normalized = html.unescape(re.sub(r"<[^>]+>", " ", str(value or ""))).strip()
    reasons = []
    if len(normalized) > 20000:
        reasons.append("Saved catalog description was limited to 20,000 characters.")
    if omitted_descriptions:
        reasons.append("Only the first eight catalog description entries were retained.")
    return {
        "description": normalized[:20000] or None,
        "description_truncated": bool(reasons),
        "description_truncation_reason": " ".join(reasons) or None,
    }


def strings(value, maximum=40):
    if isinstance(value, str):
        value = [value]
    return (
        list(
            dict.fromkeys(str(item)[:500] for item in value if isinstance(item, (str, int, float)))
        )[:maximum]
        if isinstance(value, list)
        else []
    )


def safe_url(value):
    if not isinstance(value, str) or len(value) > 4000:
        return None
    parsed = urlsplit(value)
    return (
        value
        if parsed.scheme in {"http", "https"}
        and parsed.hostname
        and not parsed.username
        and not parsed.password
        else None
    )


def base_record(provider, record_id, version, mode):
    return {
        "dataset_id": fingerprint([provider, record_id, version]),
        "source_ref": f"{provider}:{record_id}",
        "provider": provider,
        "record_id": record_id,
        "resource_type": "dataset",
        "version": text(version, 500),
        "observed_at": now(),
        "mode": mode,
        "content_origin": "provider_metadata",
        "profile_state": "discovered",
        "relationships": [],
        "formats": [],
        "variables": [],
        "warnings": [],
    }


def hugging_face_record(row, mode="live"):
    identity = row.get("id") or row.get("_id")
    if (
        not isinstance(identity, str)
        or not re.fullmatch(r"[\w.-]+(?:/[\w.-]+)?", identity)
        or len(identity) > 500
        or any(part in {".", ".."} for part in identity.split("/"))
    ):
        return None
    card = row.get("cardData") if isinstance(row.get("cardData"), dict) else {}
    tags = strings(row.get("tags"))
    licenses = strings(card.get("license")) or [
        t.removeprefix("license:") for t in tags if t.startswith("license:")
    ]
    tasks = strings(card.get("task_categories")) or [
        t.removeprefix("task_categories:") for t in tags if t.startswith("task_categories:")
    ]
    gated = row.get("gated") in {True, "auto", "manual"}
    private = row.get("private") is True
    created = row.get("createdAt") or ""
    result = base_record("hugging_face", identity, row.get("sha"), mode)
    result.update(
        title=text(card.get("pretty_name") or card.get("title") or identity, 5000),
        **description_fields(row.get("description")),
        url=f"https://huggingface.co/datasets/{quote(identity, safe='/')}",
        doi=None,
        authors=strings(card.get("creators")),
        publisher=None,
        catalog_owner=text(row.get("author"), 500),
        year=int(created[:4]) if re.match(r"^\d{4}-", created) else None,
        year_basis="catalog_created" if re.match(r"^\d{4}-", created) else None,
        tags=tags,
        tasks=tasks,
        license=", ".join(licenses) or None,
        access={
            "status": "restricted"
            if private
            else "gated"
            if gated
            else "public"
            if row.get("gated") is False
            else "unknown",
            "gated": gated,
            "private": private,
        },
        created_at=text(created, 100),
        updated_at=text(row.get("lastModified"), 100),
        metadata_url=f"https://huggingface.co/api/datasets/{quote(identity, safe='/')}",
        languages=strings(card.get("language")),
        size_categories=strings(card.get("size_categories")),
    )
    return result


def datacite_dataset_record(row, mode="live"):
    attrs = row.get("attributes")
    if (
        not isinstance(attrs, dict)
        or attrs.get("types", {}).get("resourceTypeGeneral", "").lower() != "dataset"
    ):
        return None
    doi = attrs.get("doi") or row.get("id")
    if not isinstance(doi, str) or not re.match(r"^10\.\d{4,9}/\S+$", doi) or len(doi) > 500:
        return None
    doi = doi.lower()
    result = base_record("datacite", doi, attrs.get("version"), mode)
    titles = attrs.get("titles") or []
    descriptions = attrs.get("descriptions") or []
    rights = attrs.get("rightsList") or []
    related = attrs.get("relatedIdentifiers") or []
    result.update(
        title=text(titles[0].get("title"), 5000) if titles else None,
        **description_fields(
            "\n\n".join(str(item.get("description", "")) for item in descriptions[:8]),
            omitted_descriptions=len(descriptions) > 8,
        ),
        url=safe_url(attrs.get("url")) or f"https://doi.org/{quote(doi, safe='/')}",
        doi=doi,
        authors=[
            text(c.get("name") or " ".join([c.get("givenName", ""), c.get("familyName", "")]), 500)
            for c in (attrs.get("creators") or [])[:100]
            if isinstance(c, dict)
        ],
        publisher=text(attrs.get("publisher"), 2000),
        year=attrs.get("publicationYear") if type(attrs.get("publicationYear")) is int else None,
        year_basis="publication" if type(attrs.get("publicationYear")) is int else None,
        tags=[
            text(item.get("subject"), 500)
            for item in (attrs.get("subjects") or [])[:40]
            if isinstance(item, dict) and item.get("subject")
        ],
        tasks=[],
        license=text(
            "; ".join(
                str(
                    item.get("rightsIdentifier")
                    or item.get("rights")
                    or item.get("rightsUri")
                    or ""
                )
                for item in rights[:8]
            ),
            2000,
        ),
        access={"status": "unknown", "gated": False, "private": False},
        formats=strings(attrs.get("formats")),
        sizes=strings(attrs.get("sizes")),
        resource_dates=[
            {
                k: text(item.get(k), 500)
                for k in ("date", "dateType", "dateInformation")
                if item.get(k)
            }
            for item in (attrs.get("dates") or [])[:20]
            if isinstance(item, dict)
        ],
        geography=(attrs.get("geoLocations") or [])[:20],
        relationships=[
            {
                "identifier": text(item.get("relatedIdentifier"), 1000),
                "type": text(item.get("relationType"), 100),
                "identifier_type": text(item.get("relatedIdentifierType"), 100),
                "source": "registered",
                "provider": "datacite",
            }
            for item in related[:30]
            if isinstance(item, dict)
        ],
        metadata_url=f"https://api.datacite.org/dois/{quote(doi, safe='/')}",
    )
    result["authors"] = [author for author in result["authors"] if author]
    return result


def catalog_query(provider, request):
    anchors = query_anchors(request.query, request.keywords)
    if not anchors:
        raise ProviderError(
            "INSUFFICIENT_QUERY",
            "The saved plan lacks informative dataset task/domain anchors; no broad catalog request was sent.",
            422,
        )
    if provider == "hugging_face":
        haystack = " ".join([request.query, *request.keywords]).lower()
        chosen = next(
            (
                word
                for word in [
                    "retrieval",
                    "question-answering",
                    "translation",
                    "classification",
                    "reasoning",
                    "speech",
                    "image",
                    "medical",
                    "climate",
                ]
                if word in haystack
            ),
            None,
        )
        query = chosen or next(iter(sorted(informative_tokens(anchors[0]))))
        params = [
            ("search", query),
            ("limit", str(request.limit)),
            *[
                ("expand", field)
                for field in (
                    "author",
                    "cardData",
                    "description",
                    "tags",
                    "sha",
                    "createdAt",
                    "lastModified",
                    "gated",
                    "private",
                )
            ],
        ]
    else:
        query = (
            "types.resourceTypeGeneral:Dataset AND ("
            + " AND ".join(f'"{anchor}"' for anchor in anchors)
            + ")"
        )
        if request.year_from is not None or request.year_to is not None:
            query += (
                f" AND publicationYear:[{request.year_from or '*'} TO {request.year_to or '*'}]"
            )
        params = [("query", query), ("page[size]", str(request.limit))]
    return query, params


async def fetch_catalog(provider, request, client):
    query, params = catalog_query(provider, request)
    async with client.stream(
        "GET",
        ENDPOINTS[provider],
        params=params,
        headers={"Accept": "application/json", "User-Agent": "ResearchScout-DatasetCatalog/1.0"},
    ) as response:
        if response.status_code == 429:
            raise ProviderError(
                "RATE_LIMITED",
                f"{provider} dataset catalog rate limit reached; no retry was made.",
                429,
            )
        if response.status_code != 200:
            raise ProviderError(
                "CATALOG_HTTP_ERROR",
                f"{provider} metadata request failed ({response.status_code}); no fallback was made.",
                502,
            )
        chunks, size = [], 0
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > 2 * 1024 * 1024:
                raise ProviderError(
                    "RESPONSE_LIMIT", "Dataset metadata response exceeded its bound."
                )
            chunks.append(chunk)
    import json

    try:
        payload = json.loads(b"".join(chunks))
    except ValueError:
        raise ProviderError("UPSTREAM_SCHEMA", "Dataset catalog did not return JSON.") from None
    rows = (
        payload
        if provider == "hugging_face"
        else payload.get("data")
        if isinstance(payload, dict)
        else None
    )
    if not isinstance(rows, list):
        raise ProviderError("UPSTREAM_SCHEMA", "Dataset catalog did not return a record list.")
    normalize = hugging_face_record if provider == "hugging_face" else datacite_dataset_record
    records = [
        record
        for row in rows[: request.limit]
        if isinstance(row, dict) and (record := normalize(row))
    ]
    return {
        "records": records,
        "query": query,
        "executed_arguments": params,
        "transport": "official_rest",
        "scope": "catalog_metadata_only",
        "native_semantic_search": False,
    }


def fixture_catalog(provider, request):
    records = []
    for index in range(min(request.limit, 3)):
        if provider == "hugging_face":
            record = hugging_face_record(
                {
                    "id": f"research-scout-fixture/{['retrieval-evidence', 'classification-baseline', 'context-evaluation'][index]}",
                    "sha": f"fixture-revision-{index + 1}",
                    "description": f"Authored fixture dataset for {request.query}. This is synthetic catalog metadata, not a real dataset.",
                    "tags": ["task_categories:question-answering", "license:cc-by-4.0"],
                    "cardData": {
                        "pretty_name": f"Fixture dataset: {request.query} {index + 1}",
                        "task_categories": ["question-answering"],
                        "license": "cc-by-4.0",
                    },
                    "gated": False,
                    "private": False,
                    "createdAt": "2026-01-01T00:00:00Z",
                },
                "fixture",
            )
        else:
            record = datacite_dataset_record(
                {
                    "id": f"10.0000/scout-dataset-{index + 1}",
                    "attributes": {
                        "doi": f"10.0000/scout-dataset-{index + 1}",
                        "types": {"resourceTypeGeneral": "Dataset"},
                        "titles": [
                            {"title": f"Fixture research dataset: {request.query} {index + 1}"}
                        ],
                        "descriptions": [
                            {
                                "description": "Authored synthetic catalog metadata for retrieval evaluation."
                            }
                        ],
                        "creators": [{"name": "Example Data Curator"}],
                        "publisher": "Illustrative research repository",
                        "publicationYear": 2026,
                        "version": "1",
                        "rightsList": [{"rights": "CC-BY-4.0"}],
                        "subjects": [{"subject": "retrieval evaluation"}],
                    },
                },
                "fixture",
            )
        records.append(record)
    return {
        "records": records,
        "query": catalog_query(provider, request)[0],
        "executed_arguments": dict(catalog_query(provider, request)[1]),
        "transport": "fixture",
        "scope": "catalog_metadata_only",
        "native_semantic_search": False,
    }


def add_dataset_routes(
    app: FastAPI, provider: str, mode: str, journal: Journal, *, http_client=None
):
    @app.post("/operations/datasets")
    async def dataset_catalog(request: DatasetCatalogRequest):
        scope = request.model_dump()
        scope.update(provider=provider, mode=mode)
        receipt, replay = await journal.begin(scope, "dataset_catalog")
        if replay:
            return receipt["events"][-1]
        started_at, clock = now(), time.perf_counter()
        try:
            catalog_query(provider, request)
            await journal.attempt(receipt, request.remaining_attempts)
            if mode == "fixture":
                payload = fixture_catalog(provider, request)
            elif http_client:
                payload = await fetch_catalog(provider, request, http_client)
            else:
                async with httpx.AsyncClient(
                    timeout=20, follow_redirects=False, trust_env=False
                ) as client:
                    payload = await fetch_catalog(provider, request, client)
            result = {
                "provider": provider,
                "mode": mode,
                "status": "succeeded",
                **payload,
                "attempts": receipt["attempts"],
                "started_at": started_at,
                "completed_at": now(),
                "duration_ms": (time.perf_counter() - clock) * 1000,
            }
            await journal.append(receipt, result)
            await journal.finish(receipt, result)
            return result
        except (ProviderError, httpx.HTTPError) as error:
            result = {
                "provider": provider,
                "mode": mode,
                "status": "failed",
                "records": [],
                "error": {
                    "code": error.code
                    if isinstance(error, ProviderError)
                    else "CATALOG_CONNECTION_ERROR",
                    "message": str(error)
                    if isinstance(error, ProviderError)
                    else "Catalog connection failed or timed out; no automatic retry was made.",
                },
                "attempts": receipt["attempts"],
                "started_at": started_at,
                "completed_at": now(),
                "duration_ms": (time.perf_counter() - clock) * 1000,
            }
            await journal.append(receipt, result)
            await journal.finish(receipt, result)
            return result
        except BaseException:
            await journal.finish(receipt, interrupted=True)
            raise
