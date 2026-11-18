"""Bounded query-aware lexical reranking over saved same-provider evidence.

The plan supplies intent facets; this module contains no subject-domain blacklist
or language-model client. Scores are versioned heuristics, not probabilities or
scientific relevance judgments. Missing facet text demotes rather than excludes.
"""

from __future__ import annotations

import copy
import math
import re
import unicodedata
from collections import Counter

POLICY_VERSION = "scout-query-relevance-v1"
MAX_RECORDS = 40
MAX_QUERY_TERMS = 48
FIELD_LIMITS = {"title": (1000, 256), "abstract": (8000, 2048), "description": (8000, 2048)}
FIELD_WEIGHTS = {"title": 3.0, "abstract": 1.0, "description": 0.8}
STOPWORDS = frozenset(
    "a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may me more most my of on or our should so than that the their them then there these they this those through to under up us use using was we were what when where which who why will with would you your what's how's".split()
)
_TOKENS = re.compile(r"[^\W_]+", re.UNICODE)
_CJK = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]")


def _tokens(text: str) -> list[str]:
    text = unicodedata.normalize("NFKC", text)
    # Generic plural acronyms (LLMs, SNPs, APIs) retain their singular identity.
    text = re.sub(r"\b([A-Z]{2,})s\b", r"\1", text).casefold()
    text = re.sub(r"(?<=\w)['’]s\b", "", text)
    text = _CJK.sub(lambda match: f" {match.group()} ", text)
    values = []
    for token in _TOKENS.findall(text):
        # A deliberately small English plural normalization, not language detection.
        if token.isascii() and len(token) > 4:
            if token.endswith("ies") and len(token) > 5:
                token = token[:-3] + "y"
            elif token.endswith("s") and not token.endswith(("ss", "us", "is")):
                token = token[:-1]
        values.append(token)
    return values


def _phrase_present(phrase: tuple[str, ...], fields: dict[str, str]) -> list[str]:
    if not phrase:
        return []
    needle = " " + " ".join(phrase) + " "
    return [name for name, text in fields.items() if needle in text]


def _facets(plan: dict, key: str) -> list[dict]:
    values = plan.get(key) or []
    if not isinstance(values, list) or len(values) > 8:
        raise ValueError("Intent facets must be a list of at most eight groups.")
    result, names = [], set()
    for value in values:
        if not isinstance(value, dict):
            raise ValueError("Each intent facet needs a name and literal term aliases.")
        name, terms = value.get("name"), value.get("terms")
        if not isinstance(name, str) or not name.strip() or len(name) > 120 or name in names:
            raise ValueError("Intent facets need distinct bounded names.")
        if (
            not isinstance(terms, list)
            or not 1 <= len(terms) <= 16
            or any(
                not isinstance(term, str) or not term.strip() or len(term) > 160 for term in terms
            )
        ):
            raise ValueError("Each facet needs one to sixteen bounded literal aliases.")
        aliases = [(term, tuple(_tokens(term))) for term in terms]
        if any(not tokens for _, tokens in aliases):
            raise ValueError("Facet aliases need searchable characters.")
        result.append({"name": name, "aliases": aliases})
        names.add(name)
    return result


def _rrf(record: dict) -> float:
    value = record.get("rank_score", 0)
    return (
        float(value)
        if isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value >= 0
        else 0.0
    )


