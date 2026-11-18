"""Bounded, source-bound README reading and independent local repository notes."""

import asyncio
import copy
import hashlib
import re
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .contracts import fingerprint, now
from .repo_evidence import MAX_README_BYTES, PARSER_POLICY, SECRET
from .store import Store

SOURCE_POLICY = "scout-saved-readme-source-v1"


def readable_source(text):
    """Keep Markdown as inert text; disclose existing credential redaction."""
    transformed = SECRET.sub("[REDACTED]", text)
    changes = ["credential_redaction"] if transformed != text else []
    safe = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", transformed)
    if safe != transformed:
        changes.append("control_characters_removed")
    encoded = safe.encode("utf-8")
    clipped = len(encoded) > MAX_README_BYTES
    if clipped:
        safe = encoded[:MAX_README_BYTES].decode("utf-8", errors="ignore")
        changes.append("reader_byte_bound")
    return {
        "text": safe,
        "content_sha256": hashlib.sha256(safe.encode()).hexdigest(),
        "transformed": bool(changes),
        "transformations": changes,
        "complete": not clipped,
        "source_policy": SOURCE_POLICY,
    }


def promote_source(record, pending):
    """Only verified public observations can make reader artifacts available."""
    readme = record["readme"]
    if readme.get("status") != "available" or readme.get("repository_id_revalidated") is not True:
        raise ValueError("Readable README requires the verified public repository identity.")
    identity = fingerprint([record["record_id"], record["evidence_version"], SOURCE_POLICY])
    return identity, {
        **pending,
        "artifact_id": identity,
        "record_id": record["record_id"],
        "repo_id": record["repo_id"],
        "full_name": record["full_name"],
        "evidence_version": record["evidence_version"],
        "source_sha": readme["sha"],
        "source_url": readme["source_url"],
        "parser_policy": PARSER_POLICY,
    }


def validate_source(value, record):
    readme = record["readme"]
    expected_id = fingerprint([record["record_id"], record["evidence_version"], SOURCE_POLICY])
    if (
        not isinstance(value, dict)
        or value.get("artifact_id") != expected_id
        or readme.get("artifact_id") != expected_id
        or readme.get("artifact_available") is not True
        or readme.get("repository_id_revalidated") is not True
        or value.get("record_id") != record["record_id"]
        or value.get("repo_id") != record["repo_id"]
        or value.get("full_name") != record["full_name"]
        or value.get("evidence_version") != record["evidence_version"]
        or value.get("source_sha") != readme.get("sha")
        or value.get("source_url") != readme.get("source_url")
        or value.get("parser_policy") != readme.get("parser_policy")
        or value.get("source_policy") != SOURCE_POLICY
        or not isinstance(value.get("text"), str)
        or len(value["text"].encode()) > MAX_README_BYTES
        or value.get("content_sha256") != hashlib.sha256(value["text"].encode()).hexdigest()
        or type(value.get("transformed")) is not bool
        or type(value.get("complete")) is not bool
        or not isinstance(value.get("transformations"), list)
        or any(
            item not in {"credential_redaction", "control_characters_removed", "reader_byte_bound"}
            for item in value["transformations"]
        )
        or value["transformed"] != bool(value["transformations"])
    ):
        raise ValueError("Saved README artifact does not match its verified source observation.")
    return value


class RepoNoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(max_length=8000)
    expected_revision: int = Field(ge=0, strict=True)
    evidence_version: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("text")
    @classmethod
    def bounded(cls, value):
        if len(value.encode()) > 16000:
            raise ValueError("Repository notes must fit within 16,000 UTF-8 bytes.")
        return value


class NoteStore(Store):
    def _commit(self, document, event_kind):
        document["revision"] = document["_sequence"] + 1
        super()._commit(document, event_kind)

    @staticmethod
    def public(document):
        return copy.deepcopy(
            {key: value for key, value in document.items() if not key.startswith("_")}
        )

    def _recover(self, document):
        return False


class RepositoryNotes:
    def __init__(self, path):
        self.store = NoteStore(path, event_limit=4)
        self.lock = asyncio.Lock()

    @staticmethod
    def identity(context, record_id):
        return fingerprint([context["conversation_id"], context["turn_id"], record_id])

    @staticmethod
    def public(value):
        return {
            key: copy.deepcopy(value.get(key))
            for key in (
                "id",
                "conversation_id",
                "turn_id",
                "record_id",
                "text",
                "revision",
                "evidence_version",
                "updated_at",
                "references",
            )
        }

    async def get(self, context, record_id, *, private=False):
        identity = self.identity(context, record_id)
        async with self.store.lock:
            value = copy.deepcopy(self.store.runs.get(identity))
        if value is None:
            value = {
                "id": identity,
                "conversation_id": context["conversation_id"],
                "turn_id": context["turn_id"],
                "record_id": record_id,
                "text": "",
                "revision": 0,
                "evidence_version": None,
                "updated_at": None,
                "references": [],
                "_evidence": {},
            }
        return value if private else self.public(value)

    async def put(self, search, record_id, body, record):
        from .core import ApplicationError

        async with self.lock:
            prior = await self.get(search["context"], record_id, private=True)
            if prior["revision"] != body.expected_revision:
                raise ApplicationError(
                    "Repository notes changed in another view. Your draft is preserved; reopen the saved note before saving again.",
                    409,
                )
            if record is None:
                record = prior.get("_evidence", {}).get(body.evidence_version)
            if (
                record is None
                or record["record_id"] != record_id
                or record["evidence_version"] != body.evidence_version
            ):
                raise ApplicationError(
                    "This repository evidence version is no longer available in this saved context. Your note draft was preserved.",
                    409,
                )
            value = copy.deepcopy(prior)
            value.update(text=body.text, evidence_version=body.evidence_version, status="SUCCEEDED")
            value.setdefault("_evidence", {})[body.evidence_version] = copy.deepcopy(record)
            if not any(
                ref["evidence_version"] == body.evidence_version for ref in value["references"]
            ):
                value["references"].append(
                    {
                        "search_id": search["id"],
                        "record_id": record_id,
                        "evidence_version": body.evidence_version,
                        "observation_id": record["observation_id"],
                        "full_name": record["full_name"],
                        "source_sha": record["readme"].get("sha"),
                        "source_url": record["readme"].get("source_url"),
                        "artifact_available": record["readme"].get("artifact_available") is True,
                    }
                )
            if prior["revision"] == 0:
                value.update(created_at=now(), _sequence=0, _stream_id=uuid.uuid4().hex, _events=[])
                saved = await self.store.add(value)
            else:
                saved = await self.store.mutate(
                    value["id"], lambda item: item.update(value), "note.saved"
                )
            return self.public(saved)

    def close(self):
        self.store.close()
