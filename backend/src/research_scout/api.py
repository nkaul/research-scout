"""Loopback application API and the real local Streamable HTTP MCP server."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .auth import AuthError, AuthMiddleware, AuthService
from .contracts import (
    DEFAULT_VIDEO_COUNT,
    MAX_VIDEO_COUNT,
    ConversationRequest,
    ResearchRequest,
    SelectionRequest,
    TurnRequest,
)
from .core import ApplicationError, Core, Settings
from .dataset_contracts import DatasetSearchRequest
from .projects import (
    ConceptCreate,
    ProjectCreate,
    ProjectQueryRequest,
    ProjectResourceRequest,
    ResearchProjects,
)
from .repo_contracts import RepoSearchRequest
from .repo_reading import RepoNoteRequest
from .settings import AuthSettings


class EconomicsReset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotency_key: str = Field(min_length=1, max_length=128)
    expected_window_id: str = Field(min_length=1, max_length=128)


def create_app(
    settings: Settings | None = None,
    *,
    core_factory=None,
    auth_settings: AuthSettings | None = None,
    auth_clock=None,
    google_verifier=None,
) -> FastAPI:
    config = settings or Settings()
    auth_config = auth_settings or AuthSettings.from_environment(config.state_dir, config.mode)
    if auth_config.enabled and auth_config.db_path.resolve() == config.economics_path.resolve():
        raise ValueError("Authentication and economics must use separate databases.")
    auth = AuthService(
        auth_config,
        google_verifier=google_verifier,
        **({"clock": auth_clock} if auth_clock is not None else {}),
    )
    mcp = FastMCP(
        "Research Scout",
        stateless_http=True,
        json_response=True,
        streamable_http_path="/",
        max_request_body_size=64 * 1024,
    )

    @asynccontextmanager
    async def lifespan(application):
        auth.start()
        core = core_factory(config) if core_factory else Core(config)
        application.state.core = core
        projects = None
        try:
            projects = ResearchProjects(config.state_dir / "projects", core)
            application.state.projects = projects
            async with mcp.session_manager.run():
                yield
        finally:
            if projects:
                projects.close()
            await core.close()

    application = FastAPI(title="Research Scout", version="0.1.0", lifespan=lifespan)
    application.state.auth = auth
    application.include_router(auth.router())
    application.add_middleware(AuthMiddleware, auth=auth)
    application.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(auth_config.frontend_origins),
        allow_credentials=auth_config.enabled,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type", "Last-Event-ID", "X-CSRF-Token"],
    )

    @application.exception_handler(AuthError)
    async def authentication_error(_request, error):
        return JSONResponse(
            {"detail": str(error)}, status_code=error.status, headers={"Cache-Control": "no-store"}
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        if request.url.path.startswith("/api/auth/"):
            # Pydantic errors otherwise echo submitted passwords/ID tokens in `input`.
            return JSONResponse({"detail": "Invalid authentication request."}, status_code=422)
        return await request_validation_exception_handler(request, error)

    @application.exception_handler(ApplicationError)
    async def application_error(_request, error):
        return JSONResponse({"detail": str(error)}, status_code=error.status)

    @application.get("/health")
    async def health():
        if auth_config.enabled:
            return {"status": "ok", "service": "research_scout_core", "authentication": "enabled"}
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
            "modality_limits": {
                "defaults": {"papers": 20, "videos": 10, "datasets": 10, "repos": 10},
                "min": 0,
                "max": {"papers": 20, "videos": 20, "datasets": 20, "repos": 20},
                "papers_scope": "unique eligible canonical result cap and per-provider candidate cap",
                "datasets_scope": "per catalog",
                "zero_disables_lane": True,
                "legacy_omission": "papers_and_videos_only",
            },
            "retrieval": application.state.core.retrieval.readiness(),
            "routing": "deterministic_with_optional_agentic_retrieval"
            if application.state.core.retrieval.config.enabled
            else "deterministic",
            "youtube": {
                "video_count": {"default": DEFAULT_VIDEO_COUNT, "min": 1, "max": MAX_VIDEO_COUNT},
                "request_limit_per_run": 8,
                "metadata_request_grant": 1,
                "transcript_request_grant": 3,
            },
            "datasets": {
                "providers": ["hugging_face", "datacite"],
                "limit": {"default": 10, "min": 1, "max": 20},
                "requires_saved_agentic_plan": False,
                "requires_saved_query": True,
                "query_modes": ["ai", "direct"],
                "ai_requires_saved_resource_plan": True,
                "new_model_calls": False,
                "scope": "catalog_metadata_only",
            },
            "repos": {
                "providers": ["github"],
                "limit": {"default": 10, "min": 1, "max": 20},
                "readme_limit": 5,
                "identity_check_limit": 5,
                "request_limit": 11,
                "requires_saved_agentic_plan": False,
                "requires_saved_query": True,
                "query_modes": ["ai", "direct"],
                "ai_requires_saved_resource_plan": True,
                "new_model_calls": False,
                "vectors": False,
                "scope": "public_metadata_and_bounded_readme_evidence",
            },
        }

    @application.get("/api/economics")
    async def get_economics():
        return application.state.core.generation.economics.get_economics()

    @application.post("/api/economics/reset")
    async def reset_economics(body: EconomicsReset):
        from .economics import EconomicsError

        try:
            return application.state.core.generation.economics.reset(
                body.expected_window_id, body.idempotency_key
            )
        except EconomicsError as error:
            raise ApplicationError(str(error), 409) from None

    @application.get("/api/admin/economics")
    async def admin_economics(
        limit: int = Query(default=25, ge=1, le=100),
        cursor: str | None = Query(default=None, max_length=256),
        day: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    ):
        from .economics import EconomicsError

        try:
            return application.state.core.generation.economics.admin(
                limit=limit, cursor=cursor, day=day
            )
        except EconomicsError as error:
            raise ApplicationError(str(error), 409) from None

    @application.get("/api/providers")
    async def providers():
        return await application.state.core.providers()

    @application.get("/api/dataset-providers")
    async def dataset_providers():
        return await application.state.core.datasets.providers()

    @application.post("/api/dataset-searches", status_code=202)
    async def start_dataset_search(body: DatasetSearchRequest):
        return await application.state.core.datasets.create(body)

    @application.get("/api/dataset-searches")
    async def dataset_searches(conversation_id: str | None = None, turn_id: str | None = None):
        return {"searches": await application.state.core.datasets.list(conversation_id, turn_id)}

    @application.get("/api/dataset-searches/{search_id}")
    async def dataset_search(search_id: str):
        return await application.state.core.datasets.get(search_id)

    @application.post("/api/dataset-searches/{search_id}/cancel")
    async def cancel_dataset_search(search_id: str):
        return await application.state.core.datasets.cancel(search_id)

    @application.get("/api/dataset-searches/{search_id}/events")
    async def dataset_search_events(search_id: str, request: Request, cursor: str | None = None):
        manager = application.state.core.datasets
        await manager.get(search_id)

        async def stream():
            current_cursor = request.headers.get("Last-Event-ID") or cursor
            while not await request.is_disconnected():
                async with manager.store.changed:
                    pending = await manager.store.replay(search_id, current_cursor)
                    if pending == []:
                        try:
                            await asyncio.wait_for(manager.store.changed.wait(), timeout=10)
                        except TimeoutError:
                            pass
                if pending is None:
                    yield 'event: resync.required\ndata: {"reason":"saved_snapshot_required"}\n\n'
                    return
                for event in pending or []:
                    current_cursor = event["id"]
                    yield f"id: {event['id']}\nevent: state\ndata: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
                if not pending:
                    yield ": heartbeat\n\n"

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    @application.post("/api/conversations", status_code=201)
    async def new_conversation(body: ConversationRequest):
        return await application.state.core.conversations.create(body)

    @application.get("/api/repo-providers")
    async def repo_providers():
        return await application.state.core.repos.providers()

    @application.post("/api/repo-searches", status_code=202)
    async def start_repo_search(body: RepoSearchRequest):
        return await application.state.core.repos.create(body)

    @application.get("/api/repo-searches")
    async def repo_searches(conversation_id: str | None = None, turn_id: str | None = None):
        return {"searches": await application.state.core.repos.list(conversation_id, turn_id)}

    @application.get("/api/repo-searches/{search_id}")
    async def repo_search(search_id: str):
        return await application.state.core.repos.get(search_id)

    @application.get("/api/repo-searches/{search_id}/records/{record_id}/readme")
    async def repository_readme(
        search_id: str, record_id: str, evidence_version: str = Query(pattern=r"^[0-9a-f]{64}$")
    ):
        return await application.state.core.repos.readable(search_id, record_id, evidence_version)

    @application.get(
        "/api/repo-searches/{search_id}/records/{record_id}/evidence/{evidence_version}"
    )
    async def repository_evidence(search_id: str, record_id: str, evidence_version: str):
        return await application.state.core.repos.evidence(search_id, record_id, evidence_version)

    @application.get("/api/repo-searches/{search_id}/records/{record_id}/notes")
    async def repository_note(search_id: str, record_id: str):
        return await application.state.core.repos.get_note(search_id, record_id)

    @application.put("/api/repo-searches/{search_id}/records/{record_id}/notes")
    async def save_repository_note(search_id: str, record_id: str, body: RepoNoteRequest):
        return await application.state.core.repos.put_note(search_id, record_id, body)

    @application.post("/api/repo-searches/{search_id}/cancel")
    async def cancel_repo_search(search_id: str):
        return await application.state.core.repos.cancel(search_id)

    @application.get("/api/repo-searches/{search_id}/events")
    async def repo_search_events(search_id: str, request: Request, cursor: str | None = None):
        manager = application.state.core.repos
        await manager.get(search_id)

        async def stream():
            current_cursor = request.headers.get("Last-Event-ID") or cursor
            while not await request.is_disconnected():
                async with manager.store.changed:
                    pending = await manager.store.replay(search_id, current_cursor)
                    if pending == []:
                        try:
                            await asyncio.wait_for(manager.store.changed.wait(), timeout=10)
                        except TimeoutError:
                            pass
                if pending is None:
                    yield 'event: resync.required\ndata: {"reason":"saved_snapshot_required"}\n\n'
                    return
                for event in pending or []:
                    current_cursor = event["id"]
                    yield f"id: {event['id']}\nevent: state\ndata: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
                if not pending:
                    yield ": heartbeat\n\n"

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    @application.get("/api/projects")
    async def projects():
        return {"projects": await application.state.projects.list()}

    @application.post("/api/projects", status_code=201)
    async def create_project(body: ProjectCreate):
        return await application.state.projects.create(body)

    @application.get("/api/projects/{project_id}")
    async def project(project_id: str):
        return await application.state.projects.get(project_id)

    @application.post("/api/projects/{project_id}/concepts")
    async def add_project_concept(project_id: str, body: ConceptCreate):
        return await application.state.projects.add_concept(project_id, body)

    @application.post("/api/projects/{project_id}/queries")
    async def add_project_query(project_id: str, body: ProjectQueryRequest):
        return await application.state.projects.add_query(project_id, body)

    @application.post("/api/projects/{project_id}/resources")
    async def add_project_resource(project_id: str, body: ProjectResourceRequest):
        return await application.state.projects.add_resource(project_id, body)

    @application.get("/api/conversations")
    async def conversations():
        return {"conversations": await application.state.core.conversations.store.summaries()}

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
    async def runs(summary: bool = False, limit: int = Query(default=12, ge=1, le=100)):
        if summary:
            return {"runs": await application.state.core.store.summaries(limit=limit)}
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

    @application.post("/api/research-runs/{run_id}/papers/{source_ref:path}/transcript")
    async def transcript(run_id: str, source_ref: str):
        return await application.state.core.transcript(run_id, source_ref)

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

    @mcp.tool()
    async def search_datasets(search_id: str, provider: str) -> dict:
        """Execute one admitted dataset search's fixed catalog scope; metadata only."""
        return await application.state.core.datasets.search_provider(search_id, provider)

    @mcp.tool()
    async def get_dataset_search(search_id: str) -> dict:
        """Read saved dataset metadata without provider/model/file access."""
        return await application.state.core.datasets.get(search_id)

    @mcp.tool()
    async def search_repositories(search_id: str) -> dict:
        """Execute one admitted public GitHub repository search without scope overrides."""
        return await application.state.core.repos.search_repositories(search_id)

    @mcp.tool()
    async def get_repository_search(search_id: str) -> dict:
        """Read saved public metadata and README evidence without provider/model calls."""
        return await application.state.core.repos.get(search_id)

    # Build the transport before lifespan enters its session-manager context.
    application.mount("/mcp", mcp.streamable_http_app())
    application.state.mcp = mcp
    return application


app = create_app()
