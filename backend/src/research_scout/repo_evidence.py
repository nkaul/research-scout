"""Heading-aware public README excerpts and local sparse repository matching.

Adapted from the reference's evidence-selection principles, not its label classifier.
This bounded Markdown subset deliberately never executes code or renders HTML.
"""

import html
import math
import re
from collections import Counter

from .contracts import fingerprint, now
from .dataset_terms import GENERIC_TERMS, STOPWORDS, informative_tokens, literal_phrase, tokens

PARSER_POLICY = "scout-readme-heading-excerpts-v1"
MATCH_POLICY = "local_bm25_metadata_readme_v1"
MAX_README_BYTES = 262144
EXCLUDED = ("install", "license", "changelog", "contribut", "sponsor", "security", "acknowledge")
SECRET = re.compile(
    r"(?i)(?:api[_ -]?key|token|password|secret)\s*[=:]\s*[^\s,;]+|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}"
)
INSTRUCTION = re.compile(
    r"(?i)ignore (?:all |the )?(?:previous|prior) instructions|reveal.*(?:key|secret)"
)


def valid_full_name(value):
    return (
        isinstance(value, str)
        and bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}", value))
        and value.split("/")[1] not in {".", ".."}
    )


def clean(value, limit=4000):
    value = SECRET.sub("[REDACTED]", str(value or ""))
    value = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", value)
    value = html.unescape(re.sub(r"<[^>]+>", " ", value))
    return " ".join(value.replace("`", "").split())[:limit]


def selected_readme_evidence(raw, *, record_id, sha, source_url):
    if len(raw.encode("utf-8")) > MAX_README_BYTES:
        raise ValueError("README exceeds the decoded byte limit.")
    lines, evidence, paragraph = raw.splitlines(), [], []
    section, enabled, fence, hidden = "Introduction", True, None, None
    truncated = False

    def flush():
        nonlocal truncated
        if not paragraph:
            return
        value = clean(" ".join(line for _, line in paragraph), 20000)
        if len(value) >= 12 and len(evidence) < 8:
            truncated = truncated or len(value) > 700
            evidence.append(
                {
                    "id": f"R{record_id}:{sha[:12]}:E{len(evidence) + 1}",
                    "section": section,
                    "text": value[:700],
                    "start_line": paragraph[0][0],
                    "end_line": paragraph[-1][0],
                    "coordinate_basis": "original_markdown_lines",
                    "source_url": source_url,
                    "source_sha": sha,
                    "truncated": len(value) > 700,
                }
            )
        elif len(evidence) >= 8 and value:
            truncated = True
        paragraph.clear()

    index = 0
    while index < len(lines):
        line, number = lines[index], index + 1
        stripped = line.strip()
        if hidden:
            if hidden in stripped.lower():
                hidden = None
            index += 1
            continue
        if any(marker in stripped.lower() for marker in ("<script", "<style", "<!--")):
            flush()
            hidden = (
                "</script>"
                if "<script" in stripped.lower()
                else "</style>"
                if "<style" in stripped.lower()
                else "-->"
            )
            if hidden in stripped.lower():
                hidden = None
            index += 1
            continue
        marker = re.match(r"^\s*(`{3,}|~{3,})", line)
        if marker:
            flush()
            if fence is None:
                fence = marker.group(1)[0]
            elif marker.group(1)[0] == fence:
                fence = None
            index += 1
            continue
        if fence or line.startswith("    ") or line.startswith("\t") or INSTRUCTION.search(line):
            flush()
            index += 1
            continue
        heading = re.match(r"^ {0,3}#{1,6}\s+(.+?)\s*#*$", line)
        setext = (
            index + 1 < len(lines)
            and bool(re.fullmatch(r" {0,3}(?:=+|-+)\s*", lines[index + 1]))
            and bool(stripped)
        )
        if heading or setext:
            flush()
            section = clean(heading.group(1) if heading else line, 160)
            enabled = not any(value in section.lower() for value in EXCLUDED)
            index += 2 if setext else 1
            continue
        if not stripped:
            flush()
        elif enabled:
            paragraph.append((number, line))
        index += 1
    flush()
    return evidence, truncated