def rank_candidates(records: list[dict], plan: dict) -> list[dict]:
    """Return annotated copies, ordered by facet tier, heuristic score, then RRF.

    `plan` accepts query, optional query_terms, and required_facets/optional_facets
    shaped as [{name, terms:[literal aliases]}]. Additional planner/reviewer fields
    are ignored. Call once per provider; no cross-provider score fusion occurs.
    """
    if not isinstance(records, list) or len(records) > MAX_RECORDS or not isinstance(plan, dict):
        raise ValueError("Rerank at most forty same-provider records with a typed plan.")
    if any(
        not isinstance(record, dict)
        or not isinstance(record.get("source_ref"), str)
        or not record["source_ref"]
        for record in records
    ):
        raise ValueError("Every candidate needs its saved source reference.")
    if len({record["source_ref"] for record in records}) != len(records):
        raise ValueError("Deduplicate saved source references before reranking.")
    if (
        len(
            {record.get("provider") or record["source_ref"].partition(":")[0] for record in records}
        )
        > 1
    ):
        raise ValueError("Reranking is scoped to one provider; keep provider groups separate.")
    required, optional = _facets(plan, "required_facets"), _facets(plan, "optional_facets")
    query = plan.get("query", plan.get("standalone_query", ""))
    if not isinstance(query, str) or len(query) > 4000:
        raise ValueError("A bounded query string is required.")
    supplied = plan.get("query_terms")
    if supplied is None:
        phrases = [token for token in _tokens(query) if token not in STOPWORDS]
    elif (
        not isinstance(supplied, list)
        or len(supplied) > MAX_QUERY_TERMS
        or any(not isinstance(term, str) or len(term) > 160 for term in supplied)
    ):
        raise ValueError("Query terms must be at most forty-eight bounded strings.")
    else:
        phrases = [term for term in supplied if term.strip()]
    unique_phrases = list(dict.fromkeys(phrases))
    phrases = unique_phrases[:MAX_QUERY_TERMS]
    phrase_tokens = [(term, tuple(_tokens(term))) for term in phrases]
    unique_query_tokens = list(
        dict.fromkeys(
            token for _, terms in phrase_tokens for token in terms if token not in STOPWORDS
        )
    )
    query_tokens = unique_query_tokens[:MAX_QUERY_TERMS]
    prepared = []
    for record in records:
        fields, truncated, missing = {}, [], []
        for name, (chars, maximum) in FIELD_LIMITS.items():
            text = record.get(name)
            if not isinstance(text, str) or not text.strip():
                fields[name] = []
                missing.append(name)
                continue
            tokens = _tokens(text[:chars])
            fields[name] = tokens[:maximum]
            if len(text) > chars or len(tokens) > maximum:
                truncated.append(name)
        prepared.append((record, fields, truncated, missing))
    averages = {
        field: max(
            1.0, sum(len(fields[field]) for _, fields, _, _ in prepared) / max(1, len(records))
        )
        for field in FIELD_LIMITS
    }
    frequencies = Counter(
        token
        for _, fields, _, _ in prepared
        for token in set(token for values in fields.values() for token in values)
    )
    ranked = []
    for record, fields, truncated, missing in prepared:
        counts = {name: Counter(tokens) for name, tokens in fields.items()}
        sequences = {name: " " + " ".join(tokens) + " " for name, tokens in fields.items()}
        lexical = 0.0
        matched_tokens = []
        for token in query_tokens:
            if not any(counts[field][token] for field in fields):
                continue
            matched_tokens.append(token)
            idf = math.log(
                1 + (len(records) - frequencies[token] + 0.5) / (frequencies[token] + 0.5)
            )
            for name, count in counts.items():
                tf = count[token]
                if tf:
                    denominator = tf + 1.2 * (1 - 0.65 + 0.65 * len(fields[name]) / averages[name])
                    lexical += FIELD_WEIGHTS[name] * idf * tf * 2.2 / denominator
        matched, absent, matched_fields = [], [], {}
        for term, tokens in phrase_tokens:
            locations = _phrase_present(tokens, sequences)
            if locations:
                matched.append(term)
                matched_fields[term] = locations
            else:
                absent.append(term)
        facet_matches = []
        for kind, facets in (("required", required), ("optional", optional)):
            for facet in facets:
                aliases = [
                    term for term, tokens in facet["aliases"] if _phrase_present(tokens, sequences)
                ]
                facet_matches.append(
                    {
                        "name": facet["name"],
                        "kind": kind,
                        "matched": bool(aliases),
                        "matched_aliases": aliases,
                    }
                )
        covered = {
            kind: [
                item["name"] for item in facet_matches if item["kind"] == kind and item["matched"]
            ]
            for kind in ("required", "optional")
        }
        missing_facets = {
            kind: [
                item["name"]
                for item in facet_matches
                if item["kind"] == kind and not item["matched"]
            ]
            for kind in ("required", "optional")
        }
        required_coverage = len(covered["required"]) / len(required) if required else 0.0
        optional_coverage = len(covered["optional"]) / len(optional) if optional else 0.0
        coverage = len(matched_tokens) / len(query_tokens) if query_tokens else 0.0
        signal = lexical / (lexical + 8.0)
        weights = (
            0.35 if query_tokens else 0,
            0.20 if query_tokens else 0,
            0.35 if required else 0,
            0.10 if optional else 0,
        )
        total = sum(weights)
        score = (
            round(
                100
                * (
                    weights[0] * signal
                    + weights[1] * coverage
                    + weights[2] * required_coverage
                    + weights[3] * optional_coverage
                )
                / total,
                6,
            )
            if total
            else 0.0
        )
        tier = (
            2 if not required or not missing_facets["required"] else 1 if covered["required"] else 0
        )
        result = copy.deepcopy(record)
        result["relevance"] = {
            "policy_version": POLICY_VERSION,
            "score": score,
            "score_kind": "uncalibrated_heuristic_not_probability",
            "facet_tier": tier,
            "matched_terms": matched,
            "missing_terms": absent,
            "matched_fields": matched_fields,
            "matched_required_facets": covered["required"],
            "missing_required_facets": missing_facets["required"],
            "matched_optional_facets": covered["optional"],
            "missing_optional_facets": missing_facets["optional"],
            "facet_evidence": facet_matches,
            "missing_content": missing,
            "supporting_text_available": bool(fields["abstract"] or fields["description"]),
            "evaluated_fields": list(FIELD_LIMITS),
            "truncated_fields": truncated,
            "omitted_query_terms": max(0, len(unique_phrases) - len(phrases)),
            "omitted_query_tokens": max(0, len(unique_query_tokens) - len(query_tokens)),
            "evidence_scope": "available saved title/abstract/description previews; facet absence is not an irrelevance verdict",
            "components": {
                "lexical_bm25_like": round(lexical, 6),
                "query_token_coverage": round(coverage, 6),
                "required_facet_coverage": round(required_coverage, 6),
                "optional_facet_coverage": round(optional_coverage, 6),
            },
            "rrf_tie_break_score": _rrf(record),
            "required_facets_are_hard_filters": False,
        }
        ranked.append(result)
    return sorted(
        ranked,
        key=lambda item: (
            -item["relevance"]["facet_tier"],
            -item["relevance"]["score"],
            -item["relevance"]["rrf_tie_break_score"],
            item["source_ref"],
        ),
    )
