"""Explicit local process configuration; provider access never enables generation."""

from __future__ import annotations

import os
from collections.abc import Mapping

PROVIDER_IDS = (
    "openalex",
    "crossref",
    "datacite",
    "semantic_scholar",
    "arxiv",
    "openaire",
    "europe_pmc",
    "unpaywall",
)
DISCOVERY_PROVIDER_IDS = (
    "openalex",
    "semantic_scholar",
    "crossref",
    "arxiv",
    "openaire",
    "europe_pmc",
)
LOCAL_POOL_PROVIDERS = frozenset(set(DISCOVERY_PROVIDER_IDS) - {"openalex"})


def provider_mode(
    provider: str, env: Mapping[str, str] | None = None, *, default: str | None = None
) -> str:
    if provider not in PROVIDER_IDS:
        raise ValueError("Unknown Research Scout provider.")
    source = os.environ if env is None else env
    value = (
        source.get(f"SCOUT_{provider.upper()}_MODE")
        or default
        or source.get("SCOUT_MODE", "fixture")
    )
    if value not in {"fixture", "live"}:
        raise ValueError(f"SCOUT_{provider.upper()}_MODE must be fixture or live.")
    return value


def model_mode(env: Mapping[str, str] | None = None, *, default: str | None = None) -> str:
    source = os.environ if env is None else env
    value = source.get("SCOUT_MODEL_MODE") or default or "disabled"
    if value not in {"disabled", "fixture"}:
        raise ValueError(
            "Hosted retrieval-agent reasoning is deferred. SCOUT_MODEL_MODE must be "
            "disabled or fixture; optional answer streaming is configured separately."
        )
    return value


def child_environment(service: str, source: Mapping[str, str]) -> dict[str, str]:
    """Project a process environment instead of forwarding unrelated credentials."""
    if service not in {*PROVIDER_IDS, "core", "frontend"}:
        raise ValueError("Unknown Research Scout service.")
    base = {
        "PATH",
        "HOME",
        "USER",
        "LOGNAME",
        "SHELL",
        "TMPDIR",
        "TMP",
        "TEMP",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "TERM",
        "VIRTUAL_ENV",
        "PYTHONPATH",
        "PYTHONUNBUFFERED",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "NODE_EXTRA_CA_CERTS",
        "SYSTEMROOT",
        "WINDIR",
    }
    shared = {"SCOUT_STATE_DIR", "SCOUT_MODE", "SCOUT_MODEL_MODE"}
    if service == "frontend":
        allowed = base | {"SCOUT_API_URL", "NEXT_TELEMETRY_DISABLED", "NODE_ENV"}
    elif service == "core":
        allowed = (
            base
            | shared
            | {"SCOUT_CORE_URL"}
            | {
                f"SCOUT_{name.upper()}_{suffix}"
                for name in PROVIDER_IDS
                for suffix in ("URL", "MODE")
            }
        )
        allowed |= {
            "SCOUT_GENERATION_ENABLED",
            "SCOUT_GENERATION_MODEL",
            "SCOUT_GENERATION_MAX_OUTPUT_TOKENS",
            "SCOUT_GENERATION_MAX_TURN_COST_USD",
            "SCOUT_GENERATION_MAX_SESSION_COST_USD",
            "SCOUT_GENERATION_TIMEOUT_SECONDS",
        }
        allowed |= {
            key
            for key in source
            if key.startswith("SCOUT_RETRIEVAL_") and key != "SCOUT_RETRIEVAL_API_KEY"
        }
        # Only explicitly enabled paid capabilities receive their model credential.
        # Plain discovery and DOI/access routing do not enable model use.
        if source.get("SCOUT_GENERATION_ENABLED", "false").lower() in {"1", "true"}:
            allowed |= {"OPENAI_API_KEY", "SCOUT_GENERATION_API_KEY"}
        if source.get("SCOUT_RETRIEVAL_ENABLED", "false").lower() in {"1", "true"}:
            allowed |= {"OPENAI_API_KEY", "SCOUT_RETRIEVAL_API_KEY"}
    else:
        prefix = f"SCOUT_{service.upper()}_"
        allowed = base | shared | {key for key in source if key.startswith(prefix)}
        if service == "crossref":
            allowed.add("SCOUT_CONTACT_EMAIL")
        if service in LOCAL_POOL_PROVIDERS and provider_mode(service, source) == "live":
            allowed |= {
                "SCOUT_LOCAL_ENCODER_FACTORY",
                "SCOUT_LOCAL_ENCODER_CACHE",
                "SCOUT_LOCAL_ENCODER_MODEL",
                "SCOUT_LOCAL_ENCODER_REVISION",
            }
    return {key: value for key, value in source.items() if key in allowed}
