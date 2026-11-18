"""Separate public repository discovery contracts; no source-code execution."""

import math
import re
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .contracts import fingerprint

DEFAULT_REPO_COUNT = 10
MAX_REPO_COUNT = 20
MAX_READMES = 5
MAX_REPO_REQUESTS = 1 + 2 * MAX_READMES


class RepoSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conversation_id: str = Field(min_length=1, max_length=128)
    turn_id: str = Field(min_length=1, max_length=128)
    limit: int = Field(default=DEFAULT_REPO_COUNT, ge=1, le=MAX_REPO_COUNT, strict=True)
    idempotency_key: str = Field(min_length=1, max_length=128)


class RepoOperationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str = Field(min_length=1, max_length=128)
    operation_id: str = Field(min_length=1, max_length=200, pattern=r"^[\w.:-]+$")
    query: str = Field(min_length=1, max_length=400)
    keywords: list[Annotated[str, Field(max_length=160)]] = Field(
        default_factory=list, max_length=12
    )
    tags: list[Annotated[str, Field(max_length=60)]] = Field(default_factory=list, max_length=8)
    intent: str = Field(default="", max_length=500)
    domain: str | None = Field(default=None, max_length=160)
    limit: int = Field(default=DEFAULT_REPO_COUNT, ge=1, le=MAX_REPO_COUNT, strict=True)
    remaining_attempts: int = Field(
        default=MAX_REPO_REQUESTS, ge=0, le=MAX_REPO_REQUESTS, strict=True
    )


class RepoRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    repo_id: str
    observation_id: str
    provider: Literal["github"] = "github"
    record_id: str = Field(pattern=r"^\d+$", max_length=30)
    resource_type: Literal["repository"] = "repository"
    full_name: str = Field(min_length=3, max_length=160)
    title: str = Field(min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    url: str
    default_branch: str = Field(max_length=300)
    language: str | None = Field(default=None, max_length=100)
    topics: list[str] = Field(default_factory=list, max_length=30)
    stars: int = Field(ge=0)
    forks: int = Field(ge=0)
    open_issues: int = Field(ge=0)
    license: str | None = Field(default=None, max_length=100)
    archived: bool
    fork: bool
    private: Literal[False]
    updated_at: str | None = None
    pushed_at: str | None = None
    metadata_version: str
    evidence_version: str
    readme: dict
    match: dict
    mode: Literal["fixture", "live"]
    observed_at: str

    @model_validator(mode="before")
    @classmethod
    def explicit_public(cls, value):
        if isinstance(value, dict) and value.get("private") is not False:
            raise ValueError("A repository observation must explicitly declare private=false.")
        return value

    @model_validator(mode="after")
    def bound_origin(self):
        from .repo_evidence import valid_full_name, version_repository

        if (
            not valid_full_name(self.full_name)
            or self.repo_id != f"github:{self.record_id}"
            or self.url != f"https://github.com/{self.full_name}"
        ):
            raise ValueError(
                "Repository identity must be an explicitly public canonical GitHub record."
            )
        versioned = version_repository(self.model_dump())
        if (
            self.evidence_version != versioned["evidence_version"]
            or self.observation_id != versioned["observation_id"]
        ):
            raise ValueError("Repository evidence version does not match its source observation.")
        readme = dict(self.readme)
        # Transport never publishes reader text into source snapshots/model context.
        readme.pop("_source_artifact", None)
        self.readme = readme
        if readme.get("status") not in {
            "pending",
            "available",
            "missing",
            "not_assessed",
            "blocked",
            "error",
        }:
            raise ValueError("Unknown README inspection status.")
        evidence = readme.get("evidence", [])
        if readme.get("artifact_available") is not None:
            from .repo_reading import SOURCE_POLICY

            if (
                type(readme["artifact_available"]) is not bool
                or readme["artifact_available"]
                and (
                    readme.get("status") != "available"
                    or readme.get("repository_id_revalidated") is not True
                    or readme.get("artifact_id")
                    != fingerprint([self.record_id, self.evidence_version, SOURCE_POLICY])
                )
            ):
                raise ValueError("README reader reference must match its verified observation.")
        if not isinstance(evidence, list) or len(evidence) > 8:
            raise ValueError("Repository evidence exceeds its bound.")
        if type(readme.get("truncated")) is not bool:
            raise ValueError("README truncation must be explicit.")
        sha = readme.get("sha")
        if readme["status"] == "available":
            if readme.get("repository_id_revalidated") is not True or not isinstance(
                readme.get("identity_checked_at"), str
            ):
                raise ValueError(
                    "README evidence requires a fresh public numeric repository ID check."
                )
            if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", sha):
                raise ValueError("README version must be a Git blob SHA.")
            if (
                readme.get("source_url")
                != f"https://api.github.com/repos/{self.full_name}/git/blobs/{sha}"
            ):
                raise ValueError("README source must match its repository and immutable blob.")
        elif evidence or sha or readme.get("source_url"):
            raise ValueError("Unfinished README observations cannot assert source evidence.")
        web_url = readme.get("web_url")
        if web_url is not None:
            parsed = urlsplit(web_url)
            if (
                parsed.scheme != "https"
                or parsed.netloc != "github.com"
                or not parsed.path.startswith(f"/{self.full_name}/blob/")
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("README web link must be the bound current GitHub file.")
        for item in evidence:
            if (
                not isinstance(item, dict)
                or not isinstance(item.get("id"), str)
                or len(item["id"]) > 160
            ):
                raise ValueError("README evidence ID is invalid.")
            if (
                not isinstance(item.get("text"), str)
                or not 1 <= len(item["text"]) <= 700
                or not isinstance(item.get("section"), str)
                or len(item["section"]) > 160
            ):
                raise ValueError("README evidence text exceeds its bound.")
            if (
                item.get("source_sha") != sha
                or item.get("source_url") != readme.get("source_url")
                or item.get("coordinate_basis") != "original_markdown_lines"
            ):
                raise ValueError(
                    "README evidence must retain the exact source blob and coordinates."
                )
            start, end = item.get("start_line"), item.get("end_line")
            if (
                type(start) is not int
                or type(end) is not int
                or not 1 <= start <= end <= 262144
                or type(item.get("truncated")) is not bool
            ):
                raise ValueError("README source-line range is invalid.")
        score = self.match.get("score")
        if (
            self.match.get("status") not in {"candidate", "unknown"}
            or type(score) not in {int, float}
            or not math.isfinite(score)
            or score < 0
        ):
            raise ValueError("Repository match score/status is invalid.")
        return self
