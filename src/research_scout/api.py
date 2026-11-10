"""Loopback application API and the real local Streamable HTTP MCP server."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from mcp.server.fastmcp import FastMCP
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .contracts import ConversationRequest, ResearchRequest, SelectionRequest, TurnRequest
from .core import ApplicationError, Core, Settings


def create_app(settings: Settings | None = None, *, core_factory=None) -> FastAPI:
    config = settings or Settings()
    mcp = FastMCP(
        "Research Scout",
        stateless_http=True,
        json_response=True,
        streamable_http_path="/",
        max_request_body_size=64 * 1024,
    )

    @asynccontextmanager
    async def lifespan(application):
        core = core_factory(config) if core_factory else Core(config)
        application.state.core = core
        async with mcp.session_manager.run():
            try:
                yield
            finally:
                await core.close()

    application = FastAPI(title="Research Scout", version="0.1.0", lifespan=lifespan)
    application.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3100", "http://127.0.0.1:3100"],
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type", "Last-Event-ID"],
    )

    @application.exception_handler(ApplicationError)
    async def application_error(_request, error):
        return JSONResponse({"detail": str(error)}, status_code=error.status)

    @application.get("/health")
    async def health():
        generation = application.state.core.generation.readiness()
        return {
            "status": "ok",
            "service": "research_scout_core",
            "mode": config.mode,
            "agent": "real-deepagents-deterministic-routing"
            if config.model_mode == "disabled"
            else "real-deepagents-scripted-model",
            "live_model_configured": generation["enabled"] and generation["configured"],
            "model_mode": config.model_mode,
            "generation": "optional_openai_responses" if generation["enabled"] else "disabled",
            "generation_enabled": generation["enabled"],
            "routing": "deterministic_with_optional_agentic_retrieval"
            if application.state.core.retrieval.config.enabled
            else "deterministic",
            "frameworks": ["langchain", "langgraph", "deepagents"],
            "provider_modes": config.provider_modes,
            "retrieval": application.state.core.retrieval.readiness(),
        }

    @application.get("/api/config")
    async def public_configuration():
        generation = application.state.core.generation.readiness()
        return {
            "generation_enabled": generation["enabled"],
            "generation": generation,
            "retrieval": application.state.core.retrieval.readiness(),
            "routing": "deterministic_with_optional_agentic_retrieval"
            if application.state.core.retrieval.config.enabled
            else "deterministic",
        }

    @application.get("/api/providers")
    async def providers():
        return await application.state.core.providers()

    @application.post("/api/conversations", status_code=201)
    async def new_conversation(body: ConversationRequest):
        return await application.state.core.conversations.create(body)

    @application.get("/api/conversations")
    async def conversations():
        saved = await application.state.core.conversations.store.list()
        return {
            "conversations": [
                {
                    key: item[key]
                    for key in ("id", "title", "status", "revision", "created_at", "updated_at")
                }
                for item in saved
            ]
        }

    @application.get("/api/conversations/{conversation_id}")
    async def conversation(conversation_id: str):
        return await application.state.core.conversations.get(conversation_id)

    @application.get("/api/conversations/{conversation_id}/turns/{turn_id}")
    async def saved_turn(conversation_id: str, turn_id: str):
        return await application.state.core.conversations.get_turn(conversation_id, turn_id)

    @application.post("/api/conversations/{conversation_id}/turns", status_code=202)
    async def new_turn(conversation_id: str, body: TurnRequest):
        return await application.state.core.conversations.submit(conversation_id, body)

    @application.post("/api/conversations/{conversation_id}/turns/{turn_id}/cancel")
    async def cancel_turn(conversation_id: str, turn_id: str):
        return await application.state.core.conversations.cancel(conversation_id, turn_id)

    @application.get("/api/conversations/{conversation_id}/events")
    async def conversation_events(
        conversation_id: str, request: Request, cursor: str | None = None
    ):
        manager = application.state.core.conversations
        await manager.get(conversation_id)
        initial_cursor = request.headers.get("Last-Event-ID") or cursor

        async def stream():
            current_cursor = initial_cursor
            while not await request.is_disconnected():
                async with manager.store.changed:
                    pending = await manager.store.replay(conversation_id, current_cursor)
                    if pending == []:
                        try:
                            await asyncio.wait_for(manager.store.changed.wait(), timeout=10)
                        except TimeoutError:
                            pass
                if pending is None:
                    yield 'event: resync.required\ndata: {"reason":"saved_snapshot_required"}\n\n'
                    return
                if pending:
                    for event in pending:
                        current_cursor = event["id"]
                        yield f"id: {event['id']}\nevent: state\ndata: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
                else:
                    yield ": heartbeat\n\n"

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
        )

    @application.post("/api/research-runs", status_code=202)
    async def start(body: ResearchRequest):
        return await application.state.core.create(body)

    @application.get("/api/research-runs")
    async def runs():
        return {"runs": await application.state.core.store.list()}

    @application.get("/api/research-runs/{run_id}")
    @application.get("/api/research-runs/{run_id}/snapshot")
    @application.get("/api/research-runs/{run_id}/results")
    async def snapshot(run_id: str):
        return await application.state.core.get(run_id)

    @application.get("/api/research-runs/{run_id}/events")
    async def events(run_id: str, request: Request, cursor: str | None = None):
        core = application.state.core
        await core.get(run_id)
        initial_cursor = request.headers.get("Last-Event-ID") or cursor

        async def stream():
            current_cursor = initial_cursor
            while not await request.is_disconnected():
                # Register a notification wait before reading replay, closing the check/wait race.
                async with core.store.changed:
                    pending = await core.store.replay(run_id, current_cursor)
                    if pending == []:
                        try:
                            await asyncio.wait_for(core.store.changed.wait(), timeout=10)
                        except TimeoutError:
                            pass
                if pending is None:
                    yield 'event: resync.required\ndata: {"reason":"saved_snapshot_required"}\n\n'
                    return
                if pending:
                    for event in pending:
                        current_cursor = event["id"]
                        yield f"id: {event['id']}\nevent: state\ndata: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
                else:
                    yield ": heartbeat\n\n"

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
        )

    @application.put("/api/research-runs/{run_id}/selections/{source_ref:path}")
    async def select(run_id: str, source_ref: str, body: SelectionRequest):
        await application.state.core.get(run_id)
        return await application.state.core.select(run_id, source_ref, body)

    @application.post("/api/research-runs/{run_id}/papers/{source_ref:path}/details")
    async def details(run_id: str, source_ref: str):
        return await application.state.core.details(run_id, source_ref)

    @application.post("/api/research-runs/{run_id}/papers/{source_ref:path}/metadata-checks")
    async def metadata_check(run_id: str, source_ref: str):
        return await application.state.core.metadata_check(run_id, source_ref)

    @application.post("/api/research-runs/{run_id}/exports")
    async def export(run_id: str):
        return await application.state.core.export(run_id)

    @application.post("/api/research-runs/{run_id}/cancel")
    async def cancel(run_id: str):
        await application.state.core.get(run_id)
        return await application.state.core.cancel(run_id)

    @mcp.tool()
    async def search_papers(run_id: str) -> dict:
        """Execute this active run's fixed provider-scoped hybrid plan; no scope overrides."""
        return await application.state.core.search_papers(run_id)

    @mcp.tool()
    async def get_research_run(run_id: str) -> dict:
        """Read already saved run state without research, model or embedding calls."""
        return await application.state.core.get(run_id)

    # Build the transport before lifespan enters its session-manager context.
    application.mount("/mcp", mcp.streamable_http_app())
    application.state.mcp = mcp
    return application


app = create_app()
