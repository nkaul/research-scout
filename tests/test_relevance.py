"""Authored structural ranking regressions, not a live relevance benchmark."""

import copy

import pytest

from research_scout.relevance import POLICY_VERSION, rank_candidates

QUERY = "What's the impact of how we improve the context model needs to have for better generation?"
PLAN = {
    "query": QUERY,
    "query_terms": [
        "context engineering",
        "language model",
        "generation",
        "retrieval augmented generation",
    ],
    "required_facets": [
        {
            "name": "language models",
            "terms": ["large language model", "LLM", "language model", "大语言模型"],
        },
        {
            "name": "context engineering",
            "terms": [
                "context engineering",
                "context window",
                "retrieval augmented generation",
                "上下文工程",
            ],
        },
    ],
    "optional_facets": [
        {"name": "generation quality", "terms": ["generation quality", "faithfulness", "accuracy"]}
    ],
}


def record(identifier, title=None, abstract=None, *, description=None, rrf=0.01):
    return {
        "source_ref": f"test:{identifier}",
        "provider": "test",
        "version": "original-v1",
        "title": title,
        "abstract": abstract,
        "description": description,
        "rank_score": rrf,
    }


def test_intent_facets_demote_generic_generation_model_hard_negatives():
    records = [
        record(
            "pharmacy",
            "The Seventh Generation Pharmacist",
            "A context model for improving community pharmacy education.",
            rrf=0.04,
        ),
        record(
            "covid",
            "Understanding better models of COVID-19 impact",
            "Population models improve pandemic generation forecasts.",
            rrf=0.03,
        ),
        record(
            "llm",
            "Context engineering for large language models",
            "Retrieval augmented generation improves generation quality and faithfulness.",
            rrf=0.005,
        ),
        record(
            "geology",
            "Using data to improve model generation",
            "Oil production reservoir modeling.",
            rrf=0.02,
        ),
    ]
    ranked = rank_candidates(records, PLAN)
    assert ranked[0]["source_ref"] == "test:llm"
    assert ranked[0]["relevance"]["facet_tier"] == 2
    assert ranked[0]["relevance"]["matched_required_facets"] == [
        "language models",
        "context engineering",
    ]
    assert all(item["relevance"]["facet_tier"] < 2 for item in ranked[1:])
    assert len(ranked) == len(records)  # Demotion is not candidate exclusion.


def test_clinical_language_model_context_is_not_excluded_by_domain():
    records = [
        record(
            "clinical",
            "Retrieval-augmented generation for clinical large language models",
            "Context engineering for faithful medical answers.",
        ),
        record(
            "plain",
            "Clinical treatment guidance",
            "Medication dosage and patient education.",
            rrf=0.1,
        ),
    ]
    assert rank_candidates(records, PLAN)[0]["source_ref"] == "test:clinical"
    medical_plan = {
        "query": "pharmacist medication safety",
        "required_facets": [
            {"name": "medication", "terms": ["medication", "pharmacist"]},
            {"name": "safety", "terms": ["safety", "adverse drug event"]},
        ],
    }
    medical = [
        record("medical", "Pharmacist medication safety", "Reducing adverse drug events."),
        record("llm", "Language model context engineering", "Generation model architecture."),
    ]
    assert rank_candidates(medical, medical_plan)[0]["source_ref"] == "test:medical"


def test_title_weight_and_saturated_frequency_resist_generic_keyword_stuffing():
    plan = {"query": "context engineering", "query_terms": ["context engineering"]}
    ranked = rank_candidates(
        [
            record("stuffing", "General note", "context engineering " * 1000),
            record("specific", "Context engineering", "Practical methods."),
        ],
        plan,
    )
    assert ranked[0]["source_ref"] == "test:specific"
    assert "abstract" in ranked[1]["relevance"]["truncated_fields"]