def version_repository(record):
    value = dict(record)
    readme = value["readme"]
    value["evidence_version"] = fingerprint(
        [
            PARSER_POLICY,
            value["metadata_version"],
            readme.get("status"),
            readme.get("sha"),
            readme.get("evidence", []),
            (readme.get("error") or {}).get("code"),
        ]
    )
    value["observation_id"] = fingerprint(["github", value["record_id"], value["evidence_version"]])
    return value


def normalize_repository(row, mode):
    identity, full_name = row.get("id"), row.get("full_name")
    if (
        type(identity) is not int
        or identity <= 0
        or row.get("private") is not False
        or not valid_full_name(full_name)
    ):
        return None
    if (
        row.get("visibility") not in {None, "public"}
        or row.get("html_url") != f"https://github.com/{full_name}"
    ):
        return None
    license_value = row.get("license") if isinstance(row.get("license"), dict) else {}
    license_id = license_value.get("spdx_id")
    value = {
        "repo_id": f"github:{identity}",
        "record_id": str(identity),
        "provider": "github",
        "resource_type": "repository",
        "full_name": full_name,
        "title": full_name,
        "description": clean(row.get("description")) or None,
        "url": f"https://github.com/{full_name}",
        "default_branch": clean(row.get("default_branch") or "", 300),
        "language": clean(row.get("language"), 100) or None,
        "topics": [
            clean(item, 100) for item in (row.get("topics") or [])[:30] if isinstance(item, str)
        ],
        "stars": max(0, row.get("stargazers_count"))
        if type(row.get("stargazers_count")) is int
        else 0,
        "forks": max(0, row.get("forks_count")) if type(row.get("forks_count")) is int else 0,
        "open_issues": max(0, row.get("open_issues_count"))
        if type(row.get("open_issues_count")) is int
        else 0,
        "license": license_id if isinstance(license_id, str) and len(license_id) <= 100 else None,
        "archived": row.get("archived") is True,
        "fork": row.get("fork") is True,
        "private": False,
        "updated_at": row.get("updated_at") if isinstance(row.get("updated_at"), str) else None,
        "pushed_at": row.get("pushed_at") if isinstance(row.get("pushed_at"), str) else None,
        "mode": mode,
        "observed_at": now(),
        "readme": {
            "status": "not_assessed",
            "sha": None,
            "source_url": None,
            "web_url": None,
            "path": None,
            "evidence": [],
            "truncated": False,
            "parser_policy": PARSER_POLICY,
        },
        "match": {},
    }
    value["metadata_version"] = fingerprint(
        {
            key: value[key]
            for key in (
                "record_id",
                "full_name",
                "description",
                "default_branch",
                "language",
                "topics",
                "stars",
                "forks",
                "open_issues",
                "license",
                "archived",
                "fork",
                "updated_at",
                "pushed_at",
            )
        }
    )
    return version_repository(value)


def github_query(query, keywords):
    phrases = re.findall(r'"([^"\n]+)"', query)
    unquoted = re.sub(r'"[^"\n]+"', " ", query)
    candidates = [*phrases, literal_phrase(unquoted)] if phrases else [literal_phrase(query)]
    if not any(informative_tokens(value) for value in candidates):
        candidates = keywords
    anchors = list(
        dict.fromkeys(
            literal_phrase(value)
            for value in candidates
            if isinstance(value, str) and informative_tokens(value)
        )
    )
    if not anchors:
        raise ValueError("The saved plan lacks informative repository task/domain anchors.")
    selected = []
    for anchor in anchors[:4]:
        # Preserve saved quoted phrases. Unquoted refined lexical terms remain
        # an implicit AND, rather than inventing an exact-phrase constraint.
        candidate = (
            f'"{anchor}"'
            if anchor in {literal_phrase(value) for value in phrases} and " " in anchor
            else anchor
        )
        if len(" ".join([*selected, candidate])) > 170:
            break
        selected.append(candidate)
    if not selected:
        raise ValueError("Repository query exceeds its literal text bound.")
    return " ".join(selected) + " in:name,description,topics,readme is:public"


