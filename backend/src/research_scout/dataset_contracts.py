"""Dataset catalog contracts stay separate from scholarly provider identities."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .contracts import fingerprint

DatasetProvider = Literal["hugging_face", "datacite"]


class DatasetSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conversation_id: str = Field(min_length=1, max_length=128)
    turn_id: str = Field(min_length=1, max_length=128)
    providers: list[DatasetProvider] = Field(
        default_factory=lambda: ["hugging_face", "datacite"], min_length=1, max_length=2
    )
    limit: int = Field(default=10, ge=1, le=20, strict=True)
    idempotency_key: str = Field(min_length=1, max_length=128)


class DatasetCatalogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str = Field(min_length=1, max_length=128)
    operation_id: str = Field(min_length=1, max_length=200, pattern=r"^[\w.:-]+$")
    query: str = Field(min_length=1, max_length=400)
    keywords: list[Annotated[str, Field(max_length=160)]] = Field(
        default_factory=list, max_length=12
    )
    limit: int = Field(default=10, ge=1, le=20, strict=True)
    remaining_attempts: int = Field(default=1, ge=0, le=1, strict=True)
    year_from: int | None = Field(default=None, ge=1000, le=2200)
    year_to: int | None = Field(default=None, ge=1000, le=2200)


class DatasetRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dataset_id: str = Field(min_length=64, max_length=64)
    source_ref: str = Field(min_length=3, max_length=600)
    provider: DatasetProvider
    record_id: str = Field(min_length=1, max_length=500)
    resource_type: Literal["dataset"]
    version: str | None = Field(default=None, max_length=500)
    observed_at: str
    mode: Literal["fixture", "live"]
    title: str | None = Field(default=None, max_length=5000)
    description: str | None = Field(default=None, max_length=20000)
    description_truncated: bool | None = Field(default=None, strict=True)
    description_truncation_reason: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=4000)
    doi: str | None = Field(default=None, max_length=500)
    authors: list[str] = Field(default_factory=list, max_length=100)
    publisher: str | None = Field(default=None, max_length=2000)
    catalog_owner: str | None = Field(default=None, max_length=500)
    year: int | None = None
    year_basis: Literal["catalog_created", "publication"] | None = None
    tags: list[str] = Field(default_factory=list, max_length=40)
    tasks: list[str] = Field(default_factory=list, max_length=40)
    license: str | None = Field(default=None, max_length=2000)
    access: dict
    relationships: list[dict] = Field(default_factory=list, max_length=30)
    formats: list[str] = Field(default_factory=list, max_length=40)
    sizes: list[str] = Field(default_factory=list, max_length=40)
    variables: list = Field(default_factory=list, max_length=0)
    languages: list[str] = Field(default_factory=list, max_length=40)
    size_categories: list[str] = Field(default_factory=list, max_length=40)
    coverage_dates: list[dict] = Field(default_factory=list, max_length=20)
    resource_dates: list[dict] = Field(default_factory=list, max_length=20)
    geography: list[dict] = Field(default_factory=list, max_length=20)
    metadata_url: str | None = Field(default=None, max_length=4000)
    content_origin: Literal["provider_metadata"] = "provider_metadata"
    profile_state: Literal["discovered"] = "discovered"
    warnings: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def identity(self):
        from urllib.parse import urlsplit

        if self.source_ref != f"{self.provider}:{self.record_id}" or self.dataset_id != fingerprint(
            [self.provider, self.record_id, self.version]
        ):
            raise ValueError("Dataset identity/version must remain provider-scoped.")
        for value in (self.url, self.metadata_url):
            if value:
                parsed = urlsplit(value)
                if (
                    parsed.scheme not in {"http", "https"}
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                ):
                    raise ValueError("Dataset locations must be public HTTP(S) metadata links.")
        if self.access.get("status") not in {"public", "gated", "restricted", "unknown"}:
            raise ValueError("Unknown dataset access state.")
        return self
