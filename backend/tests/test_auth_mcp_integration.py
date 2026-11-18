"""AUTH-ON API -> real Deep Agents -> HTTP MCP -> isolated provider fixture.

Only the API and application-MCP legs use real loopback HTTP. The provider leg
is an injected transport with authored NDJSON; no hosted model or identity runs.
"""

import asyncio
import json
import socket

import httpx
import pytest
import uvicorn

from research_scout.api import create_app
from research_scout.auth import INTERNAL_HEADER, SESSION_COOKIE
from research_scout.contracts import SourceRecord
from research_scout.core import PROVIDERS, Core, Settings
from research_scout.providers.normalization import source


@pytest.mark.asyncio
async def test_authenticated_http_api_deepagents_mcp_dispatch_and_stream(tmp_path, monkeypatch):
    secret = "synthetic-auth-on-mcp-capability-" + "a" * 32
    provider_calls, mcp_requests = [], []
    source_sent, finish_provider = asyncio.Event(), asyncio.Event()
    record = SourceRecord.model_validate(
        source(
            "openalex",
            "auth-mcp-fixture",
            "fixture",
            title="[AUTHORED FICTIONAL] Authenticated discovery boundary",
            authors=["Synthetic Fixture Author"],
            year=2026,
            venue="Fixture Journal",
            url="https://example.invalid/authored-auth-mcp",
            abstract="Authored transport fixture; not a real research finding.",
            resource_type="article",
        )
    ).model_dump()

    class ProviderEvents(httpx.AsyncByteStream):
        async def __aiter__(self):
            initial = [
                {"kind": "usage", "attempts": 1},
                {"kind": "branch.started", "branch": "lexical"},
                {"kind": "source", "branch": "lexical", "rank": 1, "record": record},
            ]
            for event in initial:
                yield (json.dumps(event) + "\n").encode()
            # Core has processed the source before requesting the next chunk.
            source_sent.set()
            await asyncio.wait_for(finish_provider.wait(), timeout=10)
            for event in [
                {"kind": "branch.completed", "branch": "lexical", "raw_count": 1, "count": 1},
                {"kind": "usage", "attempts": 2},
                {"kind": "branch.started", "branch": "semantic"},
                {"kind": "source", "branch": "semantic", "rank": 1, "record": record},
                {"kind": "branch.completed", "branch": "semantic", "raw_count": 1, "count": 1},
                {"kind": "complete", "attempts": 2},
            ]:
                yield (json.dumps(event) + "\n").encode()

    async def fixture_provider(request):
        # Every provider URL is loopback port 1 and this transport never opens it.
        assert request.url.host == "127.0.0.1" and request.url.port == 1
        assert request.method == "POST" and request.url.path == "/operations/search"
        assert INTERNAL_HEADER not in request.headers
        assert "cookie" not in request.headers and "authorization" not in request.headers
        body = json.loads(request.content)
        assert body["provider"] == "openalex"
        provider_calls.append(body)
        return httpx.Response(
            200, stream=ProviderEvents(), headers={"content-type": "application/x-ndjson"}
        )

    class ObserveMcpBoundary:
        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            observation = None
            if scope["type"] == "http" and scope["path"].startswith("/mcp"):
                headers = dict(scope.get("headers", []))
                observation = {
                    "method": scope["method"],
                    "internal_key_matches": headers.get(INTERNAL_HEADER.lower().encode())
                    == secret.encode(),
                    "browser_cookie_present": b"cookie" in headers,
                    "origin_present": b"origin" in headers,
                }
                mcp_requests.append(observation)

            async def observed_send(message):
                if observation is not None and message["type"] == "http.response.start":
                    observation["status"] = message["status"]
                await send(message)

            await self.app(scope, receive, observed_send)

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        listener.setblocking(False)
        port = listener.getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        overrides = {
            "SCOUT_AUTH_ENABLED": "true",
            "SCOUT_AUTH_INTERNAL_TOKEN": secret,
            "SCOUT_AUTH_DB_PATH": str(tmp_path / "identity" / "auth.sqlite3"),
            "SCOUT_AUTH_OUTBOX_DIR": str(tmp_path / "outbox"),
            "SCOUT_AUTH_FRONTEND_ORIGINS": base,
            "SCOUT_AUTH_PUBLIC_URL": base,
            "SCOUT_AUTH_COOKIE_SECURE": "false",
            "SCOUT_AUTH_RESET_DELIVERY": "local_outbox",
            "SCOUT_AUTH_OWNER_EMAIL": "",
            "SCOUT_AUTH_GOOGLE_CLIENT_ID": "",
            "SCOUT_GENERATION_ENABLED": "false",
            "SCOUT_RETRIEVAL_ENABLED": "false",
            "SCOUT_MODEL_MODE": "disabled",
        }
        for key, value in overrides.items():
            monkeypatch.setenv(key, value)
        for key in ("OPENAI_API_KEY", "SCOUT_GENERATION_API_KEY", "SCOUT_RETRIEVAL_API_KEY"):
            monkeypatch.delenv(key, raising=False)
        provider_client = httpx.AsyncClient(
            transport=httpx.MockTransport(fixture_provider), trust_env=False
        )
        settings = Settings(
            state_dir=tmp_path / "research",
            mode="fixture",
            model_mode="disabled",
            core_url=base,
            provider_urls={name: "http://127.0.0.1:1" for name in PROVIDERS},
        )
        # Auth settings use the production environment factory, just like the
        # internal MCP header reader. No test-only authentication override.
        app = create_app(settings, core_factory=lambda config: Core(config, client=provider_client))
        server = uvicorn.Server(
            uvicorn.Config(
                ObserveMcpBoundary(app),
                host="127.0.0.1",
                port=port,
                log_level="error",
                timeout_graceful_shutdown=3,
            )
        )
        serving = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            for _ in range(200):
                if server.started:
                    break
                if serving.done():
                    serving.result()
                await asyncio.sleep(0.01)
            assert server.started, "Disposable auth-on API did not start"
            assert app.state.auth.settings.enabled
            assert app.state.auth.settings.internal_token == secret
            assert app.state.auth.settings.db_path != settings.economics_path
            assert app.state.core.agent_runner is None
            assert app.state.core.generation.config.enabled is False
            assert app.state.core.retrieval.config.enabled is False

            async with httpx.AsyncClient(base_url=base, trust_env=False, timeout=15) as client:
                assert (await client.get("/api/research-runs")).status_code == 401
                form = (await client.get("/api/auth/config")).json()
                assert form["enabled"] and form["setup_required"]
                response = await client.post(
                    "/api/auth/setup",
                    json={
                        "username": "fixture-owner",
                        "email": "owner@example.invalid",
                        "password": "Synthetic owner passphrase only",
                    },
                    headers={"Origin": base, "X-CSRF-Token": form["csrf_token"]},
                )
                assert response.status_code == 200, response.text
                assert client.cookies.get(SESSION_COOKIE)
                mutation_headers = {"Origin": base, "X-CSRF-Token": response.json()["csrf_token"]}

                # A browser's owner cookie cannot replace the server-only MCP key.
                assert (await client.get("/mcp/")).status_code == 401
                body = {
                    "question": "How does authenticated fixture discovery work?",
                    "provider": "openalex",
                    "filters": {},
                    "idempotency_key": "auth-on-mcp",
                }
                assert (await client.post("/api/research-runs", json=body)).status_code == 403
                assert provider_calls == []
                admitted = await client.post(
                    "/api/research-runs", json=body, headers=mutation_headers
                )
                assert admitted.status_code == 202, admitted.text
                run_id = admitted.json()["id"]
                early, final = None, None
                async with asyncio.timeout(20):
                    async with client.stream(
                        "GET", f"/api/research-runs/{run_id}/events"
                    ) as stream:
                        assert stream.status_code == 200
                        assert "text/event-stream" in stream.headers["content-type"]
                        async for line in stream.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            snapshot = json.loads(line[6:])["snapshot"]
                            if snapshot["entities"] and early is None:
                                await asyncio.wait_for(source_sent.wait(), timeout=5)
                                assert snapshot["status"] == "RUNNING"
                                early = snapshot
                                selected = await client.put(
                                    f"/api/research-runs/{run_id}/selections/{record['source_ref']}",
                                    json={
                                        "state": "included",
                                        "reason": "Authenticated early fixture selection",
                                        "expected_revision": snapshot["revision"],
                                    },
                                    headers=mutation_headers,
                                )
                                assert selected.status_code == 200, selected.text
                                finish_provider.set()
                            if snapshot["status"] in {
                                "SUCCEEDED",
                                "EMPTY",
                                "PARTIAL",
                                "FAILED",
                                "CANCELLED",
                                "INTERRUPTED",
                            }:
                                final = snapshot
                                break
                assert early is not None and final is not None
                assert final["status"] == "SUCCEEDED", final["warnings"]
                assert final["selections"][record["source_ref"]]["state"] == "included"
                assert len(final["entities"]) == 1
                assert set(final["entities"][0]["branch_ranks"]) == {"lexical", "semantic"}
                assert final["runtime"]["model_mode"] == "disabled"
                assert final["runtime"]["agent"] == "deterministic-routing"
                assert final["runtime"]["agent_usage"]["delegations"] == 1
                assert final["runtime"]["agent_usage"]["application_mcp_calls"] == 1
                assert final["runtime"]["agent_usage"]["model_http_attempts"] == 0
                assert len(provider_calls) == 1 and provider_calls[0]["run_id"] == run_id

                # Reading saved state/exporting through the same authenticated
                # boundary cannot dispatch another provider or model request.
                before = len(provider_calls)
                assert (
                    await client.get(f"/api/research-runs/{run_id}/snapshot")
                ).status_code == 200
                exported = await client.post(
                    f"/api/research-runs/{run_id}/exports", headers=mutation_headers
                )
                assert exported.status_code == 200
                assert len(provider_calls) == before
                economics = app.state.core.generation.economics.get_economics()
                assert economics["used"] == economics["reserved"] == 0
                assert economics["invocations"]["total"] == 0

                internal = [row for row in mcp_requests if row["internal_key_matches"]]
                assert internal and any(row["status"] == 200 for row in internal)
                assert all(
                    not row["browser_cookie_present"] and not row["origin_present"]
                    for row in internal
                )
                assert all(row["status"] not in {401, 403} for row in internal)
                assert any(
                    not row["internal_key_matches"] and row["status"] == 401 for row in mcp_requests
                )
        finally:
            finish_provider.set()
            server.should_exit = True
            await asyncio.wait_for(serving, timeout=8)
            await provider_client.aclose()
