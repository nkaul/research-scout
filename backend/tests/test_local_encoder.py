"""Optional real local encoder proof and publisher-identity cache checks."""

import hashlib
import os

import pytest

from research_scout.providers import onnx_encoder


def test_cached_artifacts_cannot_be_blessed_by_rewriting_a_manifest(tmp_path, monkeypatch):
    published = b"trusted publisher bytes"
    sha256 = hashlib.sha256(published).hexdigest()
    monkeypatch.setattr(onnx_encoder, "TRUSTED_ARTIFACTS", {
        "test.bin": {"size": len(published), "sha256": sha256}
    })
    file = tmp_path / "test.bin"
    file.write_bytes(published)
    assert onnx_encoder.verify_artifact(file, "test.bin") == sha256
    file.write_bytes(b"X" * len(published))
    with pytest.raises(ValueError, match="publisher"):
        onnx_encoder.verify_artifact(file, "test.bin")
    file.write_bytes(published + b"extra")
    with pytest.raises(ValueError, match="size"):
        onnx_encoder.verify_artifact(file, "test.bin")


@pytest.mark.skipif(
    os.environ.get("SCOUT_ENCODER_INTEGRATION") != "1",
    reason="Explicit optional local CPU encoder proof; no automatic model download",
)
def test_real_pinned_cpu_encoder_dimensions_similarity_and_truncation():
    from research_scout.providers.adapters import local_semantic_scores

    encoder = onnx_encoder.minilm_onnx()
    query = "Persistent memory helps research agents preserve decisions."
    documents = [query, "A banana bread recipe with flour and butter."]
    scores, configuration = local_semantic_scores(encoder, query, documents)
    assert configuration["dimensions"] == 384
    assert configuration["execution"] == "local_onnx_cpu"
    assert scores[0] > 0.99
    assert scores[0] > scores[1]
    assert encoder.input_scope["documents_truncated"] == [False, False]
    vector = encoder.encode_query("word " * 500)
    assert len(vector) == 384
    assert encoder.input_scope["query_truncated"] is True
    assert encoder.encode_documents([]) == []