def rank_repositories(records, context):
    query_terms = (
        set(
            tokens(
                " ".join([context["query"], *context.get("keywords", []), *context.get("tags", [])])
            )
        )
        - GENERIC_TERMS
        - STOPWORDS
    )
    docs = []
    for record in records:
        weighted = Counter()
        for value, weight in [
            (record["full_name"], 3),
            (record.get("description") or "", 2),
            (" ".join(record.get("topics", [])), 2),
            (
                " ".join(item["text"] for item in record["readme"].get("evidence", []))
                if record["readme"].get("repository_id_revalidated") is True
                else "",
                1,
            ),
        ]:
            for term, count in Counter(tokens(value)).items():
                if term not in STOPWORDS:
                    weighted[term] += count * weight
        docs.append(weighted)
    count = len(docs)
    lengths = [sum(doc.values()) for doc in docs]
    average = sum(lengths) / count if count else 1
    df = Counter(term for doc in docs for term in doc)
    for record, doc, length in zip(records, docs, lengths, strict=True):
        score = 0.0
        matched = sorted(query_terms & doc.keys())
        for term in matched:
            frequency = doc[term]
            inverse = math.log(1 + (count - df[term] + 0.5) / (df[term] + 0.5))
            score += (
                inverse
                * frequency
                * 2.2
                / (frequency + 1.2 * (0.25 + 0.75 * length / (average or 1)))
            )
        evidence_ids = [
            item["id"]
            for item in record["readme"].get("evidence", [])
            if record["readme"].get("repository_id_revalidated") is True
            and query_terms & set(tokens(item["text"]))
        ]
        body_tokens = set(doc)
        anchors = [
            *context.get("keywords", []),
            *context.get("tags", []),
            *re.findall(r'"([^"\n]+)"', context["query"]),
        ]
        compound = any(
            len(tokens(anchor)) >= 2
            and informative_tokens(anchor)
            and set(tokens(anchor)).issubset(body_tokens)
            for anchor in anchors
        )
        ml_domain = any(
            value in str(context.get("domain") or "").lower()
            for value in (
                "machine learning",
                "language model",
                "artificial intelligence",
                "natural language",
                "nlp",
            )
        )
        domain_evidence = (
            bool(body_tokens & {"llm", "transformer", "neural", "nlp", "embedding", "generative"})
            or {"language", "model"}.issubset(body_tokens)
            or {"machine", "learning"}.issubset(body_tokens)
            or {"retrieval", "augmented"}.issubset(body_tokens)
        )
        eligible = (compound or len(matched) >= 2) and (not ml_domain or domain_evidence)
        missing = [
            "Code, dependency/security state and practical task performance were not verified."
        ]
        if record["readme"]["status"] == "available":
            missing.append(
                "Only bounded first-pass README excerpts were assessed; later sections may be omitted."
            )
        if record["readme"]["status"] != "available":
            missing.append(
                f"README {record['readme']['status'].replace('_', ' ')}; metadata-only matching."
            )
        if not record.get("license") or record["license"] == "NOASSERTION":
            missing.append("Reuse license is unknown or unasserted.")
        record["match"] = {
            "status": "candidate" if eligible else "unknown",
            "score": round(score, 6),
            "method": MATCH_POLICY,
            "matched_terms": matched,
            "evidence_ids": evidence_ids,
            "reason": "Local sparse evidence mentions: " + ", ".join(matched[:6]) + "."
            if matched
            else "Available metadata/README excerpts do not establish a task match.",
            "missing_constraints": missing,
            "model_reviewed": False,
            "scope": "metadata_and_readme"
            if record["readme"]["status"] == "available"
            else "metadata_only",
        }
    return sorted(
        records,
        key=lambda item: (
            item["match"]["status"] != "candidate",
            -item["match"]["score"],
            item["full_name"].lower(),
            item["record_id"],
        ),
    )
