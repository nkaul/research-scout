"""Pinned MiniLM CPU embeddings over local public model artifacts; no hosted inference."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from .journal import ProviderError

MODEL = "sentence-transformers/all-MiniLM-L6-v2"
REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
FILES = ("tokenizer.json", "onnx/model_quint8_avx2.onnx")
# Publisher metadata verified at the immutable revision, not rebased from local files.
TRUSTED_ARTIFACTS = {
    "tokenizer.json": {"size": 466247, "git_blob": "cb202bfe2e3c98645018a6d12f182a434c9d3e02"},
    FILES[1]: {
        "size": 23046789,
        "sha256": "b941bf19f1f1283680f449fa6a7336bb5600bdcd5f84d10ddc5cd72218a0fd21",
    },
}


def verify_artifact(file: Path, name: str) -> str:
    expected = TRUSTED_ARTIFACTS[name]
    size = file.stat().st_size
    if size != expected["size"] or size > 100 * 1024 * 1024:
        raise ValueError("Encoder artifact size does not match its pinned revision")
    sha256 = hashlib.sha256()
    git_blob = hashlib.sha1(f"blob {size}\0".encode())
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha256.update(chunk)
            git_blob.update(chunk)
    if expected.get("sha256", sha256.hexdigest()) != sha256.hexdigest():
        raise ValueError("Encoder artifact hash differs from publisher metadata")
    if expected.get("git_blob", git_blob.hexdigest()) != git_blob.hexdigest():
        raise ValueError("Encoder artifact Git identity differs from its pinned revision")
    return sha256.hexdigest()


def cache_directory() -> Path:
    return (
        Path(
            os.getenv("SCOUT_LOCAL_ENCODER_CACHE")
            or os.getenv("SCOUT_SEMANTIC_SCHOLAR_ENCODER_CACHE", ".scout/encoder-cache")
        )
        / REVISION
    )


class MiniLMEncoder:
    def __init__(self):
        try:
            import numpy as np
            import onnxruntime as ort
            from tokenizers import Tokenizer
        except ImportError as error:
            raise ProviderError(
                "ENCODER_DEPENDENCY_MISSING",
                "Install requirements-encoder.lock for local reranking.",
                503,
            ) from error
        self.np = np
        folder = cache_directory()
        try:
            manifest = json.loads((folder / "manifest.json").read_text())
            if manifest["model"] != MODEL or manifest["revision"] != REVISION:
                raise ValueError("Wrong model revision")
            for name in FILES:
                if verify_artifact(folder / name, name) != manifest["sha256"][name]:
                    raise ValueError("Changed model artifact")
            self.tokenizer = Tokenizer.from_file(str(folder / "tokenizer.json"))
            self.tokenizer.enable_truncation(max_length=256)
            self.tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            self.session = ort.InferenceSession(
                str(folder / FILES[1]), sess_options=options, providers=["CPUExecutionProvider"]
            )
            self.inputs = {value.name for value in self.session.get_inputs()}
            if not self.inputs <= {"input_ids", "attention_mask", "token_type_ids"}:
                raise ValueError("Unsupported ONNX inputs")
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise ProviderError(
                "ENCODER_MODEL_MISSING",
                "Run scripts/setup_local_encoder.py to cache the pinned model.",
                503,
            ) from error
        self.configuration = {
            "model": MODEL,
            "revision": REVISION,
            "dimensions": 384,
            "query_mode": "symmetric_sentence_embedding",
            "document_mode": "symmetric_sentence_embedding",
            "similarity": "cosine",
            "execution": "local_onnx_cpu",
            "precision": "uint8_avx2",
            "pooling": "attention_mask_mean",
            "max_sequence_length": 256,
            "artifacts": dict(manifest["sha256"]),
        }
        self.input_scope = {"query_truncated": False, "documents_truncated": []}

    def _encode(self, texts):
        if not 1 <= len(texts) <= 20 or any(len(text.encode()) > 100_000 for text in texts):
            raise ProviderError(
                "ENCODER_INPUT_LIMIT", "Local encoder input exceeds the bounded pool."
            )
        np = self.np
        encoded = self.tokenizer.encode_batch(texts)
        arrays = {
            "input_ids": np.asarray([item.ids for item in encoded], dtype=np.int64),
            "attention_mask": np.asarray([item.attention_mask for item in encoded], dtype=np.int64),
            "token_type_ids": np.asarray([item.type_ids for item in encoded], dtype=np.int64),
        }
        hidden = self.session.run(None, {key: arrays[key] for key in self.inputs})[0]
        if (
            hidden.ndim != 3
            or hidden.shape[-1] != 384
            or hidden.shape[:2] != arrays["input_ids"].shape
            or not np.isfinite(hidden).all()
        ):
            raise ProviderError(
                "ENCODER_INVALID", "Local model did not return compatible finite vectors."
            )
        mask = arrays["attention_mask"][..., None]
        pooled = (hidden * mask).sum(axis=1) / np.maximum(mask.sum(axis=1), 1)
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        if not np.isfinite(pooled).all() or (norms <= 0).any():
            raise ProviderError(
                "ENCODER_INVALID", "Local model returned empty or nonfinite embeddings."
            )
        return (pooled / norms).tolist(), [bool(item.overflowing) for item in encoded]

    def encode_query(self, text):
        vectors, truncated = self._encode([text])
        self.input_scope["query_truncated"] = truncated[0]
        return vectors[0]

    def encode_documents(self, texts):
        if not texts:
            self.input_scope["documents_truncated"] = []
            return []
        vectors, truncated = self._encode(texts)
        self.input_scope["documents_truncated"] = truncated
        return vectors


def minilm_onnx():
    return MiniLMEncoder()
