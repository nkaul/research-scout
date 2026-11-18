# Refined + Workbench: query transparency

This is a design-only extension for the November 13 hybrid mockup. It adds Workbench's retrieval focus to the Refined search surface while preserving the initial question and result reader. The working application is not changed and the prototype makes no API/model calls or credential reads.

The compact row displays three tonal Material-color topic chips, a direct/AI-refined next-search toggle, a one-line retrieval query and one Query trace disclosure. Expanding the disclosure stays inline, with Query overview, LLM input and Provider queries tabs. The original question is captured verbatim and is never replaced by the illustrative rewrite. Editing the question or settings marks them as a next-search draft; a trace snapshot only changes when Search is committed.

The query overview separates the original question from the focused lexical query and extracted keywords. LLM input shows the question, an explicitly labeled policy excerpt, structured input and an illustrative request envelope. The provider view has a separate lexical/semantic query and fixed filters for each selected source. OpenAlex is labeled provider-native semantic; REST candidate reranking is labeled local, and Unpaywall remains a post-discovery DOI access operation. Provider records are not blended by the design.

The initial example uses the existing Refined question and fictional context-engineering records. Custom questions are captured safely, but the prototype does not invent a new AI plan: it says so and preserves their wording. Direct search shows no LLM planning request. All traces and timings remain illustrative.

## Relationship to current implementation

The implemented [search-refinement UI](../../../frontend/src/components/search-refinement.tsx) already exposes `retrieval.intent`, `intent_frame`, `keywords`, `tags`, per-provider `provider_queries`, `llm_requests` and `source_requests`. The hybrid proposes a smaller, more visible entry point for those same records.

The planning input shape follows [retrieval.py](../../../backend/src/research_scout/retrieval.py): `question`, prior user messages, routing, selected/eligible providers, provider capabilities and fixed filters. The provider profile strings are copied from the current repository. The prototype request envelope is a labeled preview, not an exact live request. It excerpts the repository's planning policy and omits the expanded output schema. A future application adoption should present the actual saved `llm_requests[].body` and `source_requests[].executed_arguments`, preserving execution status and distinguishing planned from executed queries. Nothing in this mockup makes a new model or provider integration operational.

## Integration contract

`parts/hybrid-query.js` installs into `#hybrid-trace-host` after the Refined base scripts. It exports `window.hybridTrace.commit({question,sources,filters,aiEnabled})`, `setBusy(bool)`, `getSnapshot()`, `open(section)` and `close()`. Sections are `overview`, `llm` and `providers`. The visible AI toggle is `#ai-refine`; the performance part reads its next-search value. Source IDs or display labels are accepted and normalized. A commit emits `hybrid:trace-change` with a copied snapshot. The component uses scoped styles and escaped data throughout.

## Component checks

The component passed ten standalone Chromium checks against a temporary copy of Refined: topic chips; original query display; next-search draft separation; verbatim LLM input; separate provider queries; keyboard tab movement; direct-search no-LLM state; HTML-injection-safe custom text; a custom-query fallback without invented planning; and no horizontal overflow at 1440, 390 and 320 pixels. There were zero JavaScript errors and zero HTTP requests. The final integrated mockup is validated separately by the parent task.
