#!/usr/bin/env python3
"""Explicitly download only the pinned public tokenizer/quantized CPU encoder."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

from research_scout.providers.onnx_encoder import (
    FILES,
    MODEL,
    REVISION,
    cache_directory,
    verify_artifact,
)


def main():
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    folder = cache_directory()
    hashes = {}
    with httpx.Client(timeout=120, follow_redirects=True, trust_env=False) as client:
        for name in FILES:
            destination = folder / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists():
                temporary = destination.with_suffix(destination.suffix + ".download")
                size = 0
                try:
                    with client.stream("GET", f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}") as response:
                        response.raise_for_status()
                        with temporary.open("wb") as output:
                            for chunk in response.iter_bytes():
                                size += len(chunk)
                                if size > 100 * 1024 * 1024:
                                    raise ValueError("Encoder artifact exceeds download bound")
                                output.write(chunk)
                    verify_artifact(temporary, name)
                    temporary.replace(destination)
                finally:
                    temporary.unlink(missing_ok=True)
            # Existing files must pass publisher fingerprints too; rerunning cannot bless corruption.
            hashes[name] = verify_artifact(destination, name)
    manifest = {"model": MODEL, "revision": REVISION, "sha256": hashes, "cached_at": datetime.now(UTC).isoformat(), "source": f"https://huggingface.co/{MODEL}/tree/{REVISION}"}
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"cached": True, "model": MODEL, "revision": REVISION, "files": len(FILES), "hosted_model_calls": 0}))


if __name__ == "__main__":
    main()
