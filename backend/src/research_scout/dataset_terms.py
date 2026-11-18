"""Shared literal-query and metadata-anchor rules; never execute catalog syntax."""

import re

GENERIC_TERMS = frozenset(
    "context model generation data dataset research quality impact performance problem result improve effect study paper better good best new using use".split()
)
STOPWORDS = frozenset(
    "and or not to of a an the for with on in by is are can does what how we it into as be from that this these those".split()
)


def tokens(value):
    return [
        word[:-1] if len(word) > 5 and word.endswith("s") else word
        for word in re.findall(r"[^\W_]+", value.lower())
    ]


def informative_tokens(value):
    return set(tokens(value)) - GENERIC_TERMS - STOPWORDS


def literal_phrase(value):
    words = [
        word.lower()
        for word in re.findall(r"[^\W_]+(?:-[^\W_]+)*", value)
        if word.lower() not in STOPWORDS
    ]
    return " ".join(words[:8])[:160]


def query_anchors(query, keywords):
    quoted = re.findall(r'"([^"\n]+)"', query)
    for candidates in (quoted, keywords, re.findall(r"[^\W_]+(?:-[^\W_]+)*", query)):
        anchors = list(
            dict.fromkeys(
                phrase
                for value in candidates
                if isinstance(value, str)
                and (phrase := literal_phrase(value))
                and informative_tokens(phrase)
            )
        )[:6]
        if anchors:
            return anchors
    return []
