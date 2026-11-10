import json
import os
import sys
import time
from types import ModuleType

import httpx
import pytest
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken

from research_scout.providers.adapters import LiveAdapter
from research_scout.providers.encoders import load_configured_encoder
from research_scout.providers.journal import ProviderError
from research_scout.providers.oauth import (
    FileTokenStorage,
    StoredOAuthProvider,
    access_status,
    openalex_session,
)
from research_scout.providers.service import create_provider_app
from research_scout.providers.upstream import upstream_url


def test_hosted_endpoint_config_rejects_origin_and_url_credentials(monkeypatch):
    for value in (
        "http://api.crossref.org",
        "https://evil.example",
        "https://secret@api.crossref.org",
        "https://api.crossref.org?token=secret",
        "https://api.crossref.org:444",
        "https://api.crossref.org/other-service",
    ):
        monkeypatch.setenv("SCOUT_CROSSREF_REST_BASE_URL", value)
        with pytest.raises(ValueError, match="official HTTPS"):
            upstream_url("crossref")
    monkeypatch.setenv("SCOUT_CROSSREF_REST_BASE_URL", "https://api.crossref.org/")
    assert upstream_url("crossref") == "https://api.crossref.org"


@pytest.mark.asyncio
async def test_credentials_never_sent_to_foreign_origin(monkeypatch):
    called = []
    monkeypatch.setenv("SCOUT_SEMANTIC_SCHOLAR_API_KEY", "not-a-real-test-secret")
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: called.append(r))
    ) as client:
        adapter = LiveAdapter("semantic_scholar", client)
        with pytest.raises(ValueError, match="another upstream"):
            await adapter.http_get("https://evil.example/paper/search")
    assert called == []


@pytest.mark.asyncio
async def test_readiness_is_zero_call_and_separate_from_configured_access(tmp_path, monkeypatch):
    called = []
    monkeypatch.delenv("SCOUT_OPENALEX_OAUTH_TOKEN", raising=False)
    monkeypatch.setenv("SCOUT_OPENALEX_OAUTH_STORE", str(tmp_path / "credentials.json"))
    monkeypatch.delenv("SCOUT_SEMANTIC_SCHOLAR_API_KEY", raising=False)
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: called.append(r))
    ) as upstream:
        for provider in ("openalex", "semantic_scholar", "crossref", "datacite"):
            app = create_provider_app(provider, "live", state_dir=tmp_path, http_client=upstream)
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app), base_url="http://provider"
            ) as client:
                response = (await client.get("/health")).json()
                assert response["last_verified_at"] is None
                assert response["verified_capabilities"] == []
                assert response["readiness"] == (
                    "needs_access" if provider == "openalex" else "configured_unverified"
                )
                if provider == "semantic_scholar":
                    assert response["key_recommended"] and not response["capabilities"]["semantic"]
    assert called == []


