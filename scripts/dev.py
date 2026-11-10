#!/usr/bin/env python3
"""Launch owned local processes; a provider outage never stops the application core."""

from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import subprocess
import time
from pathlib import Path

from dotenv import load_dotenv

from research_scout.settings import child_environment, model_mode, provider_mode

ROOT = Path(__file__).resolve().parents[1]
PROVIDER_PORTS = {
    "openalex": 8111,
    "crossref": 8112,
    "datacite": 8113,
    "semantic_scholar": 8114,
    "arxiv": 8115,
    "openaire": 8116,
    "europe_pmc": 8117,
    "unpaywall": 8118,
}


def check_ports(ports: dict[str, int]) -> None:
    """Reject occupied/planned duplicate ports before starting any child process."""
    if len(set(ports.values())) != len(ports):
        raise ValueError("Research Scout services must use distinct ports.")
    for name, port in ports.items():
        if not 1 <= port <= 65535:
            raise ValueError(f"Invalid {name} port: {port}.")
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(("127.0.0.1", port))
        except OSError as error:
            raise ValueError(
                f"Cannot start {name}: local port {port} is occupied or unavailable. "
                "No Research Scout processes were started. Stop your earlier Scout launcher "
                "or choose unused ports; existing processes will not be reused or stopped."
            ) from error


def main():
    # Load only this repository's explicit configuration, never a parent repo's file.
    load_dotenv(ROOT / ".env", override=False)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["fixture", "live"], default=None)
    parser.add_argument(
        "--state-dir", help="Explicit local state directory; existing data is preserved"
    )
    parser.add_argument(
        "--check-config",
        action="store_true",
        help="Print resolved nonsecret modes without starting services or calling upstreams",
    )
    parser.add_argument(
        "--providers",
        nargs="*",
        choices=list(PROVIDER_PORTS),
        default=list(PROVIDER_PORTS),
    )
    parser.add_argument("--no-frontend", action="store_true")
    parser.add_argument("--core-port", type=int, default=8100)
    parser.add_argument("--frontend-port", type=int, default=3100)
    args = parser.parse_args()
    python = ROOT / ".venv/bin/python"
    if not python.exists():
        parser.error(
            "Create .venv and install the locked Python requirements first; see README.md."
        )
    if len(set(args.providers)) != len(args.providers):
        parser.error("Select each provider at most once.")
    ports = {name: PROVIDER_PORTS[name] for name in args.providers}
    ports["core"] = args.core_port
    if not args.no_frontend:
        ports["frontend"] = args.frontend_port
    environment = {
        **os.environ,
        "SCOUT_CORE_URL": f"http://127.0.0.1:{args.core_port}",
        "SCOUT_API_URL": f"http://127.0.0.1:{args.core_port}",
    }
    if args.state_dir:
        environment["SCOUT_STATE_DIR"] = args.state_dir
    if args.mode is not None:
        environment["SCOUT_MODE"] = args.mode
        for name in PROVIDER_PORTS:
            environment[f"SCOUT_{name.upper()}_MODE"] = args.mode
        if not args.state_dir:
            # An explicit fixture run must not write into the loaded live namespace.
            environment["SCOUT_STATE_DIR"] = str(ROOT / ".scout" / args.mode)
        if args.mode == "fixture":
            # Fixture acceptance must never inherit live generation from root .env.
            environment["SCOUT_GENERATION_ENABLED"] = "false"
            environment["SCOUT_RETRIEVAL_ENABLED"] = "false"
    try:
        modes = {name: provider_mode(name, environment) for name in args.providers}
        environment["SCOUT_MODEL_MODE"] = model_mode(environment)
    except ValueError as error:
        parser.error(str(error))
    environment.setdefault("SCOUT_MODE", "fixture")
    for name, mode in modes.items():
        environment[f"SCOUT_{name.upper()}_MODE"] = mode
    if args.check_config:
        print(
            json.dumps(
                {
                    "provider_modes": modes,
                    "model_mode": environment["SCOUT_MODEL_MODE"],
                    "generation_enabled": environment.get(
                        "SCOUT_GENERATION_ENABLED", "false"
                    ).lower()
                    in {"1", "true"},
                    "retrieval_enabled": environment.get("SCOUT_RETRIEVAL_ENABLED", "false").lower()
                    in {"1", "true"},
                    "state_dir": environment.get("SCOUT_STATE_DIR", ".scout"),
                    "core_url": environment["SCOUT_CORE_URL"],
                    "credential_values_disclosed": False,
                },
                indent=2,
            )
        )
        return
    try:
        check_ports(ports)
    except ValueError as error:
        parser.error(str(error))
    logs = ROOT / ".scout/logs"
    logs.mkdir(parents=True, exist_ok=True)
    node_bin = ROOT / ".tools/node/bin"
    if node_bin.exists():
        environment["PATH"] = str(node_bin) + os.pathsep + environment.get("PATH", "")
    children: list[tuple[str, subprocess.Popen, object]] = []
    stopped = False

    def start(name, command, cwd=ROOT):
        log = (logs / f"{name}.log").open("a")
        child = subprocess.Popen(
            command,
            cwd=cwd,
            env=child_environment(name, environment),
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        children.append((name, child, log))
        print(f"{name}: pid {child.pid}; log {logs / (name + '.log')}", flush=True)

    def stop(_signal=None, _frame=None):
        nonlocal stopped
        if stopped:
            return
        stopped = True
        for _, child, _ in reversed(children):
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        for name in args.providers:
            port = PROVIDER_PORTS[name]
            start(
                name,
                [
                    str(python),
                    "-m",
                    "research_scout.providers",
                    "--provider",
                    name,
                    "--port",
                    str(port),
                    "--mode",
                    modes[name],
                ],
            )
        start(
            "core",
            [
                str(python),
                "-m",
                "uvicorn",
                "research_scout.api:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(args.core_port),
            ],
        )
        if not args.no_frontend:
            npm = str(node_bin / "npm") if (node_bin / "npm").exists() else "npm"
            start(
                "frontend",
                [
                    npm,
                    "run",
                    "dev",
                    "--",
                    "--hostname",
                    "127.0.0.1",
                    "--port",
                    str(args.frontend_port),
                ],
                ROOT / "frontend",
            )
        answer_mode = (
            "optional answer streaming enabled"
            if environment.get("SCOUT_GENERATION_ENABLED", "false").lower() == "true"
            else "answer streaming disabled"
        )
        refinement_mode = (
            "AI query refinement enabled"
            if environment.get("SCOUT_RETRIEVAL_ENABLED", "false").lower() == "true"
            else "AI query refinement disabled"
        )
        print(
            f"Research Scout ({answer_mode}; {refinement_mode}; deterministic Deep Agents dispatch): "
            f"http://127.0.0.1:{args.frontend_port if not args.no_frontend else args.core_port}",
            flush=True,
        )
        print(
            "Provider modes: " + ", ".join(f"{name}={mode}" for name, mode in modes.items()),
            flush=True,
        )
        print(
            "Provider processes are independent. Ctrl-C stops only these launched processes.",
            flush=True,
        )
        reported = set()
        while not stopped:
            for name, child, _ in children:
                if child.poll() is not None and name not in reported:
                    reported.add(name)
                    print(f"{name} exited ({child.returncode}); inspect its log.", flush=True)
                    if name in {"core", "frontend"}:
                        stop()
            time.sleep(0.25)
    finally:
        stop()
        for _, child, log in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)
            log.close()


if __name__ == "__main__":
    main()
