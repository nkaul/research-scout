#!/usr/bin/env python3
"""Explicit bounded live provider proof; without --live inspect configuration only."""

from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

from research_scout.providers.encoders import load_configured_encoder
from research_scout.providers.service import PROVIDERS, create_provider_app


async def preflight(
    provider: str, live: bool, state_dir: Path, query: str, *, discovery: bool = False
) -> dict:
    proof_id = "proof-" + uuid.uuid4().hex
    encoder, encoder_status = (
        load_configured_encoder()
        if provider in {"semantic_scholar", "crossref", "arxiv", "openaire", "europe_pmc"}
        else (None, None)
    )
    app = create_provider_app(
        provider,
        "live",
        state_dir=state_dir / proof_id,
        encoder=encoder,
        encoder_status=encoder_status,
    )
    report = {
        "observed_at": datetime.now(UTC).isoformat(),
        "provider": provider,
        "mode": "live",
        "execution": "provider_asgi_contract_to_real_upstream",
        "live_requested": live,
        "operations": [],
        "model_http_attempts": 0,
    }
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://provider", timeout=180
        ) as client:
            report["configuration"] = (await client.get("/health")).json()
            if not live:
                report["status"] = "configuration_only_not_live_proof"
                return report
            if not report["configuration"]["access_configured"]:
                report["status"] = "blocked_access"
                return report
            base = {"run_id": proof_id, "remaining_attempts": 1}

            async def singleton(kind, identity):
                response = await client.post(
                    f"/operations/{kind}",
                    json={**base, "operation_id": proof_id + "-" + kind, **identity},
                )
                data = response.json()
                record = data.get("record") or {}
                observed = {
                    "operation": kind,
                    "http_status": response.status_code,
                    "attempts": data.get("attempts", 0),
                    "error": data.get("error"),
                    "agency": data.get("agency"),
                }
                if record:
                    observed["record"] = {
                        key: record.get(key)
                        for key in (
                            "source_ref",
                            "record_id",
                            "doi",
                            "year",
                            "resource_type",
                            "mode",
                        )
                    }
                    observed["record"]["abstract_chars"] = len(record.get("abstract") or "")
                if data.get("access"):
                    observed["access"] = {
                        key: data["access"].get(key)
                        for key in ("doi", "provider", "mode", "is_oa", "observed_at")
                    }
                report["operations"].append(observed)

            if provider == "crossref" and not discovery:
                await singleton("agency", {"doi": "10.1038/nphys1170"})
                await singleton("metadata", {"doi": "10.1038/nphys1170"})
            elif provider == "datacite":
                await singleton("metadata", {"doi": "10.14454/qdd3-ps68"})
            elif provider == "unpaywall":
                await singleton("access", {"doi": "10.1038/nature12373"})
            else:
                response = await client.post(
                    "/operations/search",
                    json={
                        "run_id": proof_id,
                        "operation_id": proof_id + "-search",
                        "provider": provider,
                        "query": query,
                        "filters": {},
                        "limits": {"per_branch": 2, "total": 4, "remaining_attempts": 2},
                    },
                )
                events = [json.loads(line) for line in response.text.splitlines() if line]
                summary = {
                    "operation": "search",
                    "http_status": response.status_code,
                    "branches": [
                        {
                            key: event.get(key)
                            for key in ("branch", "kind", "count", "error", "message")
                        }
                        for event in events
                        if event.get("kind") in {"branch.completed", "branch.failed"}
                    ],
                    "sources": list(
                        dict.fromkeys(
                            event["record"]["source_ref"]
                            for event in events
                            if event.get("kind") == "source"
                        )
                    ),
                    "abstract_sources": list(dict.fromkeys(
                        event["record"]["source_ref"]
                        for event in events
                        if event.get("kind") == "source" and event["record"].get("abstract")
                    )),
                    "attempts": next(
                        (
                            e.get("attempts", 0)
                            for e in reversed(events)
                            if e.get("kind") == "complete"
                        ),
                        0,
                    ),
                    "status": next(
                        (e.get("status") for e in reversed(events) if e.get("kind") == "complete"),
                        "failed",
                    ),
                }
                report["operations"].append(summary)
                first = next((e["record"] for e in events if e.get("kind") == "source"), None)
                if first:
                    await singleton("details", {"record_id": first["record_id"]})
            report["readiness_after"] = (await client.get("/health")).json()
    successes = all(
        op["http_status"] == 200
        and not op.get("error")
        and op.get("status", "succeeded") == "succeeded"
        for op in report["operations"]
    )
    report["status"] = "passed" if successes else "partial_or_failed"
    report["research_upstream_attempts"] = sum(op["attempts"] for op in report["operations"])
    return report


def main():
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", required=True, choices=PROVIDERS)
    parser.add_argument("--live", action="store_true", help="Make bounded actual upstream calls")
    parser.add_argument("--state-dir", type=Path, default=Path(".scout/preflight"))
    parser.add_argument("--query", default="persistent memory for research agents")
    parser.add_argument("--discovery", action="store_true", help="Exercise Crossref discovery rather than the default DOI agency/metadata proof")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        report = asyncio.run(preflight(
            args.provider, args.live, args.state_dir, args.query, discovery=args.discovery
        ))
    except Exception:
        report = {
            "provider": args.provider,
            "status": "configuration_or_transport_error",
            "error": "Preflight could not complete; inspect configured endpoints and access without printing credentials.",
        }
    rendered = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")
    if args.live and report["status"] != "passed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
