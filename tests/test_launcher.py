"""A launcher must not accidentally attach Scout to an unrelated existing service."""

import importlib.util
import socket
import sys
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "scout_dev_launcher", Path(__file__).resolve().parents[1] / "scripts/dev.py"
)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


def test_occupied_port_rejected_before_starting_any_process(tmp_path, monkeypatch, capsys):
    python = tmp_path / ".venv/bin/python"
    python.parent.mkdir(parents=True)
    python.touch()
    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    with socket.socket() as existing:
        existing.bind(("127.0.0.1", 0))
        existing.listen()
        port = existing.getsockname()[1]
        monkeypatch.setattr(
            sys, "argv", ["dev.py", "--no-frontend", "--providers", "--core-port", str(port)]
        )
        monkeypatch.setattr(
            launcher.subprocess,
            "Popen",
            lambda *args, **kwargs: pytest.fail("An occupied-port startup launched a child"),
        )
        with pytest.raises(SystemExit) as stopped:
            launcher.main()
        assert stopped.value.code == 2
        assert f"local port {port}" in capsys.readouterr().err
        assert not (tmp_path / ".scout/logs").exists()
        # The existing listener remains owned by this test and open.
        assert existing.getsockname()[1] == port


def test_duplicate_planned_ports_are_rejected():
    with pytest.raises(ValueError, match="distinct ports"):
        launcher.check_ports({"core": 8100, "frontend": 8100})


@pytest.mark.parametrize("port", [0, 65536])
def test_invalid_port_is_rejected(port):
    with pytest.raises(ValueError, match="Invalid core port"):
        launcher.check_ports({"core": port})


def test_env_modes_survive_unspecified_cli_and_explicit_fixture_isolated(
    tmp_path, monkeypatch, capsys
):
    python = tmp_path / ".venv/bin/python"
    python.parent.mkdir(parents=True)
    python.touch()
    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    (tmp_path / ".env").write_text(
        "SCOUT_MODE=live\nSCOUT_OPENALEX_MODE=live\nSCOUT_MODEL_MODE=disabled\n"
        "SCOUT_STATE_DIR=.scout/live\nOPENAI_API_KEY=never-print-this\n"
    )
    for key in ("SCOUT_MODE", "SCOUT_OPENALEX_MODE", "SCOUT_MODEL_MODE", "SCOUT_STATE_DIR"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(sys, "argv", ["dev.py", "--check-config"])
    monkeypatch.setattr(launcher, "check_ports", lambda _: pytest.fail("Config check bound a port"))
    launcher.main()
    first = capsys.readouterr().out
    assert '"openalex": "live"' in first
    assert "never-print-this" not in first
    monkeypatch.setattr(sys, "argv", ["dev.py", "--check-config", "--mode", "fixture"])
    launcher.main()
    second = capsys.readouterr().out
    assert '"openalex": "fixture"' in second
    assert str(tmp_path / ".scout/fixture") in second
    assert "never-print-this" not in second


def test_expanded_fixture_config_cannot_inherit_live_provider_or_generation_flags(
    tmp_path, monkeypatch, capsys
):
    import json

    python = tmp_path / ".venv/bin/python"
    python.parent.mkdir(parents=True)
    python.touch()
    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    for name in launcher.PROVIDER_PORTS:
        monkeypatch.setenv(f"SCOUT_{name.upper()}_MODE", "live")
    monkeypatch.setenv("SCOUT_GENERATION_ENABLED", "true")
    monkeypatch.setenv("SCOUT_RETRIEVAL_ENABLED", "true")
    monkeypatch.setattr(sys, "argv", ["dev.py", "--check-config", "--mode", "fixture"])
    monkeypatch.setattr(launcher, "check_ports", lambda _: pytest.fail("Config check bound ports"))
    launcher.main()
    config = json.loads(capsys.readouterr().out)
    assert len(config["provider_modes"]) == 8
    assert set(config["provider_modes"].values()) == {"fixture"}
    assert config["generation_enabled"] is False
    assert config["retrieval_enabled"] is False
    assert len(set(launcher.PROVIDER_PORTS.values())) == 8
