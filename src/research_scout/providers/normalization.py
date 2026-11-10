"""Provider-authored fields remain attributable; missing fields are never invented."""

import hashlib
import json
import re
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from html import unescape
from urllib.parse import quote, urlsplit

from .journal import ProviderError


def normalize_doi(value: str) -> str:
    value = re.sub(
        r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value.strip(), flags=re.IGNORECASE
    ).lower()
    if not re.fullmatch(r"10\.\d{4,9}/[^\s?#]+", value):
        raise ProviderError("MALFORMED_DOI", "A complete DOI is required.", 422)
    return value


def plain(value):
    if not isinstance(value, str):
        return None
    separated = re.sub(
        r"</?(?:[\w.-]+:)?(?:p|title|sec|section|div|br|li|h[1-6]|abstract|list)\b[^>]*>",
        "\n",
        value,
        flags=re.I,
    )
    text = unescape(re.sub(r"<[^>]+>", "", separated))
    text = re.sub(r"[^\S\n]+", " ", text).replace("\r", "\n")
    return re.sub(r"\n\s*\n(?:\s*\n)+", "\n\n", text).strip()


def source(provider: str, record_id: str, mode: str, **fields) -> dict:
    if not record_id or not isinstance(record_id, str):
        raise ProviderError(
            "INVALID_RECORD", "Provider returned a record without a stable identifier."
        )
    record = {
        "source_ref": f"{provider}:{record_id}",
        "provider": provider,
        "record_id": record_id,
        "title": None,
        "authors": [],
        "year": None,
        "venue": None,
        "doi": None,
        "url": None,
        "abstract": None,
        "resource_type": None,
        **fields,
    }
    record["authors"] = [
        name for name in record["authors"] if isinstance(name, str) and name.strip()
    ]
    record["version"] = hashlib.sha256(
        json.dumps(record, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:20]
    record["observed_at"] = datetime.now(UTC).isoformat()
    record["mode"] = mode
    record["metadata_status"] = "provider_supplied" if mode == "live" else "fictional_fixture"
    record.setdefault(
        "content_origin", "provider_metadata" if mode == "live" else "authored_fixture_metadata"
    )
    record["content_state"] = (
        "abstract"
        if record.get("abstract")
        else "description"
        if record.get("description")
        else "metadata"
    )
    record["missing_fields"] = [
        k for k in ("title", "authors", "year", "venue", "doi", "abstract") if not record.get(k)
    ]
    return record


def eligible(record: dict, filters: dict) -> bool:
    year = record.get("year")
    if filters.get("year_from") is not None and (year is None or year < filters["year_from"]):
        return False
    if filters.get("year_to") is not None and (year is None or year > filters["year_to"]):
        return False
    return (
        not filters.get("resource_type") or record.get("resource_type") == filters["resource_type"]
    )


def openalex_record(raw: dict) -> dict:
    identifier = str(raw.get("id") or "").removeprefix("https://openalex.org/")
    authors = raw.get("authors") or []
    if not authors and raw.get("authorships"):
        authors = [a.get("author", {}).get("display_name") for a in raw["authorships"]]
    names = [a.get("name") if isinstance(a, dict) else a for a in authors]
    truncated = any(isinstance(a, str) and re.fullmatch(r"\+\d+ more", a) for a in names)
    names = [n for n in names if isinstance(n, str) and not re.fullmatch(r"\+\d+ more", n)]
    abstract = raw.get("abstract")
    if not abstract and isinstance(raw.get("abstract_inverted_index"), dict):
        words = [
            (position, word)
            for word, positions in raw["abstract_inverted_index"].items()
            if isinstance(positions, list)
            for position in positions
            if isinstance(position, int) and 0 <= position < 100000
        ]
        abstract = " ".join(w for _, w in sorted(words)) or None
    doi = raw.get("doi")
    return source(
        "openalex",
        identifier,
        "live",
        title=raw.get("title") or raw.get("display_name"),
        authors=names,
        year=raw.get("year", raw.get("publication_year")),
        venue=raw.get("venue")
        or ((raw.get("primary_location") or {}).get("source") or {}).get("display_name"),
        doi=normalize_doi(doi) if doi else None,
        url=raw.get("openalex_url") or f"https://openalex.org/{identifier}",
        abstract=plain(abstract),
        resource_type=raw.get("type"),
        is_retracted=raw.get("is_retracted"),
        truncated_fields=(["authors"] if truncated else [])
        + (["abstract"] if abstract and abstract.endswith("…") else []),
    )


def semantic_scholar_record(raw: dict) -> dict:
    return source(
        "semantic_scholar",
        str(raw.get("paperId") or ""),
        "live",
        title=raw.get("title"),
        authors=[a["name"] for a in raw.get("authors", []) if a.get("name")],
        year=raw.get("year"),
        venue=raw.get("venue"),
        doi=(raw.get("externalIds") or {}).get("DOI"),
        url=raw.get("url"),
        abstract=plain(raw.get("abstract")),
        resource_type="article"
        if "JournalArticle" in (raw.get("publicationTypes") or [])
        else None,
    )


def crossref_record(raw: dict) -> dict:
    date = next(
        (
            raw[k].get("date-parts", [])
            for k in ("published", "published-print", "published-online", "issued")
            if isinstance(raw.get(k), dict) and raw[k].get("date-parts")
        ),
        [],
    )
    return source(
        "crossref",
        normalize_doi(raw.get("DOI", "")),
        "live",
        title=next(iter(raw.get("title") or []), None),
        authors=[
            " ".join(filter(None, (a.get("given"), a.get("family")))) or a.get("name")
            for a in raw.get("author", [])
        ],
        year=date[0][0] if date and date[0] else None,
        venue=next(iter(raw.get("container-title") or []), None),
        doi=normalize_doi(raw.get("DOI", "")),
        url=raw.get("URL"),
        abstract=plain(raw.get("abstract")),
        resource_type={
            "journal-article": "article",
            "proceedings-article": "article",
            "posted-content": "preprint",
            "book": "book",
            "monograph": "book",
            "book-chapter": "book-chapter",
        }.get(raw.get("type"), raw.get("type")),
        provider_resource_type=raw.get("type"),
    )


def year_from_date(value):
    return int(value[:4]) if isinstance(value, str) and re.match(r"^\d{4}(?:-|$)", value) else None


def safe_link(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    return (
        value
        if parsed.scheme in {"http", "https"}
        and parsed.hostname
        and not parsed.username
        and not parsed.password
        else None
    )


def arxiv_id(value: str) -> str:
    value = re.sub(r"^https?://(?:www\.)?arxiv\.org/abs/", "", value)
    if not re.fullmatch(r"(?:\d{4}\.\d{4,5}|[A-Za-z.-]+/\d{7})(?:v\d+)?", value):
        raise ProviderError("INVALID_RECORD", "Expected an exact arXiv paper identifier.", 422)
    return value


def arxiv_records(xml_text: str) -> list[dict]:
    if "<!DOCTYPE" in xml_text.upper() or "<!ENTITY" in xml_text.upper():
        raise ProviderError("UPSTREAM_SCHEMA", "arXiv XML declarations are not supported.")
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as error:
        raise ProviderError("UPSTREAM_SCHEMA", "arXiv returned malformed Atom XML.") from error
    atom, arxiv = "{http://www.w3.org/2005/Atom}", "{http://arxiv.org/schemas/atom}"
    records = []
    for entry in root.findall(atom + "entry"):
        raw_id = entry.findtext(atom + "id") or ""
        if "/api/errors" in raw_id:
            raise ProviderError(
                "UPSTREAM_QUERY", "arXiv rejected the supplied query or identifier.", 422
            )
        identifier = arxiv_id(raw_id)
        doi = entry.findtext(arxiv + "doi")
        published, updated = entry.findtext(atom + "published"), entry.findtext(atom + "updated")
        abstract = entry.findtext(atom + "summary")
        title = entry.findtext(atom + "title")
        records.append(
            source(
                "arxiv",
                identifier,
                "live",
                title=" ".join(title.split()) if title else None,
                authors=[
                    author.findtext(atom + "name") for author in entry.findall(atom + "author")
                ],
                year=year_from_date(published),
                doi=normalize_doi(doi) if doi else None,
                url=f"https://arxiv.org/abs/{identifier}",
                abstract=" ".join(abstract.split()) if abstract else None,
                resource_type="preprint",
                venue=entry.findtext(arxiv + "journal_ref"),
                published_at=published,
                updated_at=updated,
                version_relationships=[
                    {
                        "arxiv_id": identifier,
                        "base_arxiv_id": re.sub(r"v\d+$", "", identifier),
                        "preprint": True,
                    }
                ],
            )
        )
    return records


def europe_pmc_record(raw: dict) -> dict:
    origin, identifier = raw.get("source"), raw.get("id")
    if (
        not isinstance(origin, str)
        or not re.fullmatch(r"[A-Z]{2,10}", origin)
        or not isinstance(identifier, str)
        or not re.fullmatch(r"[\w.-]+", identifier)
    ):
        raise ProviderError("INVALID_RECORD", "Europe PMC record lacks a source-scoped identifier.")
    author_rows = (raw.get("authorList") or {}).get("author", [])
    authors = [
        row.get("fullName") or " ".join(filter(None, (row.get("firstName"), row.get("lastName"))))
        for row in author_rows
        if isinstance(row, dict)
    ]
    if not authors and raw.get("authorString"):
        authors = [raw["authorString"]]
    journal = (raw.get("journalInfo") or {}).get("journal") or {}
    doi = raw.get("doi")
    pub_types = (raw.get("pubTypeList") or {}).get("pubType", [])
    pub_types = pub_types if isinstance(pub_types, list) else []
    known_types = {value.lower().strip() for value in pub_types if isinstance(value, str)}
    kind = (
        "preprint"
        if origin == "PPR"
        else "book-chapter"
        if known_types & {"book chapter", "book-chapter"}
        else "book"
        if "book" in known_types
        else "article"
        if origin not in {"PAT", "EPO", "NBK"}
        and known_types
        & {
            "journal article",
            "review",
            "systematic review",
            "meta-analysis",
            "research-article",
            "article",
            "clinical trial",
            "case reports",
        }
        else None
    )
    return source(
        "europe_pmc",
        f"{origin}:{identifier}",
        "live",
        title=raw.get("title"),
        authors=authors,
        year=year_from_date(raw.get("firstPublicationDate"))
        or (int(raw["pubYear"]) if str(raw.get("pubYear", "")).isdigit() else None),
        published_at=raw.get("firstPublicationDate"),
        venue=journal.get("title") or raw.get("journalTitle"),
        doi=normalize_doi(doi) if doi else None,
        url=f"https://europepmc.org/article/{origin}/{identifier}",
        abstract=plain(raw.get("abstractText")),
        resource_type=kind,
        provider_identifiers={
            key: value
            for key, value in {
                "source": origin,
                "id": identifier,
                "pmcid": raw.get("pmcid"),
                "pmid": identifier if origin == "MED" else None,
            }.items()
            if isinstance(value, str)
        },
        provider_resource_type=pub_types,
    )


def openaire_record(raw: dict) -> dict:
    identifier = raw.get("id")
    if not isinstance(identifier, str) or not identifier or len(identifier) > 500:
        raise ProviderError("INVALID_RECORD", "OpenAIRE record lacks an identifier.")

    def optional_list(value):
        # Graph V3 emits explicit null for absent repeated fields. Treat that as
        # missing metadata, not a reason to discard an otherwise identified record.
        return value if isinstance(value, list) else []

    pids = optional_list(raw.get("pids"))
    doi = next(
        (
            row.get("value")
            for row in pids
            if isinstance(row, dict) and str(row.get("scheme", "")).lower() == "doi"
        ),
        None,
    )
    instances = optional_list(raw.get("instances"))
    links = [
        link
        for row in instances
        if isinstance(row, dict)
        for link in optional_list(row.get("urls"))
    ]
    descriptions = [
        plain(text)
        for text in optional_list(raw.get("descriptions"))
        if isinstance(text, str) and plain(text)
    ]
    descriptions_truncated = (
        len(descriptions) > 8
        or any(len(text) > 20_000 for text in descriptions)
        or len("\n\n".join(descriptions)) > 20_000
    )
    descriptions = [text[:20_000] for text in descriptions[:8]]
    # Research-product descriptions are supplied by OpenAIRE; do not claim they
    # are complete author abstracts or fabricate text for missing descriptions.
    product_type = raw.get("type")
    instance_types = [
        str(row.get("type", "")).lower() for row in instances if isinstance(row, dict)
    ]
    kind = (
        "preprint"
        if any("preprint" in value for value in instance_types)
        else "article"
        if any(value in {"article", "journal article"} for value in instance_types)
        else "book"
        if "book" in instance_types
        else None
    )
    return source(
        "openaire",
        identifier,
        "live",
        title=raw.get("mainTitle"),
        authors=[
            row.get("fullName") or " ".join(filter(None, (row.get("name"), row.get("surname"))))
            for row in optional_list(raw.get("authors"))
            if isinstance(row, dict)
        ],
        year=year_from_date(raw.get("publicationDate")),
        venue=(raw.get("container") or {}).get("name") or raw.get("publisher"),
        doi=normalize_doi(doi) if doi else None,
        url=next(
            (safe_link(link) for link in links if safe_link(link)),
            f"https://explore.openaire.eu/search/result?id={quote(identifier, safe='')}",
        ),
        abstract=None,
        description="\n\n".join(descriptions)[:20_000] if descriptions else None,
        descriptions=descriptions,
        resource_type=kind,
        content_origin="provider_description" if descriptions else "provider_metadata",
        provider_resource_type=product_type,
        attribution="OpenAIRE Graph (CC-BY)",
        warnings=["OpenAIRE descriptions may differ from a complete author abstract."]
        if descriptions
        else [],
        truncated_fields=["description", "descriptions"] if descriptions_truncated else [],
    )


def unpaywall_access(raw: dict, requested_doi: str) -> dict:
    doi = normalize_doi(raw.get("doi") or "")
    if doi != normalize_doi(requested_doi) or type(raw.get("is_oa")) is not bool:
        raise ProviderError(
            "UPSTREAM_SCHEMA", "Unpaywall access response does not match the requested DOI."
        )

    def location(raw_location):
        if not isinstance(raw_location, dict):
            return None
        result = {
            key: raw_location.get(key)
            for key in ("version", "license", "host_type", "evidence", "is_best")
            if raw_location.get(key) is not None
        }
        result.update(
            {
                key: safe_link(raw_location.get(key))
                for key in ("url", "url_for_pdf", "url_for_landing_page")
                if safe_link(raw_location.get(key))
            }
        )
        return (
            result
            if any(key in result for key in ("url", "url_for_pdf", "url_for_landing_page"))
            else None
        )

    rows = raw.get("oa_locations") or []
    if not isinstance(rows, list):
        raise ProviderError("UPSTREAM_SCHEMA", "Unpaywall locations must be a list.")
    locations = [normalized for row in rows[:20] if (normalized := location(row))]
    record = {
        "doi": doi,
        "provider": "unpaywall",
        "mode": "live",
        "is_oa": raw["is_oa"],
        "oa_status": raw.get("oa_status"),
        "best_oa_location": location(raw.get("best_oa_location")),
        "oa_locations": locations,
        "locations_truncated": len(rows) > 20,
        "truncated_locations": max(0, len(rows) - 20),
        "locations_total": len(rows),
        "warnings": ["OA locations were limited to the first twenty supplied locations."]
        if len(rows) > 20
        else [],
    }
    record["version"] = hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()[:20]
    record["observed_at"] = datetime.now(UTC).isoformat()
    return record


def datacite_record(data: dict) -> dict:
    raw = data.get("attributes", {})
    publisher = raw.get("publisher")
    return source(
        "datacite",
        normalize_doi(raw.get("doi") or data.get("id", "")),
        "live",
        title=next((t.get("title") for t in raw.get("titles", []) if t.get("title")), None),
        authors=[
            a.get("name") or " ".join(filter(None, (a.get("givenName"), a.get("familyName"))))
            for a in raw.get("creators", [])
        ],
        year=raw.get("publicationYear"),
        venue=publisher.get("name") if isinstance(publisher, dict) else publisher,
        doi=normalize_doi(raw.get("doi") or data.get("id", "")),
        url=raw.get("url"),
        abstract=next(
            (
                plain(a.get("description"))
                for a in raw.get("descriptions", [])
                if a.get("descriptionType") == "Abstract"
            ),
            None,
        ),
        resource_type=(raw.get("types") or {}).get("resourceTypeGeneral"),
        version_relationships=raw.get("relatedIdentifiers", []),
    )