@pytest.mark.asyncio
async def test_verified_metadata_capability_changes_only_after_normalization(tmp_path):
    requests = []

    def upstream(request):
        requests.append(request)
        return httpx.Response(200, json={"message": {"DOI": "10.1234/test", "title": ["Record"]}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as network:
        app = create_provider_app("crossref", "live", state_dir=tmp_path, http_client=network)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://provider"
        ) as client:
            await client.post(
                "/operations/metadata",
                json={"operation_id": "one", "run_id": "one", "doi": "10.1234/test"},
            )
            health = (await client.get("/health")).json()
            assert health["verified_capabilities"] == ["metadata"]
            assert health["readiness"] == "verified" and health["last_verified_at"]
    assert len(requests) == 1


@pytest.mark.asyncio
async def test_openalex_store_restores_discovered_refresh_endpoint_and_expiry(tmp_path):
    storage = FileTokenStorage(tmp_path / "oauth.local.json")
    metadata = OAuthClientMetadata(
        redirect_uris=["http://127.0.0.1:8489/callback"], token_endpoint_auth_method="none"
    )
    await storage.set_client_info(
        OAuthClientInformationFull(
            **metadata.model_dump(), client_id="test-client", issuer="https://openalex.org"
        )
    )
    await storage.set_tokens(
        OAuthToken(
            access_token="expired-test-token", refresh_token="retained-refresh", expires_in=-30
        )
    )
    storage.update(
        oauth_metadata={
            "issuer": "https://openalex.org",
            "authorization_endpoint": "https://openalex.org/oauth/authorize",
            "token_endpoint": "https://openalex.org/oauth/token",
        },
        auth_server_url="https://openalex.org",
    )
    auth = StoredOAuthProvider(
        server_url="https://mcp.openalex.org/mcp", client_metadata=metadata, storage=storage
    )
    requests = []

    def upstream(request):
        requests.append(request)
        if request.url.path == "/oauth/token":
            assert b"grant_type=refresh_token" in request.content
            return httpx.Response(
                200,
                json={"access_token": "new-test-token", "token_type": "Bearer", "expires_in": 300},
            )
        assert request.headers["Authorization"] == "Bearer new-test-token"
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(auth=auth, transport=httpx.MockTransport(upstream)) as client:
        assert (await client.get("https://mcp.openalex.org/mcp")).status_code == 200
    assert [request.url.path for request in requests] == ["/oauth/token", "/mcp"]
    assert (await storage.get_tokens()).refresh_token == "retained-refresh"
    assert storage.read()["expires_at"] > time.time()
    assert os.stat(storage.path).st_mode & 0o777 == 0o600
    saved = json.loads(storage.path.read_text())
    saved["server_url"] = "https://different.example/mcp"
    storage.path.write_text(json.dumps(saved))
    with pytest.raises(ProviderError, match="reconnection"):
        storage.read()


@pytest.mark.asyncio
async def test_unconfigured_openalex_never_starts_interactive_auth(tmp_path, monkeypatch):
    monkeypatch.delenv("SCOUT_OPENALEX_OAUTH_TOKEN", raising=False)
    monkeypatch.setenv("SCOUT_OPENALEX_OAUTH_STORE", str(tmp_path / "missing.json"))
    assert access_status()["configured"] is False
    with pytest.raises(ProviderError, match="Connect OpenAlex"):
        async with openalex_session():
            pytest.fail("Missing access must stop before network construction")


@pytest.mark.asyncio
async def test_s2_search_details_share_pacing_and_429_cooldown(monkeypatch):
    times = []
    admissions = []

    async def admit():
        admissions.append(True)

    def upstream(_request):
        times.append(time.monotonic())
        return (
            httpx.Response(429, headers={"Retry-After": "5"})
            if len(times) == 2
            else httpx.Response(200, json={})
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        adapter = LiveAdapter("semantic_scholar", client)
        await adapter.http_get(adapter.base_url + "/paper/search", before_call=admit)
        with pytest.raises(ProviderError) as limited:
            await adapter.http_get(adapter.base_url + "/paper/one", before_call=admit)
        assert limited.value.code == "UPSTREAM_RATE_LIMIT"
        with pytest.raises(ProviderError) as cooldown:
            await adapter.http_get(adapter.base_url + "/paper/two", before_call=admit)
        assert cooldown.value.code == "UPSTREAM_COOLDOWN"
    assert len(times) == 2 and times[1] - times[0] >= 0.95
    assert len(admissions) == 2


def test_encoder_factory_shared_loader_is_explicit_and_sanitized(monkeypatch):
    monkeypatch.delenv("SCOUT_SEMANTIC_SCHOLAR_ENCODER_FACTORY", raising=False)
    assert load_configured_encoder() == (None, None)
    assert load_configured_encoder("invalid") == (None, "ENCODER_FACTORY_INVALID")
    module = ModuleType("scout_encoder_test")
    value = object()
    module.factory = lambda: value
    monkeypatch.setitem(sys.modules, module.__name__, module)
    monkeypatch.setenv("SCOUT_SEMANTIC_SCHOLAR_ENCODER_FACTORY", "scout_encoder_test:factory")
    assert load_configured_encoder() == (value, None)
    assert load_configured_encoder("no_such_module:factory") == (
        None,
        "ENCODER_FACTORY_UNAVAILABLE",
    )
