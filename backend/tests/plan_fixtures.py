"""Explicit authored shared-plan doubles, never live model quality evidence."""

import copy

from research_scout.planning import PLANNING_POLICY, shared_plan_fingerprint

RESOURCE_QUERIES = {
    "papers": {
        "lexical_query": "context selection language models",
        "semantic_query": "How does evidence context selection affect language model answers?",
        "query_terms": ["language models", "context selection"],
        "rationale": "Find studies of the context intervention.",
    },
    "videos": {
        "lexical_query": "language model context engineering tutorial",
        "semantic_query": "Video demonstrations of context engineering for language models",
        "query_terms": ["context engineering", "tutorial"],
        "rationale": "Find useful demonstrations rather than paper titles.",
    },
    "datasets": {
        "lexical_query": "question answering retrieval evaluation",
        "semantic_query": "Datasets for evaluating evidence retrieval in language model question answering",
        "query_terms": ["question answering", "retrieval"],
        "rationale": "Find catalog metadata for retrieval evaluation data.",
    },
    "repos": {
        "lexical_query": "retrieval augmented generation library",
        "semantic_query": "Public code implementing evidence retrieval and context selection for language models",
        "query_terms": ["retrieval augmented generation", "library"],
        "rationale": "Find implementation repositories with inspectable README evidence.",
    },
}
CONTEXT_EXPANSION = {
    "interpreted_question": "How does selecting useful context affect language model generation?",
    "domain_basis": "inferred",
    "inferred_context": [
        "Generation is interpreted as language model output; this is an assumption."
    ],
    "missing_information": [
        {
            "topic": "Evaluation task",
            "question": "Which generation task should evaluation focus on?",
            "essential": False,
        }
    ],
}


def saved_shared_plan(retrieval):
    plan = copy.deepcopy(retrieval)
    plan.setdefault(
        "intent_frame",
        {
            "object_of_change": "Context supplied to a language model",
            "intervention": "Select useful evidence",
            "desired_outcome": "Better generated answers",
            "boundary": "Context selection rather than model architecture",
        },
    )
    plan.setdefault("query_terms", list(plan.get("keywords") or ["retrieval", "language models"]))
    plan.setdefault("required_facets", [])
    plan.setdefault("optional_facets", [])
    plan.setdefault("assumptions", ["Generation refers to language model answers"])
    plan.setdefault("semantic_query", "How does retrieval improve context for language models?")
    plan["resource_queries"] = copy.deepcopy(RESOURCE_QUERIES)
    plan["context_expansion"] = copy.deepcopy(CONTEXT_EXPANSION)
    plan["shared_plan"] = {
        "policy": PLANNING_POLICY,
        "model_step": "plan",
        "fingerprint": shared_plan_fingerprint(plan),
    }
    return plan
