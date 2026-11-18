"""One isolated Hugging Face public dataset-catalog process."""

import argparse
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from ..paths import repository_path
from .dataset_catalog import add_dataset_routes
from .journal import Journal, ProviderError


def create_dataset_provider_app(mode="fixture", *, state_dir=None, http_client=None):
    if mode not in {"fixture", "live"}:
        raise ValueError("Dataset provider mode must be fixture or live.")
    directory = repository_path(state_dir or os.getenv("SCOUT_STATE_DIR", ".scout"))
    journal = Journal(
        directory / "providers" / "hugging_face" / mode,
        2,
        rate_limits=(("catalog_5min", 300, 400),),
    )

    @asynccontextmanager
    async def lifespan(_app):
        journal.acquire_writer()
        try:
            yield
        finally:
            journal.close()

    app = FastAPI(title="Research Scout Hugging Face dataset catalog", lifespan=lifespan)
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    app.state.journal = journal

    @app.exception_handler(ProviderError)
    async def error_handler(_request, error):
        return JSONResponse(
            {"provider": "hugging_face", "error": {"code": error.code, "message": str(error)}},
            status_code=error.status,
        )

    @app.get("/health")
    async def health():
        return {
            "provider": "hugging_face",
            "status": "ok",
            "mode": mode,
            "capabilities": {"datasets": True},
            "access_configured": True,
            "transport": "official_rest",
            "native_semantic_search": False,
        }

    add_dataset_routes(app, "hugging_face", mode, journal, http_client=http_client)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8120)
    parser.add_argument("--mode", choices=["fixture", "live"], default=None)
    args = parser.parse_args()
    mode = args.mode or os.getenv("SCOUT_HUGGING_FACE_MODE") or os.getenv("SCOUT_MODE", "fixture")
    uvicorn.run(create_dataset_provider_app(mode), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