def test_description_is_evidence_without_fabricating_an_abstract():
    item = rank_candidates(
        [
            record(
                "description",
                "Research product",
                description="Context engineering for LLM generation quality.",
            )
        ],
        PLAN,
    )[0]
    assert item["abstract"] is None and item["description"]
    assert item["relevance"]["matched_fields"]["context engineering"] == ["description"]
    assert item["relevance"]["supporting_text_available"] is True
    assert "abstract" in item["relevance"]["missing_content"]


def test_multilingual_literal_facets_and_acronyms_use_word_boundaries():
    ranked = rank_candidates(
        [
            record("unrelated", "Language chair design", "Air ventilation design."),
            record("chinese", "LLM上下文工程与大语言模型", "改善生成质量"),
        ],
        PLAN,
    )
    assert ranked[0]["source_ref"] == "test:chinese"
    assert ranked[0]["relevance"]["facet_tier"] == 2
    assert ranked[1]["relevance"]["matched_required_facets"] == []
    acronym = {"query": "AI", "required_facets": [{"name": "AI", "terms": ["AI"]}]}
    assert (
        rank_candidates([record("chair", "Chair repair"), record("ai", "AI research")], acronym)[0][
            "source_ref"
        ]
        == "test:ai"
    )


def test_missing_content_is_disclosed_and_does_not_turn_into_an_exclusion():
    ranked = rank_candidates(
        [record("empty"), record("title", "Context engineering for LLMs")], PLAN
    )
    assert len(ranked) == 2 and ranked[0]["source_ref"] == "test:title"
    empty = ranked[1]["relevance"]
    assert empty["score"] == 0 and empty["missing_content"] == ["title", "abstract", "description"]
    assert empty["missing_required_facets"] == ["language models", "context engineering"]
    assert empty["required_facets_are_hard_filters"] is False


def test_plural_acronyms_normalize_without_a_subject_domain_rule():
    item = rank_candidates([record("llm", "Context engineering for LLMs")], PLAN)[0]
    assert item["relevance"]["facet_tier"] == 2
    plan = {"query": "SNP", "required_facets": [{"name": "genetics", "terms": ["SNP"]}]}
    assert (
        rank_candidates([record("snp", "Associations between SNPs")], plan)[0]["relevance"][
            "facet_tier"
        ]
        == 2
    )


def test_rrf_only_breaks_equal_local_scores_and_original_data_is_immutable():
    records = [
        record("lower", "Context engineering for LLM", rrf=0.01),
        record("higher", "Context engineering for LLM", rrf=0.03),
    ]
    original, original_plan = copy.deepcopy(records), copy.deepcopy(PLAN)
    ranked = rank_candidates(records, PLAN)
    assert ranked[0]["source_ref"] == "test:higher"
    assert ranked[0]["rank_score"] == 0.03 and ranked[0]["relevance"]["rrf_tie_break_score"] == 0.03
    assert records == original and PLAN == original_plan
    ranked[0]["title"] = "Changed copied title"
    assert records == original


def test_no_terms_empty_cohort_and_unknown_review_references_are_safe():
    assert rank_candidates([], {"query": "anything"}) == []
    plan = {"query": "", "assessments": {"foreign:unknown": {"score": 100}}}
    ranked = rank_candidates([record("low", rrf=0.01), record("high", rrf=0.02)], plan)
    assert [item["source_ref"] for item in ranked] == ["test:high", "test:low"]
    assert all(item["relevance"]["score"] == 0 for item in ranked)
    assert all(item["relevance"]["policy_version"] == POLICY_VERSION for item in ranked)


@pytest.mark.parametrize(
    "records,plan",
    [
        ([record("same"), record("same")], {"query": "test"}),
        ([{"title": "Unknown reference"}], {"query": "test"}),
        ([record(str(index)) for index in range(41)], {"query": "test"}),
        ([record("one"), {"source_ref": "another:two", "provider": "another"}], {"query": "test"}),
        ([record("one")], {"query": "test", "required_facets": [{"name": "bad", "terms": []}]}),
    ],
)
def test_rejects_unbounded_or_ambiguous_inputs(records, plan):
    with pytest.raises(ValueError):
        rank_candidates(records, plan)
