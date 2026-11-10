"""Small, versioned application contracts; upstream clients never belong here."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Provider = Literal[
    "openalex", "semantic_scholar", "crossref", "datacite", "arxiv", "openaire", "europe_pmc"
]
DiscoveryProvider = Literal[
    "openalex", "semantic_scholar", "crossref", "arxiv", "openaire", "europe_pmc"
]


def now() -> str:
    return datetime.now(UTC).isoformat()


def fingerprint(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year_from: int | None = Field(default=None, ge=1000, le=2100)
    year_to: int | None = Field(default=None, ge=1000, le=2100)
    resource_type: Literal["article", "preprint", "book", "book-chapter"] | None = None

    @model_validator(mode="after")
    def check_range(self):
        if self.year_from is not None and self.year_to is not None:
            if self.year_from > self.year_to:
                raise ValueError("The starting year must not exceed the ending year.")
        return self


class ResearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=3, max_length=2000)
    provider: DiscoveryProvider = "openalex"
    filters: Filters = Field(default_factory=Filters)
    idempotency_key: str = Field(min_length=1, max_length=128)

    @field_validator("question")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Enter a research question of at least three characters.")
        return value

    @model_validator(mode="after")
    def context_support(self):
        from .agents.context import validate_input_support

        validate_input_support(self.question, self.filters.model_dump(exclude_none=True))
        return self


class SourceRecord(BaseModel):
    """Provider-authored observation; generated annotations are stored separately."""

    model_config = ConfigDict(extra="ignore")
    source_ref: str = Field(min_length=3, max_length=600)
    provider: Provider
    record_id: str = Field(min_length=1, max_length=500)
    title: str | None = Field(default=None, max_length=5000)
    authors: list[str] = Field(default_factory=list, max_length=1000)
    year: int | None = None
    venue: str | None = Field(default=None, max_length=2000)
    doi: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=4000)
    abstract: str | None = Field(default=None, max_length=20000)
    description: str | None = Field(default=None, max_length=20000)
    descriptions: list[str] = Field(default_factory=list, max_length=8)
    published_at: str | None = Field(default=None, max_length=100)
    updated_at: str | None = Field(default=None, max_length=100)
    version_relationships: list[dict] = Field(default_factory=list, max_length=20)
    provider_identifiers: dict[str, str] = Field(default_factory=dict)
    resource_type: str | None = Field(default=None, max_length=100)
    observed_at: str
    version: str = Field(min_length=1, max_length=128)
    mode: Literal["fixture", "live"]
    branch_ranks: dict[str, int] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    truncated_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    query_provenance: dict = Field(default_factory=dict)
    requested_filters: dict = Field(default_factory=dict)
    content_origin: str = "provider_metadata"
    content_state: Literal["metadata", "abstract", "description"] = "metadata"
    metadata_status: str = "provider_supplied"
    is_retracted: bool | None = None
    fictional: bool = False

    @field_validator("descriptions")
    @classmethod
    def bounded_descriptions(cls, value):
        if any(len(item) > 20000 for item in value):
            raise ValueError("Provider descriptions exceed the source envelope.")
        return value

    @field_validator("provider_identifiers")
    @classmethod
    def bounded_identifiers(cls, value):
        if len(value) > 20 or any(len(key) > 100 or len(item) > 500 for key, item in value.items()):
            raise ValueError("Provider identifiers exceed the source envelope.")
        return value

    @model_validator(mode="after")
    def validate_origin(self):
        if self.source_ref != f"{self.provider}:{self.record_id}":
            raise ValueError("Source identity must be provider-scoped.")
        if self.url and not self.url.startswith(("https://", "http://")):
            raise ValueError("Source links must use HTTP or HTTPS.")
        if any(k not in {"lexical", "semantic"} or v < 1 for k, v in self.branch_ranks.items()):
            raise ValueError("Invalid branch rank.")
        datetime.fromisoformat(self.observed_at.replace("Z", "+00:00"))
        return self


class SelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    state: Literal["included", "excluded"]
    reason: str = Field(default="", max_length=2000)
    expected_revision: int = Field(ge=0)
    citation_source: Literal["discovery", "registry"] | None = None


class AccessLocation(BaseModel):
    """Provider-supplied OA location metadata; fetching its URL is not an operation here."""

    model_config = ConfigDict(extra="ignore")
    url: str | None = Field(default=None, max_length=4000)
    url_for_pdf: str | None = Field(default=None, max_length=4000)
    url_for_landing_page: str | None = Field(default=None, max_length=4000)
    license: str | None = Field(default=None, max_length=500)
    version: str | None = Field(default=None, max_length=100)
    host_type: str | None = Field(default=None, max_length=100)
    evidence: str | None = Field(default=None, max_length=500)
    is_best: bool | None = None

    @field_validator("url", "url_for_pdf", "url_for_landing_page")
    @classmethod
    def safe_url(cls, value):
        if value is not None:
            parsed = urlsplit(value)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
            ):
                raise ValueError("Access links must be credential-free HTTP or HTTPS URLs.")
        return value


class AccessObservation(BaseModel):
    """OA availability is distinct from a scientific record or abstract."""

    model_config = ConfigDict(extra="ignore")
    provider: Literal["unpaywall"] = "unpaywall"
    doi: str = Field(min_length=5, max_length=500)
    is_oa: bool = Field(strict=True)
    oa_status: str = Field(min_length=1, max_length=100)
    best_oa_location: AccessLocation | None = None
    oa_locations: list[AccessLocation] = Field(default_factory=list, max_length=20)
    observed_at: str
    version: str = Field(min_length=1, max_length=128)
    mode: Literal["fixture", "live"]
    warnings: list[str] = Field(default_factory=list, max_length=20)
    truncated_locations: int = Field(default=0, ge=0)

    @field_validator("observed_at")
    @classmethod
    def timestamp(cls, value):
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value


class ConversationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    routing: Literal["auto", "manual"] = "auto"
    providers: list[DiscoveryProvider] | None = Field(default=None, min_length=1, max_length=2)
    filters: Filters = Field(default_factory=Filters)

    @model_validator(mode="before")
    @classmethod
    def infer_legacy_manual(cls, value):
        if (
            isinstance(value, dict)
            and value.get("providers") is not None
            and "routing" not in value
        ):
            return {**value, "routing": "manual"}
        return value

    @model_validator(mode="after")
    def provider_selection(self):
        if self.routing == "auto" and self.providers is not None:
            raise ValueError("Automatic routing selects sources; omit the manual provider list.")
        return self

    @field_validator("providers")
    @classmethod
    def unique_providers(cls, value):
        if value is not None and len(value) != len(set(value)):
            raise ValueError("Select each discovery provider once.")
        return value


class TurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=3, max_length=2000)
    action: Literal["discover", "saved", "lookup", "access", "generate"] = "discover"
    routing: Literal["auto", "manual"] | None = None
    providers: list[DiscoveryProvider] | None = Field(default=None, min_length=1, max_length=2)
    filters: Filters | None = None
    idempotency_key: str = Field(min_length=1, max_length=128)
    expected_revision: int = Field(ge=0)
    run_id: str | None = Field(default=None, max_length=128)
    source_ref: str | None = Field(default=None, max_length=600)
    agentic: bool = False

    @model_validator(mode="after")
    def provider_selection(self):
        if self.routing == "auto" and self.providers is not None:
            raise ValueError("Automatic routing selects sources; omit the manual provider list.")
        return self

    @field_validator("message")
    @classmethod
    def supported_message(cls, value):
        value = value.strip()
        if len(value) < 3 or len(value.encode()) > 2000:
            raise ValueError("Enter 3–2,000 characters and at most 2,000 UTF-8 bytes.")
        return value

    @field_validator("providers")
    @classmethod
    def unique_providers(cls, value):
        if value is not None and len(value) != len(set(value)):
            raise ValueError("Select each discovery provider once.")
        return value


def filter_record(record: dict, filters: dict) -> tuple[bool, list[str]]:
    """Unknown required metadata is never silently treated as a match."""
    reasons: list[str] = []
    year = record.get("year")
    for key, compare in (("year_from", lambda a, b: a >= b), ("year_to", lambda a, b: a <= b)):
        boundary = filters.get(key)
        if boundary is not None:
            if year is None:
                reasons.append(f"{key}: required publication year is unknown")
            elif not compare(year, boundary):
                reasons.append(f"{key}: publication year does not match")
    kind = filters.get("resource_type")
    if kind and record.get("resource_type") != kind:
        reasons.append("resource_type: missing or does not match")
    return not reasons, reasons


def rank_score(branch_ranks: dict[str, int]) -> float:
    """Uncalibrated equal-weight RRF, k=60; parameters are versioned in each run."""
    return sum(1.0 / (60 + value) for value in branch_ranks.values())
