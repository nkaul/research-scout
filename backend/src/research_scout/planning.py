"""Shared model-authored problem understanding and resource-query provenance."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .contracts import fingerprint

PLANNING_POLICY = "scout-agentic-retrieval-v7"
PLAN_FIELDS = (
    "intent",
    "domain",
    "intent_frame",
    "tags",
    "lexical_query",
    "semantic_query",
    "query_terms",
    "required_facets",
    "optional_facets",
    "assumptions",
    "resource_queries",
    "context_expansion",
)


class PlanningModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ResourceQuery(PlanningModel):
    lexical_query: str = Field(min_length=3, max_length=200)
    semantic_query: str = Field(min_length=3, max_length=400)
    query_terms: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        min_length=1, max_length=6
    )
    rationale: str = Field(min_length=1, max_length=160)

    @field_validator("lexical_query", "semantic_query")
    @classmethod
    def plain_query(cls, value):
        if not value.strip() or any(ord(character) < 32 for character in value):
            raise ValueError("Resource queries must be nonempty plain text.")
        return value.strip()

    @field_validator("query_terms")
    @classmethod
    def nonempty_terms(cls, value):
        if any(
            not term.strip() or any(ord(character) < 32 for character in term) for term in value
        ):
            raise ValueError("Resource keywords must contain nonempty plain text.")
        return [term.strip() for term in value]


class ResourceQueries(PlanningModel):
    papers: ResourceQuery
    videos: ResourceQuery
    datasets: ResourceQuery
    repos: ResourceQuery


class InformationGap(PlanningModel):
    topic: str = Field(min_length=1, max_length=80)
    question: str = Field(min_length=3, max_length=200)
    essential: bool


class ContextExpansion(PlanningModel):
    interpreted_question: str = Field(min_length=3, max_length=500)
    domain_basis: Literal["explicit", "inferred", "ambiguous"]
    inferred_context: list[Annotated[str, Field(min_length=1, max_length=240)]] = Field(
        max_length=3
    )
    missing_information: list[InformationGap] = Field(max_length=3)


def shared_plan_fingerprint(plan):
    """Provider repairs and progress fields are deliberately outside this identity."""
    return fingerprint({key: plan.get(key) for key in PLAN_FIELDS})


def validated_shared_plan(retrieval):
    if retrieval.get("needs_clarification") or retrieval.get("status") == "clarification_needed":
        raise ValueError(
            "Resolve the saved clarification in a new AI-refined topic search before finding resources."
        )
    marker = retrieval.get("shared_plan") or {}
    if (
        marker.get("policy") != PLANNING_POLICY
        or marker.get("model_step") != "plan"
        or marker.get("fingerprint") != shared_plan_fingerprint(retrieval)
    ):
        raise ValueError(
            "Start a new AI-refined topic search to create resource-specific queries. This historical search has no validated shared resource plan; its saved results remain available."
        )
    resources = ResourceQueries.model_validate(retrieval.get("resource_queries"))
    expansion = ContextExpansion.model_validate(retrieval.get("context_expansion"))
    if expansion.domain_basis == "ambiguous" or any(
        gap.essential for gap in expansion.missing_information
    ):
        raise ValueError(
            "Answer the essential clarification in a new AI-refined topic search before finding resources."
        )
    return resources, expansion


def generation_research_context(conversation_id, turn):
    """Task interpretation is background, never an extra scientific evidence source."""
    retrieval = turn.get("retrieval") or {}
    if not turn.get("agentic") or turn.get("action") != "discover":
        return None
    try:
        _, expansion = validated_shared_plan(retrieval)
    except ValueError:
        return None
    return {
        "origin": "saved_model_shared_plan",
        "conversation_id": conversation_id,
        "turn_id": turn["id"],
        "plan_fingerprint": retrieval["shared_plan"]["fingerprint"],
        "original_question": turn["message"],
        "intent": retrieval["intent"],
        "domain": retrieval["domain"],
        "intent_frame": retrieval["intent_frame"],
        "keywords": retrieval["query_terms"],
        "tags": retrieval["tags"],
        "assumptions": retrieval["assumptions"],
        "context_expansion": expansion.model_dump(),
        "evidence_status": "task_background_only_not_citable",
    }
