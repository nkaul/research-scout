"""Launch exactly one provider: python -m research_scout.providers --provider openalex --port 8111."""

import argparse
import os
import sys

import uvicorn

from .encoders import load_configured_encoder
from .service import PROVIDERS, create_provider_app
from .upstream import LOCAL_POOL_PROVIDERS


def main():
    parser = argparse.ArgumentParser(description="Independent Research Scout provider process")
    parser.add_argument("--provider", choices=PROVIDERS, required=True)
    parser.add_argument("--port", type=int, default=8111)
    parser.add_argument("--mode", choices=("fixture", "live"))
    parser.add_argument(
        "--encoder-factory",
        help="Explicit installed module:function creating a compatible local query/document encoder for a live REST discovery pool",
    )
    args = parser.parse_args()
    mode = (
        args.mode
        or os.getenv(f"SCOUT_{args.provider.upper()}_MODE")
        or os.getenv("SCOUT_MODE", "fixture")
    )
    if mode not in {"fixture", "live"}:
        parser.error("Provider mode must be fixture or live.")
    encoder = None
    encoder_status = None
    encoder_factory = args.encoder_factory or (
        (
            os.getenv("SCOUT_LOCAL_ENCODER_FACTORY")
            or os.getenv("SCOUT_SEMANTIC_SCHOLAR_ENCODER_FACTORY")
        )
        if args.provider in LOCAL_POOL_PROVIDERS and mode == "live"
        else None
    )
    if encoder_factory:
        if args.provider not in LOCAL_POOL_PROVIDERS or mode != "live":
            parser.error(
                "A configured local encoder belongs only to a live REST discovery candidate pool."
            )
        if ":" not in encoder_factory:
            parser.error("Encoder factory format is module:function")
        encoder, encoder_status = load_configured_encoder(encoder_factory)
        if encoder_status:
            print(f"{args.provider} local reranking unavailable: {encoder_status}", file=sys.stderr)
    # The app lifespan owns the advisory lock for both CLI and factory-based launches.
    uvicorn.run(
        create_provider_app(args.provider, mode, encoder=encoder, encoder_status=encoder_status),
        host="127.0.0.1",
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
