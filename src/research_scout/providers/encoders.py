"""Optional provider-local sentence-transformer encoder; no hosted inference."""

import importlib
import os
import re

from .journal import ProviderError


class SentenceTransformerEncoder:
    def __init__(self):
        model = os.getenv("SCOUT_LOCAL_ENCODER_MODEL") or os.getenv(
            "SCOUT_SEMANTIC_SCHOLAR_ENCODER_MODEL", ""
        )
        revision = os.getenv("SCOUT_LOCAL_ENCODER_REVISION") or os.getenv(
            "SCOUT_SEMANTIC_SCHOLAR_ENCODER_REVISION", ""
        )
        if model != "sentence-transformers/all-MiniLM-L6-v2" or not re.fullmatch(
            r"[a-fA-F0-9]{40}", revision
        ):
            raise ProviderError(
                "ENCODER_NOT_CONFIGURED",
                "Configure the supported symmetric all-MiniLM-L6-v2 encoder and exact commit revision.",
                503,
            )
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as error:
            raise ProviderError(
                "ENCODER_DEPENDENCY_MISSING",
                "Install the optional local sentence-transformers dependency before enabling hybrid reranking.",
                503,
            ) from error
        try:
            self.model = SentenceTransformer(
                model,
                revision=revision,
                cache_folder=os.getenv("SCOUT_LOCAL_ENCODER_CACHE")
                or os.getenv("SCOUT_SEMANTIC_SCHOLAR_ENCODER_CACHE", ".scout/encoder-cache"),
                local_files_only=True,
                trust_remote_code=False,
                device="cpu",
            )
        except Exception as error:
            raise ProviderError(
                "ENCODER_MODEL_MISSING",
                "The pinned local encoder is not cached; install/download it explicitly before enabling.",
                503,
            ) from error
        dimension = self.model.get_sentence_embedding_dimension()
        if not isinstance(dimension, int) or not 1 <= dimension <= 8192:
            raise ProviderError("ENCODER_CONFIGURATION", "Unsupported encoder dimensions.", 503)
        self.configuration = {
            "model": model,
            "revision": revision,
            "dimensions": dimension,
            "query_mode": "symmetric_sentence_embedding",
            "document_mode": "symmetric_sentence_embedding",
            "similarity": "cosine",
            "execution": "local_cpu",
            "max_sequence_length": self.model.max_seq_length,
        }
        self.input_scope = {"query_truncated": False, "documents_truncated": 0}

    def _truncated(self, texts):
        tokens = self.model.tokenizer(texts, truncation=False, add_special_tokens=True)["input_ids"]
        return sum(len(ids) > self.model.max_seq_length for ids in tokens)

    def _encode(self, texts):
        # Both sides use the same model and preprocessing. Explicitly record its
        # finite model token window; no unrelated pretrained spaces are mixed.
        return self.model.encode(
            texts,
            batch_size=20,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        ).tolist()

    def encode_query(self, text):
        self.input_scope["query_truncated"] = bool(self._truncated([text]))
        return self._encode([text])[0]

    def encode_documents(self, texts):
        self.input_scope["documents_truncated"] = self._truncated(texts) if texts else 0
        return self._encode(texts) if texts else []


def sentence_transformer():
    """CLI factory: research_scout.providers.encoders:sentence_transformer."""
    return SentenceTransformerEncoder()


def load_configured_encoder(factory: str | None = None):
    """Use the same explicit encoder configuration in the service and preflight."""
    factory = (
        factory
        or os.getenv("SCOUT_LOCAL_ENCODER_FACTORY")
        or os.getenv("SCOUT_SEMANTIC_SCHOLAR_ENCODER_FACTORY")
    )
    if not factory:
        return None, None
    module, separator, name = factory.partition(":")
    if not separator or not module or not name:
        return None, "ENCODER_FACTORY_INVALID"
    try:
        return getattr(importlib.import_module(module), name)(), None
    except ProviderError as error:
        return None, error.code
    except Exception:
        return None, "ENCODER_FACTORY_UNAVAILABLE"
