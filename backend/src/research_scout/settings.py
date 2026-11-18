"""Explicit local process configuration; provider access never enables generation."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from .paths import repository_path

PROVIDER_IDS = (
    "openalex",
    "crossref",
    "datacite",
    "semantic_scholar",
    "arxiv",
    "openaire",
    "europe_pmc",
    "unpaywall",
    "youtube",
)
DISCOVERY_PROVIDER_IDS = (
    "openalex",
    "semantic_scholar",
    "crossref",
    "arxiv",
    "openaire",
    "europe_pmc",
    "youtube",
)
LOCAL_POOL_PROVIDERS = frozenset(set(DISCOVERY_PROVIDER_IDS) - {"openalex"})


def provider_mode(
    provider: str, env: Mapping[str, str] | None = None, *, default: str | None = None
) -> str:
    if provider not in {*PROVIDER_IDS, "hugging_face", "github"}:
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
    if service not in {*PROVIDER_IDS, "hugging_face", "github", "core", "frontend"}:
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
            | {"SCOUT_HUGGING_FACE_URL", "SCOUT_HUGGING_FACE_MODE"}
            | {"SCOUT_GITHUB_URL", "SCOUT_GITHUB_MODE"}
            | {"SCOUT_TOKENOMICS_DB_PATH", "SCOUT_TOKENOMICS_TIMEZONE"}
            | {
                f"SCOUT_{name.upper()}_{suffix}"
                for name in PROVIDER_IDS
                for suffix in ("URL", "MODE")
            }
        )
        allowed |= {key for key in source if key.startswith("SCOUT_AUTH_")}
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


def _auth_bool(value: str) -> bool:
    if value.lower() not in {"true", "false", "1", "0"}:
        raise ValueError("Authentication boolean settings must be true or false.")
    return value.lower() in {"true", "1"}


@dataclass
class AuthSettings:
    """Core-only authentication configuration, separate from provider/economics state."""

    enabled: bool = False
    db_path: Path | None = None
    frontend_origins: tuple[str, ...] = (
        "http://localhost:3100",
        "http://127.0.0.1:3100",
    )
    public_url: str = "http://localhost:3100"
    cookie_secure: bool = False
    internal_token: str = field(default="", repr=False)
    google_client_id: str = ""
    owner_email: str = ""
    reset_delivery: str = "local_outbox"
    outbox_dir: Path | None = None
    session_seconds: int = 86400
    reset_seconds: int = 1800
    flow_seconds: int = 600
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = field(default="", repr=False)
    smtp_from: str = ""
    smtp_tls: str = "starttls"

    def __post_init__(self):
        self.db_path = repository_path(self.db_path or "backend/db/auth.sqlite3")
        self.outbox_dir = repository_path(self.outbox_dir or self.db_path.parent / "auth-outbox")
        self.owner_email = self.owner_email.strip().casefold()
        self.public_url = self.public_url.rstrip("/")
        self.frontend_origins = tuple(dict.fromkeys(x.rstrip("/") for x in self.frontend_origins))
        origins = (*self.frontend_origins, self.public_url)
        for value in origins:
            parts = urlsplit(value)
            if (
                parts.scheme not in {"http", "https"}
                or not parts.hostname
                or parts.username
                or parts.password
                or parts.path
                or parts.query
                or parts.fragment
            ):
                raise ValueError("Authentication frontend URLs must be exact HTTP(S) origins.")
        if not self.frontend_origins or self.public_url not in self.frontend_origins:
            raise ValueError("Authentication public URL must be an allowed frontend origin.")
        local = all(urlsplit(x).hostname in {"localhost", "127.0.0.1", "::1"} for x in origins)
        if self.enabled and (
            len(self.internal_token) < 32 or any(c.isspace() for c in self.internal_token)
        ):
            raise ValueError(
                "SCOUT_AUTH_INTERNAL_TOKEN must contain at least 32 secret characters."
            )
        if (
            self.enabled
            and not local
            and (not self.cookie_secure or any(urlsplit(x).scheme != "https" for x in origins))
        ):
            raise ValueError("Non-local authentication requires HTTPS origins and Secure cookies.")
        if self.reset_delivery not in {"local_outbox", "smtp"}:
            raise ValueError("SCOUT_AUTH_RESET_DELIVERY must be local_outbox or smtp.")
        if self.enabled and self.reset_delivery == "local_outbox" and not local:
            raise ValueError("The local reset outbox is restricted to localhost frontend origins.")
        if self.smtp_tls not in {"starttls", "ssl"}:
            raise ValueError("SMTP transport must use starttls or ssl.")
        if (
            self.enabled
            and self.reset_delivery == "smtp"
            and (
                not self.smtp_host
                or not self.smtp_from
                or "\n" in self.smtp_from
                or "\r" in self.smtp_from
            )
        ):
            raise ValueError("SMTP delivery requires its host and a valid sender.")
        if not all(
            60 <= x <= 2592000
            for x in (self.session_seconds, self.reset_seconds, self.flow_seconds)
        ):
            raise ValueError(
                "Authentication expiry settings must be between 60 seconds and 30 days."
            )

    @classmethod
    def from_environment(
        cls, state_dir: Path, mode: str, source: Mapping[str, str] | None = None
    ) -> AuthSettings:
        env = os.environ if source is None else source
        canonical = mode == "live" and state_dir in {
            repository_path(".scout"),
            repository_path(".scout/live"),
        }
        default_db = (
            repository_path("backend/db/auth.sqlite3")
            if canonical
            else state_dir / "operational" / "auth.sqlite3"
        )
        origins = tuple(
            x.strip()
            for x in env.get(
                "SCOUT_AUTH_FRONTEND_ORIGINS", "http://localhost:3100,http://127.0.0.1:3100"
            ).split(",")
            if x.strip()
        )
        return cls(
            enabled=_auth_bool(env.get("SCOUT_AUTH_ENABLED", "false")),
            db_path=repository_path(env.get("SCOUT_AUTH_DB_PATH", str(default_db))),
            frontend_origins=origins,
            public_url=env.get("SCOUT_AUTH_PUBLIC_URL", origins[0] if origins else ""),
            cookie_secure=_auth_bool(env.get("SCOUT_AUTH_COOKIE_SECURE", "false")),
            internal_token=env.get("SCOUT_AUTH_INTERNAL_TOKEN", ""),
            google_client_id=env.get("SCOUT_AUTH_GOOGLE_CLIENT_ID", "").strip(),
            owner_email=env.get("SCOUT_AUTH_OWNER_EMAIL", ""),
            reset_delivery=env.get("SCOUT_AUTH_RESET_DELIVERY", "local_outbox"),
            outbox_dir=Path(env["SCOUT_AUTH_OUTBOX_DIR"])
            if env.get("SCOUT_AUTH_OUTBOX_DIR")
            else None,
            session_seconds=int(env.get("SCOUT_AUTH_SESSION_SECONDS", "86400")),
            reset_seconds=int(env.get("SCOUT_AUTH_RESET_SECONDS", "1800")),
            flow_seconds=int(env.get("SCOUT_AUTH_FLOW_SECONDS", "600")),
            smtp_host=env.get("SCOUT_AUTH_SMTP_HOST", ""),
            smtp_port=int(env.get("SCOUT_AUTH_SMTP_PORT", "587")),
            smtp_username=env.get("SCOUT_AUTH_SMTP_USERNAME", ""),
            smtp_password=env.get("SCOUT_AUTH_SMTP_PASSWORD", ""),
            smtp_from=env.get("SCOUT_AUTH_SMTP_FROM", ""),
            smtp_tls=env.get("SCOUT_AUTH_SMTP_TLS", "starttls"),
        )
