"""Provider-owned trusted origins; internal Scout service URLs live elsewhere."""

import os
from urllib.parse import urlsplit

DEFAULTS = {
    "openalex": ("SCOUT_OPENALEX_MCP_URL", "https://mcp.openalex.org/mcp"),
    "crossref": ("SCOUT_CROSSREF_REST_BASE_URL", "https://api.crossref.org"),
    "datacite": ("SCOUT_DATACITE_REST_BASE_URL", "https://api.datacite.org"),
    "semantic_scholar": (
        "SCOUT_SEMANTIC_SCHOLAR_REST_BASE_URL",
        "https://api.semanticscholar.org/graph/v1",
    ),
    "arxiv": ("SCOUT_ARXIV_REST_BASE_URL", "https://export.arxiv.org/api"),
    "openaire": ("SCOUT_OPENAIRE_REST_BASE_URL", "https://api.openaire.eu/graph/v3"),
    "europe_pmc": (
        "SCOUT_EUROPE_PMC_REST_BASE_URL",
        "https://www.ebi.ac.uk/europepmc/webservices/rest",
    ),
    "unpaywall": ("SCOUT_UNPAYWALL_REST_BASE_URL", "https://api.unpaywall.org/v2"),
}

LOCAL_POOL_PROVIDERS = frozenset(
    {"semantic_scholar", "crossref", "arxiv", "openaire", "europe_pmc"}
)
DISCOVERY_PROVIDERS = LOCAL_POOL_PROVIDERS | {"openalex"}


def upstream_url(provider: str) -> str:
    variable, default = DEFAULTS[provider]
    value = os.getenv(variable, default).strip().rstrip("/")
    parsed, expected = urlsplit(value), urlsplit(default)
    if (
        parsed.scheme != "https"
        or parsed.hostname != expected.hostname
        or parsed.port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path.rstrip("/") != expected.path.rstrip("/")
    ):
        raise ValueError(f"{variable} must identify the provider's official HTTPS endpoint.")
    return value


def check_request_origin(provider: str, url: str) -> None:
    parsed, base = urlsplit(url), urlsplit(upstream_url(provider))
    if (
        (parsed.scheme, parsed.hostname, parsed.port or 443)
        != (base.scheme, base.hostname, base.port or 443)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or not (parsed.path == base.path or parsed.path.startswith(base.path.rstrip("/") + "/"))
    ):
        raise ValueError("Provider credentials cannot be sent to another upstream origin.")
