"""Bounded provider-specific REST/Atom pages; no automatic paging or fallback."""

import re
from urllib.parse import quote

from .journal import ProviderError
from .normalization import (
    arxiv_id,
    arxiv_records,
    crossref_record,
    europe_pmc_record,
    openaire_record,
)

ARXIV_QUERY_POLICY = "scout-arxiv-literal-terms-v1"
CROSSREF_QUERY_POLICY = "scout-crossref-bibliographic-v2"
ARXIV_STOPWORDS = frozenset(
    "a an and are as at be best by can could do does for from how i in into is it me of on or our please should some tell than that the their these this those to use using want we what when where which who why will with would you your approaches approach methods method research papers paper find about".split()
)


def arxiv_query(text: str):
    tokens = re.findall(r"[^\W_]+(?:-[^\W_]+)*", text, flags=re.UNICODE)
    selected = [token for token in tokens if token.lower() not in ARXIV_STOPWORDS] or tokens
    if not selected:
        raise ProviderError("INVALID_QUERY", "Enter at least one searchable word for arXiv.", 422)
    # Limit compound query size explicitly and record discarded terms.
    selected = list(dict.fromkeys(token.lower() for token in selected))
    retained, omitted = selected[:16], selected[16:]
    return " AND ".join(f'all:"{token}"' for token in retained), {
        "query_policy": ARXIV_QUERY_POLICY,
        "omitted_terms": omitted,
    }


def _rows(payload: dict, key: str, provider: str):
    rows = payload.get(key)
    if not isinstance(rows, list):
        raise ProviderError("UPSTREAM_SCHEMA", f"{provider} response lacks a {key} array.")
    return rows


async def lexical_page(adapter, query: str, limit: int, before_call, filters=None):
    provider, base = adapter.provider, adapter.base_url
    filters = filters or {}
    years = {key: filters[key] for key in ("year_from", "year_to") if filters.get(key) is not None}
    provenance = {
        "transport": "official_atom" if provider == "arxiv" else "official_rest",
        "page_count": 1,
        "pagination": "bounded_first_page_no_automatic_followup",
        "filters": "deterministic_metadata_postfilter",
        "semantic_scope": "lexical_candidate_pool",
    }
    provenance.update(requested_filters=filters, upstream_filters=years, local_filters=filters)
    if provider == "arxiv":
        # Treat an ordinary user question as text, not unreviewed arXiv query syntax.
        shaped, policy = arxiv_query(query)
        if years:
            shaped = f"({shaped}) AND submittedDate:[{years.get('year_from', 1000)}01010000 TO {years.get('year_to', 3000)}12312359]"
        provenance["upstream_year_field"] = (
            "submittedDate: Atom published is first-version submission"
        )
        provenance.update(policy)
        params = {
            "search_query": shaped,
            "start": 0,
            "max_results": limit,
            "sortBy": "relevance",
            "sortOrder": "descending",
        }
        text = await adapter.http_get(base + "/query", params, before_call, response_format="atom")
        rows = arxiv_records(text)

        def normalizer(record):
            return record
    elif provider == "crossref":
        # Crossref's broad `query` also searches non-bibliographic metadata.
        # Scope this discovery route to citation-bearing fields; the caller's
        # domain-specific planning and relevance review still determine intent.
        params = {
            "query.bibliographic": query,
            "rows": limit,
            "offset": 0,
            "sort": "relevance",
            "order": "desc",
        }
        provenance.update(
            query_policy=CROSSREF_QUERY_POLICY,
            query_scope="bibliographic_metadata",
            query_policy_source="https://api.crossref.org/swagger-docs",
        )
        pushed = []
        for name, upstream in (("year_from", "from-pub-date"), ("year_to", "until-pub-date")):
            if name in years:
                pushed.append(
                    f"{upstream}:{years[name]}-{'01-01' if name == 'year_from' else '12-31'}"
                )
        if pushed:
            params["filter"] = ",".join(pushed)
        provenance["upstream_year_field"] = (
            "published date; normalized record year rechecked locally"
        )
        payload = await adapter.http_get(base + "/works", params, before_call)
        message = payload.get("message")
        if not isinstance(message, dict):
            raise ProviderError("UPSTREAM_SCHEMA", "Crossref search lacks message metadata.")
        rows = _rows(message, "items", "Crossref")
        normalizer = crossref_record
    elif provider == "openaire":
        params = {"search": query, "page": 1, "pageSize": limit}
        for name, upstream in (
            ("year_from", "fromPublicationYear"),
            ("year_to", "toPublicationYear"),
        ):
            if name in years:
                params[upstream] = years[name]
        provenance["upstream_year_field"] = "publicationDate"
        payload = await adapter.http_get(base + "/research-products", params, before_call)
        rows = _rows(payload, "results", "OpenAIRE")
        normalizer = openaire_record
        provenance["attribution"] = "OpenAIRE Graph (CC-BY)"
    elif provider == "europe_pmc":
        if years:
            query = f"({query}) AND FIRST_PDATE:[{years.get('year_from', 1000)}-01-01 TO {years.get('year_to', 3000)}-12-31]"
        provenance["upstream_year_field"] = "FIRST_PDATE / firstPublicationDate"
        params = {
            "query": query,
            "format": "json",
            "resultType": "core",
            "pageSize": limit,
            "cursorMark": "*",
        }
        payload = await adapter.http_get(base + "/search", params, before_call)
        results = payload.get("resultList")
        if not isinstance(results, dict):
            raise ProviderError("UPSTREAM_SCHEMA", "Europe PMC search lacks resultList.")
        rows = _rows(results, "result", "Europe PMC")
        normalizer = europe_pmc_record
    else:
        raise ProviderError(
            "CAPABILITY_UNAVAILABLE", "This provider does not expose this discovery route.", 400
        )
    provenance["executed_arguments"] = params
    return rows, normalizer, provenance


