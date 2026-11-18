"""Local uv launches share root runtime state regardless of working directory."""

from pathlib import Path

import pytest

from research_scout.core import Settings
from research_scout.paths import BACKEND_ROOT, REPOSITORY_ROOT, repository_path
from research_scout.providers.oauth import credential_path
from research_scout.providers.onnx_encoder import REVISION, cache_directory
from research_scout.providers.service import create_provider_app


@pytest.mark.parametrize("cwd", ["root", "backend", "temporary"])
def test_default_state_credentials_and_encoder_cache_survive_backend_cwd(tmp_path, monkeypatch, cwd):
    for key in ["SCOUT_STATE_DIR", "SCOUT_OPENALEX_OAUTH_STORE", "SCOUT_LOCAL_ENCODER_CACHE", "SCOUT_SEMANTIC_SCHOLAR_ENCODER_CACHE"]:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.chdir({"root": REPOSITORY_ROOT, "backend": BACKEND_ROOT, "temporary": tmp_path}[cwd])
    assert Settings().state_dir == REPOSITORY_ROOT / ".scout"
    app = create_provider_app("youtube", "fixture")
    assert app.state.journal.directory == REPOSITORY_ROOT / ".scout/providers/youtube/fixture"
    assert credential_path() == REPOSITORY_ROOT / ".scout/credentials/openalex.local.json"
    assert cache_directory() == REPOSITORY_ROOT / ".scout/encoder-cache" / REVISION


def test_relative_overrides_share_repo_root_but_absolute_paths_stay_explicit(tmp_path, monkeypatch):
    monkeypatch.chdir(BACKEND_ROOT)
    monkeypatch.setenv("SCOUT_STATE_DIR", ".scout/custom-state")
    monkeypatch.setenv("SCOUT_OPENALEX_OAUTH_STORE", ".scout/custom-oauth.json")
    monkeypatch.setenv("SCOUT_LOCAL_ENCODER_CACHE", ".scout/custom-encoder")
    assert Settings().state_dir == REPOSITORY_ROOT / ".scout/custom-state"
    assert credential_path() == REPOSITORY_ROOT / ".scout/custom-oauth.json"
    assert cache_directory() == REPOSITORY_ROOT / ".scout/custom-encoder" / REVISION
    assert create_provider_app("youtube", "fixture").state.journal.directory == REPOSITORY_ROOT / ".scout/custom-state/providers/youtube/fixture"
    assert repository_path(tmp_path) == tmp_path
    assert Settings(state_dir=tmp_path).state_dir == tmp_path
    assert create_provider_app("youtube", "fixture", state_dir=tmp_path).state.journal.directory == tmp_path / "providers/youtube/fixture"
    monkeypatch.setenv("SCOUT_OPENALEX_OAUTH_STORE", str(tmp_path / "oauth.json"))
    monkeypatch.setenv("SCOUT_LOCAL_ENCODER_CACHE", str(tmp_path / "encoder"))
    assert credential_path() == tmp_path / "oauth.json"
    assert cache_directory() == tmp_path / "encoder" / REVISION
    assert isinstance(repository_path(".scout"), Path)
