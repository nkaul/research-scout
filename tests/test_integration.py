"""Real loopback processes and MCP, with authored fixture data and scripted models."""

import json
import os
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
TERMINAL = {"SUCCEEDED", "EMPTY", "PARTIAL", "FAILED", "CANCELLED", "INTERRUPTED"}


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


@pytest.fixture(scope="module")
def stack(tmp_path_factory):
    directory = tmp_path_factory.mktemp("process-integration")
    ports = {
        key: free_port() for key in ("core", "openalex", "crossref", "datacite", "semantic_scholar")
    }
    environment = {
        **os.environ,
        "SCOUT_STATE_DIR": str(directory / "state"),
        "SCOUT_MODE": "fixture",
        "SCOUT_CORE_URL": f"http://127.0.0.1:{ports['core']}",
    }
    environment.update(
        {
            f"SCOUT_{key.upper()}_URL": f"http://127.0.0.1:{port}"
            for key, port in ports.items()
            if key != "core"
        }
    )
    processes = {}
    logs = []
    try:
        for name, port in ports.items():
            if name == "core":
                command = [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "research_scout.api:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ]
            else:
                command = [
                    sys.executable,
                    "-m",
                    "research_scout.providers",
                    "--provider",
                    name,
                    "--mode",
                    "fixture",
                    "--port",
                    str(port),
                ]
            handle = (directory / f"{name}.log").open("w")
            logs.append(handle)
            processes[name] = subprocess.Popen(
                command, cwd=ROOT, env=environment, stdout=handle, stderr=subprocess.STDOUT
            )
        with httpx.Client(timeout=10, trust_env=False) as client:
            for name, port in ports.items():
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    try:
                        if client.get(f"http://127.0.0.1:{port}/health").is_success:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.05)
                else:
                    pytest.fail(
                        f"{name} did not start: {(directory / (name + '.log')).read_text()[-3000:]}"
                    )
            yield {
                "base": f"http://127.0.0.1:{ports['core']}",
                "client": client,
                "processes": processes,
                "directory": directory,
            }
    finally:
        for child in processes.values():
            if child.poll() is None:
                child.terminate()
        for child in processes.values():
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=3)
        for handle in logs:
            handle.close()


def start(stack, query="Institutional AI readiness", provider="openalex"):
    response = stack["client"].post(
        stack["base"] + "/api/research-runs",
        json={
            "question": query,
            "provider": provider,
            "filters": {"year_from": 2020, "year_to": 2026},
            "idempotency_key": uuid.uuid4().hex,
        },
    )
    response.raise_for_status()
    return response.json()["id"]


def snapshot(stack, run_id):
    response = stack["client"].get(stack["base"] + f"/api/research-runs/{run_id}/snapshot")
    response.raise_for_status()
    return response.json()


def finish(stack, run_id):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        value = snapshot(stack, run_id)
        if value["status"] in TERMINAL:
            return value
        time.sleep(0.04)
    pytest.fail("Fixture run did not reach a bounded terminal outcome.")


def test_real_agent_mcp_progressive_save_registry_export_and_replay(stack):
    client, base = stack["client"], stack["base"]
    run_id = start(stack)
    selected_ref = None
    early_cursor = None
    saw_early = False
    with client.stream("GET", base + f"/api/research-runs/{run_id}/events", timeout=15) as stream:
        stream.raise_for_status()
        for line in stream.iter_lines():
            if not line.startswith("data: "):
                continue
            state = json.loads(line[6:])["snapshot"]
            if state["entities"] and not selected_ref:
                assert state["status"] == "RUNNING"
                assert state["summary"] is None
                selected_ref = state["entities"][0]["source_ref"]
                early_cursor = state["cursor"]
                response = client.put(
                    base + f"/api/research-runs/{run_id}/selections/{selected_ref}",
                    json={
                        "state": "included",
                        "reason": "Saved before the semantic branch finished",
                        "expected_revision": state["revision"],
                    },
                )
                response.raise_for_status()
                saw_early = True
            if state["status"] in TERMINAL:
                break
    state = snapshot(stack, run_id)
    assert saw_early and state["status"] == "SUCCEEDED"
    assert state["selections"][selected_ref]["state"] == "included"
    assert len(state["entities"]) == len({e["source_ref"] for e in state["entities"]})
    assert any(set(e["branch_ranks"]) == {"lexical", "semantic"} for e in state["entities"])
    assert state["runtime"]["agent_usage"]["delegations"] == 1
    assert state["runtime"]["agent_usage"]["application_mcp_calls"] == 1
    assert state["usage"]["by_provider"] == {"openalex": 2}

    first_export = client.post(base + f"/api/research-runs/{run_id}/exports").json()
    assert "fictional fixture records" in first_export["bibliography"]
    before_title = next(e["title"] for e in state["entities"] if e["source_ref"] == selected_ref)
    checked = client.post(
        base + f"/api/research-runs/{run_id}/papers/{selected_ref}/metadata-checks"
    )
    checked.raise_for_status()
    check_state = checked.json()
    check = check_state["checks"][selected_ref]
    assert check["status"] in {"registry_match", "registry_conflict"}
    assert (
        next(e["title"] for e in check_state["entities"] if e["source_ref"] == selected_ref)
        == before_title
    )
    assert check["record"]["provider"] == check["agency"]
    adopted = client.put(
        base + f"/api/research-runs/{run_id}/selections/{selected_ref}",
        json={
            "state": "included",
            "reason": "Explicit whole-record registry citation",
            "expected_revision": check_state["revision"],
            "citation_source": "registry",
        },
    )
    adopted.raise_for_status()
    second_export = client.post(base + f"/api/research-runs/{run_id}/exports").json()
    assert second_export["revision"] > first_export["revision"]
    assert (
        first_export["manifest"]["sources"][0]["selection"]["source_snapshot"]["provider"]
        == "openalex"
    )
    assert (
        second_export["manifest"]["sources"][0]["selection"]["source_snapshot"]["provider"]
        == check["agency"]
    )
    usage = snapshot(stack, run_id)["usage"]
    with client.stream(
        "GET", base + f"/api/research-runs/{run_id}/events", params={"cursor": early_cursor}
    ) as replay:
        for line in replay.iter_lines():
            if line.startswith("data: "):
                assert json.loads(line[6:])["snapshot"]["cursor"] != early_cursor
                break
    assert snapshot(stack, run_id)["usage"] == usage