async def details(adapter, record_id: str, before_call):
    base = adapter.base_url
    if adapter.provider == "crossref":
        from .normalization import normalize_doi

        doi = normalize_doi(record_id)
        payload = await adapter.http_get(
            base + "/works/" + quote(doi, safe="/"), before_call=before_call
        )
        return crossref_record(payload.get("message", {}))
    if adapter.provider == "arxiv":
        identifier = arxiv_id(record_id)
        text = await adapter.http_get(
            base + "/query",
            {"id_list": identifier, "max_results": 1},
            before_call,
            response_format="atom",
        )
        rows = arxiv_records(text)
        if not rows:
            raise ProviderError("NOT_FOUND", "No arXiv record was returned.", 404)
        record = rows[0]
        if record["record_id"] != identifier and re.search(r"v\d+$", identifier):
            raise ProviderError("UPSTREAM_SCHEMA", "arXiv returned another version.")
        return record
    if adapter.provider == "openaire":
        if not record_id or len(record_id) > 500:
            raise ProviderError("INVALID_RECORD", "An OpenAIRE identifier is required.", 422)
        payload = await adapter.http_get(
            base + "/research-products/" + quote(record_id, safe=""), before_call=before_call
        )
        # The V3 singleton is a ResearchProduct; reject list/wrapper substitution.
        return openaire_record(payload)
    if adapter.provider == "europe_pmc":
        origin, separator, identifier = record_id.partition(":")
        if (
            not separator
            or not re.fullmatch(r"[A-Z]{2,10}", origin)
            or not re.fullmatch(r"[\w.-]+", identifier)
        ):
            raise ProviderError("INVALID_RECORD", "An exact Europe PMC source:id is required.", 422)
        query = f"EXT_ID:{identifier} AND SRC:{origin}"
        payload = await adapter.http_get(
            base + "/search",
            {
                "query": query,
                "format": "json",
                "resultType": "core",
                "pageSize": 1,
                "cursorMark": "*",
            },
            before_call,
        )
        rows = _rows(payload.get("resultList") or {}, "result", "Europe PMC")
        if not rows:
            raise ProviderError("NOT_FOUND", "No Europe PMC record was returned.", 404)
        record = europe_pmc_record(rows[0])
        if record["record_id"] != record_id:
            raise ProviderError("UPSTREAM_SCHEMA", "Europe PMC returned another source identity.")
        return record
    raise ProviderError(
        "CAPABILITY_UNAVAILABLE", "Details belong to the originating discovery service.", 400
    )
