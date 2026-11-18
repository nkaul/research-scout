"""Saved source reading and durable notes without new upstream/model work."""

import copy
import json

import httpx
import pytest
from pydantic import ValidationError
from test_repos import events, metadata, operation, readme_payload, seed

from research_scout.api import create_app
from research_scout.contracts import now
from research_scout.core import Core, Settings
from research_scout.providers.dataset_catalog import datacite_dataset_record, description_fields
from research_scout.providers.repo_service import create_repo_provider_app
from research_scout.repo_contracts import RepoRecord, RepoSearchRequest
from research_scout.repo_reading import RepoNoteRequest, readable_source, validate_source


def test_source_redaction_keeps_markdown_and_discloses_transformations():
    raw = "# Overview\x00\n\n- Useful retrieval library.\n\n```python\nprint('hello')\n```\napi_key=pretend-value"
    result = readable_source(raw)
    assert "# Overview" in result["text"] and "```python" in result["text"]
    assert "pretend-value" not in result["text"] and "\x00" not in result["text"]
    assert result["transformations"] == ["credential_redaction", "control_characters_removed"]
    assert result["transformed"] and result["complete"]


def test_catalog_local_clipping_does_not_claim_provider_completeness():
    assert description_fields("<p>A saved description.</p>") == {
        "description": "A saved description.",
        "description_truncated": False,
        "description_truncation_reason": None,
    }
    long = description_fields("a" * 20001)
    assert len(long["description"]) == 20000 and long["description_truncated"]
    record = datacite_dataset_record(
        {
            "id": "10.1234/data",
            "attributes": {
                "types": {"resourceTypeGeneral": "Dataset"},
                "descriptions": [{"description": f"entry {i}"} for i in range(9)],
            },
        }
    )
    assert "entry 7" in record["description"] and "entry 8" not in record["description"]
    assert record["description_truncated"] and "eight" in record["description_truncation_reason"]


@pytest.mark.parametrize("text", ["a" * 8001, "研" * 6000])
def test_note_bounds_are_independent_of_model_allowance(text):
    with pytest.raises(ValidationError):
        RepoNoteRequest(text=text, expected_revision=0, evidence_version="a" * 64)


@pytest.mark.asyncio
async def test_saved_artifact_is_published_after_identity_check_and_read_without_upstream(tmp_path):
    upstream_calls = []
    row = metadata()

    async def upstream(request):
        upstream_calls.append(request.url.path)
        if request.url.path == "/search/repositories":
            return httpx.Response(200, json={"items": [row], "incomplete_results": False})
        if request.url.path.endswith("/readme"):
            return httpx.Response(
                200,
                json=readme_payload(
                    row,
                    "# Source\n\nFull saved README with more than its selected evidence.\napi_key=pretend-value",
                ),
            )
        return httpx.Response(200, json=row)

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as remote:
        app = create_repo_provider_app("live", state_dir=tmp_path, http_client=remote)
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app), base_url="http://testserver"
            ) as client,
        ):
            saved_events = events(
                await client.post("/operations/repositories", json=operation(limit=1).model_dump())
            )
            record = [event["record"] for event in saved_events if event["type"] == "repository"][
                -1
            ]
            assert len(upstream_calls) == 3
            assert record["readme"]["artifact_available"] is True
            assert "_source_artifact" not in json.dumps(saved_events)
            assert "pretend-value" not in json.dumps(saved_events)
            record = RepoRecord.model_validate(record).model_dump()
            artifact_id = record["readme"]["artifact_id"]
            for _ in range(2):
                response = await client.get("/saved-readmes/" + artifact_id)
                assert response.status_code == 200
                artifact = validate_source(response.json(), record)
                assert (
                    "Full saved README" in artifact["text"]
                    and "pretend-value" not in artifact["text"]
                )
            assert len(upstream_calls) == 3
            for changed in [
                dict(artifact, record_id="999"),
                dict(artifact, evidence_version="0" * 64),
                dict(artifact, text="wrong"),
            ]:
                with pytest.raises(ValueError):
                    validate_source(changed, record)


@pytest.mark.asyncio
async def test_identity_failure_never_promotes_original_source(tmp_path):
    row = metadata()

    async def upstream(request):
        if request.url.path == "/search/repositories":
            return httpx.Response(200, json={"items": [row], "incomplete_results": False})
        if request.url.path.endswith("/readme"):
            return httpx.Response(200, json=readme_payload(row))
        return httpx.Response(200, json={**row, "id": 999})

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as remote:
        app = create_repo_provider_app("live", state_dir=tmp_path, http_client=remote)
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app), base_url="http://testserver"
            ) as client,
        ):
            received = events(
                await client.post("/operations/repositories", json=operation(limit=1).model_dump())
            )
            final = [event["record"] for event in received if event["type"] == "repository"][-1]
            assert not final["readme"].get("artifact_available")
            assert not list((app.state.journal.directory / "repo_readme_sources").glob("*.json"))


