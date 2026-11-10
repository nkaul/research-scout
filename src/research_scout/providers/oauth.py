"""OpenAlex OAuth using the installed MCP SDK's discovery/PKCE/refresh flow.

Only the explicit connection CLI may start interactive authorization. Normal
provider requests either use existing credentials or return a reconnect gate.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.auth import (
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthMetadata,
    OAuthToken,
    ProtectedResourceMetadata,
)

from .journal import ProviderError, atomic_json
from .upstream import upstream_url

_connection_lock = asyncio.Lock()


def credential_path() -> Path:
    return Path(
        os.getenv("SCOUT_OPENALEX_OAUTH_STORE", ".scout/credentials/openalex.local.json")
    ).expanduser()


class FileTokenStorage:
    """SDK token storage with absolute expiry, private mode and origin binding."""

    def __init__(self, path: Path | None = None):
        self.path = path or credential_path()

    def read(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            saved = json.loads(self.path.read_text())
            if not isinstance(saved, dict) or saved.get("server_url") != upstream_url("openalex"):
                raise ValueError("different server")
            if saved.get("tokens"):
                OAuthToken.model_validate(saved["tokens"])
            if saved.get("client_info"):
                OAuthClientInformationFull.model_validate(saved["client_info"])
            if saved.get("oauth_metadata"):
                OAuthMetadata.model_validate(saved["oauth_metadata"])
            if saved.get("resource_metadata"):
                ProtectedResourceMetadata.model_validate(saved["resource_metadata"])
            return saved
        except (OSError, ValueError, TypeError) as error:
            raise ProviderError(
                "OAUTH_STORE_INVALID", "OpenAlex credentials need reconnection.", 503
            ) from error

    def update(self, **values) -> None:
        saved = self.read()
        saved.update(values, server_url=upstream_url("openalex"))
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        atomic_json(self.path, saved)
        self.path.chmod(0o600)

    async def get_tokens(self) -> OAuthToken | None:
        saved = self.read()
        if not saved.get("tokens"):
            return None
        token = OAuthToken.model_validate(saved["tokens"])
        if saved.get("expires_at") is not None:
            token.expires_in = int(saved["expires_at"] - time.time())
        return token

    async def set_tokens(self, tokens: OAuthToken) -> None:
        if not tokens.refresh_token:
            # RFC 6749 permits a refresh response to omit the unchanged refresh token.
            tokens.refresh_token = (self.read().get("tokens") or {}).get("refresh_token")
        self.update(
            tokens=tokens.model_dump(mode="json"),
            expires_at=time.time() + tokens.expires_in if tokens.expires_in is not None else None,
        )

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        data = self.read().get("client_info")
        return OAuthClientInformationFull.model_validate(data) if data else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self.update(client_info=client_info.model_dump(mode="json"))


class StoredOAuthProvider(OAuthClientProvider):
    """Restore discovered metadata and true expiry for refresh across processes.

    The pinned MCP SDK's base initializer loads a token but does not restore its
    original expiry or discovered authorization metadata. Keep that small adapter
    explicit and covered by compatibility tests rather than guessing /token URLs.
    """

    async def _initialize(self) -> None:
        await super()._initialize()
        data = self.context.storage.read()
        if self.context.current_tokens:
            self.context.update_token_expiry(self.context.current_tokens)
        if data.get("oauth_metadata"):
            self.context.oauth_metadata = OAuthMetadata.model_validate(data["oauth_metadata"])
        if data.get("resource_metadata"):
            self.context.protected_resource_metadata = ProtectedResourceMetadata.model_validate(
                data["resource_metadata"]
            )
        self.context.auth_server_url = data.get("auth_server_url")

    def persist_metadata(self) -> None:
        values = {"auth_server_url": self.context.auth_server_url}
        for key, value in (
            ("oauth_metadata", self.context.oauth_metadata),
            ("resource_metadata", self.context.protected_resource_metadata),
        ):
            if value is not None:
                values[key] = value.model_dump(mode="json")
        self.context.storage.update(**values)


def access_status() -> dict:
    if os.getenv("SCOUT_OPENALEX_OAUTH_TOKEN"):
        return {"configured": True, "method": "manual_bearer", "refreshable": False}
    try:
        saved = FileTokenStorage().read()
        tokens = saved.get("tokens") or {}
        configured = bool(tokens.get("access_token"))
        expired = saved.get("expires_at") is not None and saved["expires_at"] <= time.time()
        refreshable = bool(
            tokens.get("refresh_token")
            and saved.get("oauth_metadata")
            and (saved.get("client_info") or {}).get("client_id")
        )
        return {
            "configured": configured and (not expired or refreshable),
            "method": "oauth_store" if configured else "unconfigured",
            "refreshable": refreshable,
            "needs_reconnect": not configured or (expired and not refreshable),
        }
    except ProviderError:
        return {"configured": False, "method": "invalid_store", "needs_reconnect": True}


@asynccontextmanager
async def openalex_session(*, redirect_handler=None, callback_handler=None, redirect_uri=None):
    url = upstream_url("openalex")
    token = os.getenv("SCOUT_OPENALEX_OAUTH_TOKEN")
    storage = FileTokenStorage()
    interactive = redirect_handler is not None and callback_handler is not None
    if not token and not interactive and not access_status()["configured"]:
        raise ProviderError(
            "ACCESS_NOT_CONFIGURED",
            "Connect OpenAlex with scripts/connect_openalex.py; a REST key is not an MCP token.",
            503,
        )

    async def reconnect(_url):
        raise ProviderError(
            "OAUTH_RECONNECT_REQUIRED",
            "OpenAlex authorization expired or was revoked; run scripts/connect_openalex.py.",
            503,
        )

    auth = None
    headers = {}
    if token and not interactive:
        headers["Authorization"] = f"Bearer {token}"
    else:
        metadata = OAuthClientMetadata(
            redirect_uris=[redirect_uri or "http://127.0.0.1:8489/callback"],
            client_name="Research Scout",
            token_endpoint_auth_method="none",
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"],
        )
        auth = StoredOAuthProvider(
            server_url=url,
            client_metadata=metadata,
            storage=storage,
            redirect_handler=redirect_handler or reconnect,
            callback_handler=callback_handler,
            timeout=180,
        )
    # Serialize native connections, including refresh-token rotation, within this process.
    async with _connection_lock:
        async with httpx.AsyncClient(
            auth=auth,
            headers=headers,
            timeout=httpx.Timeout(180, connect=10),
            follow_redirects=False,
            trust_env=False,
            transport=httpx.AsyncHTTPTransport(retries=0),
        ) as client:
            try:
                async with (
                    streamable_http_client(url, http_client=client) as streams,
                    ClientSession(streams[0], streams[1]) as session,
                ):
                    await session.initialize()
                    yield session
            finally:
                if auth is not None and auth.context.oauth_metadata is not None:
                    auth.persist_metadata()
