# GitHub Manager AI pipeline reference artifacts

Copied October 26, 2026 from GitHub Manager's `docs/assets/ai-input-flows/` for the [GitHub Manager Architecture reference](../../github-manager-architecture.md).

## Selected original diagrams

| Diagram | Purpose |
| --- | --- |
| [RAG classification](rag-classification-wide-v1.png) | Evidence selection, canonical lookup, context assembly, generation and review. |
| [Full pipeline](rag-full-picture-wide-v1.png) | Adds taxonomy discovery, human publication and later registry reuse. |
| [Taxonomy discovery](taxonomy-flow-v3.png) | Local Evidence Parser and RAKE before collection-level drafting. |
| [Repository classification](classification-flow-v3.png) | Distinguishes Evidence Parser, Canonical Retriever and model selection. |

All four PNGs retain their original bytes. Their technical labels describe the GitHub Manager pipeline. No new image generation or editing was performed.

## Exact examples and provenance

The source records, profiles, authored registry, retrieval calculations, prompts, payloads, messages, schemas, request bodies and classification server context are copied unchanged. The examples use authored Orion samples and documentation workspace `0:samples`; the registry defines available choices rather than supplying evaluation answers.

`taxonomy-request.json` and `classification-request.json` are original mock-only serializations, not paid request captures or new model outputs. `classification-server-context.json` is trusted local validation state, not another model message. The original [provenance.json](provenance.json) records the October 20 example generation and nine original source-code hashes. Those nine files still match the recorded hashes at transfer time.

[transfer-manifest.json](transfer-manifest.json) records the October 26 transfer, source/destination hashes, additional source files consulted for efficiency behavior and validation of this reference. It is separate from the original example provenance.

Earlier illustration variants, edit archives, image-generation prompts, private runtime data, application source and `build_examples.py` were not copied. The original artwork's production and visual-review history remains in GitHub Manager's `docs/assets/ai-input-flows/README.md`; the source README hash is recorded in the transfer manifest. Reproduction commands in the main guide run in that original checkout with its installed dependencies, not here.