def test_registration_aware_datacite_route_preserves_resource_type_and_cache(stack):
    run_id = start(stack, "Registration-aware dataset metadata fixture")
    state = finish(stack, run_id)
    source = next(record for record in state["entities"] if "datacite" in (record.get("doi") or ""))
    ref = source["source_ref"]
    base, client = stack["base"], stack["client"]
    selected = client.put(
        base + f"/api/research-runs/{run_id}/selections/{ref}",
        json={
            "state": "included",
            "reason": "Explicit metadata comparison",
            "expected_revision": state["revision"],
        },
    )
    selected.raise_for_status()
    checked = client.post(base + f"/api/research-runs/{run_id}/papers/{ref}/metadata-checks")
    checked.raise_for_status()
    value = checked.json()
    assert value["checks"][ref]["agency"] == "datacite"
    assert value["checks"][ref]["record"]["resource_type"] == "Dataset"
    assert (
        next(record for record in value["entities"] if record["source_ref"] == ref)["resource_type"]
        == "article"
    )
    assert value["usage"]["by_provider"] == {"openalex": 2, "crossref": 1, "datacite": 1}
    repeated = client.post(base + f"/api/research-runs/{run_id}/papers/{ref}/metadata-checks")
    repeated.raise_for_status()
    assert repeated.json()["usage"] == value["usage"]


def test_branch_failure_keeps_progressive_candidates(stack):
    run_id = start(stack, "fail-semantic")
    state = finish(stack, run_id)
    assert state["status"] == "PARTIAL"
    assert state["entities"]
    assert state["operations"]["semantic"]["status"] == "failed"
    assert set(state["usage"]["by_provider"]) == {"openalex"}


def test_cancellation_fences_late_results(stack):
    run_id = start(stack, "Cancellation fixture")
    deadline = time.monotonic() + 5
    state = snapshot(stack, run_id)
    while not state["entities"] and time.monotonic() < deadline:
        time.sleep(0.03)
        state = snapshot(stack, run_id)
    assert state["entities"]
    cancelled = stack["client"].post(stack["base"] + f"/api/research-runs/{run_id}/cancel")
    cancelled.raise_for_status()
    identities = [e["source_ref"] for e in cancelled.json()["entities"]]
    time.sleep(1.2)
    later = snapshot(stack, run_id)
    assert later["status"] == "CANCELLED"
    assert [e["source_ref"] for e in later["entities"]] == identities


def test_independent_complementary_provider_and_saved_outage_behavior(stack):
    stack["processes"]["openalex"].terminate()
    stack["processes"]["openalex"].wait(timeout=5)
    run_id = start(stack, "Complementary isolated fixture", "semantic_scholar")
    state = finish(stack, run_id)
    assert state["status"] == "SUCCEEDED"
    assert set(state["usage"]["by_provider"]) == {"semantic_scholar"}
    ref = state["entities"][0]["source_ref"]
    response = stack["client"].put(
        stack["base"] + f"/api/research-runs/{run_id}/selections/{ref}",
        json={
            "state": "included",
            "reason": "Offline saved work",
            "expected_revision": state["revision"],
        },
    )
    response.raise_for_status()
    for name, child in stack["processes"].items():
        if name != "core" and child.poll() is None:
            child.terminate()
            child.wait(timeout=5)
    usage = snapshot(stack, run_id)["usage"]
    exported = stack["client"].post(stack["base"] + f"/api/research-runs/{run_id}/exports")
    exported.raise_for_status()
    assert exported.json()["manifest"]["provider"] == "semantic_scholar"
    assert snapshot(stack, run_id)["usage"] == usage
