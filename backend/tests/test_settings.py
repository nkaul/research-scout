"""Configuration must select truthful modes without leaking sibling credentials."""

import pytest

from research_scout.settings import child_environment, model_mode, provider_mode


def test_provider_specific_mode_and_legacy_compatibility():
    env = {"SCOUT_MODE": "fixture", "SCOUT_OPENALEX_MODE": "live"}
    assert provider_mode("openalex", env) == "live"
    assert provider_mode("datacite", env) == "fixture"
    assert provider_mode("datacite", {}, default="live") == "live"
    with pytest.raises(ValueError):
        provider_mode("unknown", env)
    with pytest.raises(ValueError):
        provider_mode("openalex", {"SCOUT_OPENALEX_MODE": "not-a-mode"})


def test_generation_cannot_be_enabled_by_provider_mode_or_key():
    assert model_mode({"SCOUT_MODE": "live", "OPENAI_API_KEY": "secret"}) == "disabled"
    assert model_mode({"SCOUT_MODEL_MODE": "fixture"}) == "fixture"
    with pytest.raises(ValueError, match="deferred"):
        model_mode({"SCOUT_MODEL_MODE": "live"})


def test_each_child_gets_only_its_own_settings_and_no_model_credentials():
    env = {
        "PATH": "/bin",
        "HOME": "/tmp",
        "SCOUT_MODEL_MODE": "disabled",
        "SCOUT_STATE_DIR": ".scout/live",
        "SCOUT_API_URL": "http://127.0.0.1:8100",
        "SCOUT_OPENALEX_OAUTH_TOKEN": "oa-secret",
        "SCOUT_SEMANTIC_SCHOLAR_API_KEY": "s2-secret",
        "SCOUT_OPENALEX_MODE": "live",
        "SCOUT_DATACITE_MODE": "fixture",
        "OPENAI_API_KEY": "model-secret",
        "DATABASE_PASSWORD": "other-secret",
        "SCOUT_CONTACT_EMAIL": "contact@example.org",
    }
    oa = child_environment("openalex", env)
    assert oa["SCOUT_OPENALEX_OAUTH_TOKEN"] == "oa-secret"
    assert "SCOUT_SEMANTIC_SCHOLAR_API_KEY" not in oa
    assert (
        child_environment("semantic_scholar", env)["SCOUT_SEMANTIC_SCHOLAR_API_KEY"] == "s2-secret"
    )
    for service in ("frontend", "core", "crossref", "datacite", "openalex", "semantic_scholar"):
        child = child_environment(service, env)
        assert "OPENAI_API_KEY" not in child
        assert "DATABASE_PASSWORD" not in child
    assert "SCOUT_OPENALEX_OAUTH_TOKEN" not in child_environment("core", env)
    assert "SCOUT_OPENALEX_MODE" in child_environment("core", env)
    assert "SCOUT_MODEL_MODE" not in child_environment("frontend", env)
    assert "SCOUT_CONTACT_EMAIL" in child_environment("crossref", env)


def test_explicit_generation_shares_key_with_core_only():
    env = {
        "SCOUT_GENERATION_ENABLED": "true",
        "SCOUT_GENERATION_MODEL": "gpt-6-luna",
        "OPENAI_API_KEY": "model-secret",
        "SCOUT_GENERATION_API_KEY": "explicit-model-secret",
        "SCOUT_OPENALEX_OAUTH_TOKEN": "oa-secret",
    }
    core = child_environment("core", env)
    assert core["OPENAI_API_KEY"] == "model-secret"
    assert core["SCOUT_GENERATION_MODEL"] == "gpt-6-luna"
    assert "SCOUT_OPENALEX_OAUTH_TOKEN" not in core
    for service in ("frontend", "openalex", "crossref", "datacite", "semantic_scholar"):
        child = child_environment(service, env)
        assert "OPENAI_API_KEY" not in child
        assert "SCOUT_GENERATION_API_KEY" not in child


def test_new_provider_secrets_and_local_encoder_projection_are_isolated():
    env = {
        "SCOUT_MODE": "live",
        "SCOUT_OPENAIRE_API_TOKEN": "openaire-secret",
        "SCOUT_UNPAYWALL_EMAIL": "configured-contact@example.org",
        "SCOUT_SEMANTIC_SCHOLAR_API_KEY": "s2-secret",
        "OPENAI_API_KEY": "model-secret",
        "SCOUT_LOCAL_ENCODER_FACTORY": "reviewed:factory",
        "SCOUT_LOCAL_ENCODER_MODEL": "reviewed-model",
        "SCOUT_LOCAL_ENCODER_REVISION": "pinned-revision",
        "SCOUT_LOCAL_ENCODER_CACHE": ".scout/encoders",
    }
    for provider in ("semantic_scholar", "crossref", "arxiv", "openaire", "europe_pmc"):
        child = child_environment(provider, env)
        assert child["SCOUT_LOCAL_ENCODER_FACTORY"] == "reviewed:factory"
        assert "OPENAI_API_KEY" not in child
        assert "SCOUT_UNPAYWALL_EMAIL" not in child
        assert ("SCOUT_OPENAIRE_API_TOKEN" in child) is (provider == "openaire")
    for service in ("openalex", "unpaywall", "core", "frontend"):
        assert "SCOUT_LOCAL_ENCODER_FACTORY" not in child_environment(service, env)
    assert "SCOUT_LOCAL_ENCODER_FACTORY" not in child_environment(
        "arxiv", {**env, "SCOUT_ARXIV_MODE": "fixture"}
    )
    assert (
        child_environment("unpaywall", env)["SCOUT_UNPAYWALL_EMAIL"]
        == "configured-contact@example.org"
    )
    assert "SCOUT_OPENAIRE_API_TOKEN" not in child_environment("unpaywall", env)


def test_agentic_retrieval_credential_is_core_only_and_requires_its_own_flag():
    env = {
        "SCOUT_GENERATION_ENABLED": "false",
        "SCOUT_RETRIEVAL_ENABLED": "true",
        "SCOUT_RETRIEVAL_API_KEY": "retrieval-only-secret",
        "OPENAI_API_KEY": "fallback-model-secret",
        "SCOUT_GENERATION_API_KEY": "writer-only-secret",
        "SCOUT_RETRIEVAL_MAX_MODEL_CALLS": "5",
        "SCOUT_RETRIEVAL_MODEL": "gpt-6-luna",
    }
    core = child_environment("core", env)
    assert core["SCOUT_RETRIEVAL_API_KEY"] == "retrieval-only-secret"
    assert core["OPENAI_API_KEY"] == "fallback-model-secret"
    assert core["SCOUT_RETRIEVAL_MAX_MODEL_CALLS"] == "5"
    assert "SCOUT_GENERATION_API_KEY" not in core
    disabled = child_environment("core", {**env, "SCOUT_RETRIEVAL_ENABLED": "false"})
    assert "SCOUT_RETRIEVAL_API_KEY" not in disabled and "OPENAI_API_KEY" not in disabled
    for name in (
        "frontend",
        "openalex",
        "crossref",
        "datacite",
        "semantic_scholar",
        "arxiv",
        "openaire",
        "europe_pmc",
        "unpaywall",
    ):
        child = child_environment(name, env)
        assert "OPENAI_API_KEY" not in child
        assert not any(key.startswith("SCOUT_RETRIEVAL_") for key in child)