@pytest.mark.asyncio
async def test_api_notes_independent_revision_refresh_scope_pinned_evidence_and_restart(tmp_path):
    provider = create_repo_provider_app("fixture", state_dir=tmp_path / "provider")
    async with (
        provider.router.lifespan_context(provider),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(provider), base_url="http://testserver"
        ) as provider_client,
    ):
        local_calls = []

        async def transport(request):
            local_calls.append(request.url.path)
            return await provider_client.request(
                request.method, request.url.path, content=request.content
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as local:
            settings = Settings(state_dir=tmp_path / "core")
            app = create_app(settings, core_factory=lambda config: Core(config, client=local))
            async with (
                app.router.lifespan_context(app),
                httpx.AsyncClient(
                    transport=httpx.ASGITransport(app), base_url="http://testserver"
                ) as api,
            ):
                core = app.state.core
                cid, tid = await seed(core)
                search = await core.repos.create(
                    RepoSearchRequest(
                        conversation_id=cid, turn_id=tid, limit=1, idempotency_key="saved-reader"
                    ),
                    launch=False,
                )
                received = events(
                    await provider_client.post(
                        "/operations/repositories", json=operation(limit=1).model_dump()
                    )
                )
                record = RepoRecord.model_validate(
                    [event["record"] for event in received if event["type"] == "repository"][-1]
                ).model_dump()
                await core.repos.store.mutate(
                    search["id"],
                    lambda row: row.update(
                        records=[record], status="SUCCEEDED", completed_at=now()
                    ),
                )
                prefix = f"/api/repo-searches/{search['id']}/records/{record['record_id']}"
                before = list((settings.state_dir / "repo-notes").glob("*.json"))
                empty = (await api.get(prefix + "/notes")).json()
                assert empty["revision"] == 0 and empty["text"] == ""
                assert list((settings.state_dir / "repo-notes").glob("*.json")) == before
                original = await api.get(
                    prefix + "/readme", params={"evidence_version": record["evidence_version"]}
                )
                assert (
                    original.status_code == 200
                    and original.json()["source_sha"] == record["readme"]["sha"]
                )
                assert (
                    await api.get(prefix + "/readme", params={"evidence_version": "bad"})
                ).status_code == 422
                body = {
                    "text": "Inspect this saved architecture.",
                    "expected_revision": 0,
                    "evidence_version": record["evidence_version"],
                }
                response = await api.put(prefix + "/notes", json=body)
                assert response.status_code == 200
                note = response.json()
                assert (
                    note["revision"] == 1
                    and note["references"][0]["source_sha"] == record["readme"]["sha"]
                )
                assert (await api.put(prefix + "/notes", json=body)).status_code == 409
                # A search update is not a note edit.
                await core.repos.store.mutate(
                    search["id"], lambda row: row.update(warnings=["Fixture coverage note."])
                )
                assert (
                    await api.put(prefix + "/notes", json={**body, "expected_revision": 1})
                ).json()["revision"] == 2
                refresh = await core.repos.create(
                    RepoSearchRequest(
                        conversation_id=cid, turn_id=tid, limit=1, idempotency_key="refresh-reader"
                    ),
                    launch=False,
                )
                changed = copy.deepcopy(record)
                changed["evidence_version"] = "b" * 64
                await core.repos.store.mutate(
                    refresh["id"],
                    lambda row: row.update(
                        records=[changed], status="SUCCEEDED", completed_at=now()
                    ),
                )
                refreshed_prefix = (
                    f"/api/repo-searches/{refresh['id']}/records/{record['record_id']}"
                )
                assert (await api.get(refreshed_prefix + "/notes")).json()["id"] == note["id"]
                assert (
                    await api.put(
                        refreshed_prefix + "/notes", json={**body, "expected_revision": 2}
                    )
                ).status_code == 200
                pinned = await api.get(refreshed_prefix + "/evidence/" + record["evidence_version"])
                assert (
                    pinned.status_code == 200
                    and pinned.json()["readme"]["sha"] == record["readme"]["sha"]
                )
                assert all(path.startswith("/saved-readmes/") for path in local_calls)
            # Reopening storage retains the note and its source reference.
            reopened = Core(settings, client=local)
            try:
                restored = await reopened.repos.get_note(search["id"], record["record_id"])
                assert restored["revision"] == 3 and restored["text"] == body["text"]
                assert restored["references"][0]["evidence_version"] == record["evidence_version"]
            finally:
                await reopened.close()
