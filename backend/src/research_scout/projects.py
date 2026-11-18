"""Human-owned research projects over saved queries and immutable provider records.

This store makes no provider/model requests and does not alter run shortlists.
One core process owns the directory; commits publish a whole atomic revision.
"""

from __future__ import annotations

import asyncio
import copy
import fcntl
import json
import os
import re
import tempfile
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .contracts import filter_record, now
from .core import ApplicationError, Core

if TYPE_CHECKING:
    from collections.abc import Callable

Reference = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
MAX_PROJECT_BYTES = 8 * 1024 * 1024


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)

    @field_validator("name")
    @classmethod
    def single_line_name(cls, value):
        if any(ord(character) < 32 for character in value):
            raise ValueError("Use a single-line name.")
        return value


class ConceptCreate(ProjectCreate):
    description: str = Field(default="", max_length=2000)


class MembershipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    concept_ids: list[Reference] = Field(default_factory=list, max_length=100)

    @field_validator("concept_ids")
    @classmethod
    def unique_concepts(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Select each concept only once.")
        return value


class ProjectQueryRequest(MembershipRequest):
    conversation_id: Reference | None = None
    run_id: Reference | None = None
    turn_id: Reference | None = None

    @model_validator(mode="after")
    def one_context(self):
        if bool(self.conversation_id) == bool(self.run_id):
            raise ValueError("Choose one saved conversation or research run.")
        if self.turn_id and not self.conversation_id:
            raise ValueError("A saved turn must belong to a conversation.")
        return self


class ProjectResourceRequest(MembershipRequest):
    run_id: Reference
    source_ref: str = Field(min_length=3, max_length=600)
    conversation_id: Reference | None = None
    version: str | int | None = None

    @field_validator("version", mode="before")
    @classmethod
    def bounded_version(cls, value):
        if value is None:
            return value
        if isinstance(value, bool) or not isinstance(value, (str, int)):
            raise ValueError("Supply a saved source version.")
        result = str(value).strip()
        if not result or len(result) > 128:
            raise ValueError("Supply a bounded saved source version.")
        return result


class ResearchProjects:
    def __init__(self, path: Path, core: Core):
        self.path, self.core = path, core
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._owner = (path / "owner.lock").open("a+")
        try:
            fcntl.flock(self._owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self._owner.close()
            raise RuntimeError("Another writer owns the research project directory.") from None
        self.lock = asyncio.Lock()
        self.projects: dict[str, dict] = {}
        try:
            for file in path.glob("*.json"):
                if file.stat().st_size > MAX_PROJECT_BYTES:
                    raise RuntimeError("A saved research project exceeds its local bound.")
                document = json.loads(file.read_text())
                if (
                    not re.fullmatch(r"[a-f0-9]{32}", file.stem)
                    or file.stem != document["id"]
                    or document.get("schema_version") != 1
                ):
                    raise RuntimeError("Research project filename/schema identity mismatch.")
                self.projects[file.stem] = document
        except BaseException:
            self.close()
            raise

    def close(self):
        if not self._owner.closed:
            fcntl.flock(self._owner, fcntl.LOCK_UN)
            self._owner.close()

    def _get(self, project_id: str):
        if project_id not in self.projects:
            raise ApplicationError("Research project not found.", 404)
        return self.projects[project_id]

    @staticmethod
    def _concepts(project: dict, requested: list[str]):
        if not set(requested) <= {concept["id"] for concept in project["concepts"]}:
            raise ApplicationError("A selected concept does not belong to this project.", 422)

    def _write(self, document: dict):
        payload = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
        if len(payload.encode()) > MAX_PROJECT_BYTES:
            raise ApplicationError("This project has reached its local storage limit.", 409)
        descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=self.path)
        try:
            with os.fdopen(descriptor, "w") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path / f"{document['id']}.json")
            directory = os.open(self.path, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    async def _mutate(self, project_id: str, edit: Callable[[dict], None]):
        async with self.lock:
            original = self._get(project_id)
            candidate = copy.deepcopy(original)
            edit(candidate)
            if candidate != original:
                candidate["revision"] += 1
                candidate["updated_at"] = now()
                self._write(candidate)
                self.projects[project_id] = candidate
            return copy.deepcopy(self.projects[project_id])

    async def list(self):
        async with self.lock:
            return copy.deepcopy(
                sorted(self.projects.values(), key=lambda item: item["updated_at"], reverse=True)
            )

    async def get(self, project_id: str):
        async with self.lock:
            return copy.deepcopy(self._get(project_id))

    async def create(self, request: ProjectCreate):
        async with self.lock:
            existing = next(
                (
                    p
                    for p in self.projects.values()
                    if p["name"].casefold() == request.name.casefold()
                ),
                None,
            )
            if existing:
                if existing["description"] != request.description:
                    raise ApplicationError("A project with this name already exists.", 409)
                return copy.deepcopy(existing)
            if len(self.projects) >= 256:
                raise ApplicationError("The local research project limit has been reached.", 409)
            stamp = now()
            project = {
                "schema_version": 1,
                "id": uuid.uuid4().hex,
                "name": request.name,
                "description": request.description,
                "created_at": stamp,
                "updated_at": stamp,
                "revision": 0,
                "concepts": [],
                "queries": [],
                "resources": [],
            }
            self._write(project)
            self.projects[project["id"]] = project
            return copy.deepcopy(project)

    async def add_concept(self, project_id: str, request: ConceptCreate):
        def edit(project):
            if any(
                item["name"].casefold() == request.name.casefold() for item in project["concepts"]
            ):
                return
            if len(project["concepts"]) >= 100:
                raise ApplicationError("This project already has 100 concepts.", 409)
            project["concepts"].append(
                {
                    "id": uuid.uuid4().hex,
                    "name": request.name,
                    "description": request.description,
                    "created_at": now(),
                }
            )

        return await self._mutate(project_id, edit)

    async def add_query(self, project_id: str, request: ProjectQueryRequest):
        await self.get(project_id)
        if request.conversation_id:
            context = await self.core.conversations.get(request.conversation_id, private=True)
            turns = context["turns"]
            turn = (
                next((item for item in turns if item["id"] == request.turn_id), None)
                if request.turn_id
                else next(reversed(turns), None)
            )
            if not turn and request.turn_id:
                raise ApplicationError("Saved exploration turn not found.", 404)
            if not turn:
                raise ApplicationError("Start a query before adding this saved conversation.", 409)
            turn_id, question = turn["id"], turn["message"]
            identity = f"conversation:{context['id']}:{turn_id}"
            filters = turn.get("filters", {})
            providers = turn.get("providers", [])
            source_scope = turn.get("source_scope")
            routing = turn.get("routing")
        else:
            context = await self.core.get(request.run_id)
            turn_id, question = None, context["question"]
            identity = f"run:{context['id']}"
            filters = context.get("filters", {})
            providers = [context["provider"]]
            source_scope = None
            routing = "manual"
        query = {
            "id": uuid.uuid4().hex,
            "identity": identity,
            "conversation_id": request.conversation_id,
            "run_id": request.run_id,
            "turn_id": turn_id,
            "title": question[:160],
            "question": question,
            "filters": copy.deepcopy(filters),
            "providers": copy.deepcopy(providers),
            "source_scope": copy.deepcopy(source_scope),
            "routing": routing,
            "created_at": now(),
            "concept_ids": request.concept_ids,
        }

        def edit(project):
            self._concepts(project, request.concept_ids)
            existing = next((q for q in project["queries"] if q["identity"] == identity), None)
            if existing:
                existing["concept_ids"] = list(
                    dict.fromkeys(existing["concept_ids"] + request.concept_ids)
                )
                return
            if len(project["queries"]) >= 200:
                raise ApplicationError("This project already has 200 saved queries.", 409)
            project["queries"].append(query)

        return await self._mutate(project_id, edit)

    async def add_resource(self, project_id: str, request: ProjectResourceRequest):
        await self.get(project_id)
        run = await self.core.get(request.run_id, private=True)
        source = next((s for s in run["entities"] if s["source_ref"] == request.source_ref), None)
        if request.version is not None and (
            not source or str(source["version"]) != str(request.version)
        ):
            source = run.get("_observations", {}).get(f"{request.source_ref}@{request.version}")
        if not source:
            raise ApplicationError(
                "This saved source/version is not available in the research run.", 404
            )
        eligible, _ = filter_record(source, run.get("filters", {}))
        if not eligible and request.source_ref not in run.get("selections", {}):
            raise ApplicationError("This source is outside the saved research scope.", 409)
        if request.conversation_id:
            conversation = await self.core.conversations.get(request.conversation_id, private=True)
            if not any(request.run_id in turn.get("run_ids", []) for turn in conversation["turns"]):
                raise ApplicationError(
                    "This research run does not belong to that conversation.", 422
                )
        is_video = source["provider"] == "youtube" or source.get("resource_type") == "video"
        doi = None
        if not is_video and source.get("doi"):
            try:
                doi = Core.doi(source["doi"])
            except ApplicationError:
                pass
        identity = f"doi:{doi}" if doi else f"source:{source['provider']}:{source['record_id']}"
        observation = {
            "run_id": request.run_id,
            "source_ref": request.source_ref,
            "version": source["version"],
            "conversation_id": request.conversation_id,
            "saved_at": now(),
            "source": copy.deepcopy(source),
        }
        resource = {
            "id": uuid.uuid4().hex,
            "identity": identity,
            "kind": "video" if is_video else "paper",
            "doi": doi,
            "run_id": request.run_id,
            "source_ref": request.source_ref,
            "version": source["version"],
            "provider": source["provider"],
            "record_id": source["record_id"],
            "resource_type": source.get("resource_type"),
            "title": source.get("title") or "Untitled provider record",
            "url": source.get("url"),
            "year": source.get("year"),
            "saved_at": observation["saved_at"],
            "created_at": observation["saved_at"],
            "concept_ids": request.concept_ids,
            "observations": [observation],
        }

        def edit(project):
            self._concepts(project, request.concept_ids)
            existing = next((r for r in project["resources"] if r["identity"] == identity), None)
            if existing:
                existing["concept_ids"] = list(
                    dict.fromkeys(existing["concept_ids"] + request.concept_ids)
                )
                if not any(
                    (item["run_id"], item["source_ref"], str(item["version"]))
                    == (request.run_id, request.source_ref, str(source["version"]))
                    for item in existing["observations"]
                ):
                    if len(existing["observations"]) >= 100:
                        raise ApplicationError(
                            "This resource already has 100 saved observations.", 409
                        )
                    existing["observations"].append(observation)
                return
            if len(project["resources"]) >= 500:
                raise ApplicationError("This project already has 500 saved resources.", 409)
            project["resources"].append(resource)

        return await self._mutate(project_id, edit)
