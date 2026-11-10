# Research Scout architecture illustrations

**Latest executable diagrams — November 9:** [Provider routing and answer-stream sequence](../streaming-generation-2026-11-09.md#implemented-routing-and-streaming-architecture) include the implemented conversation controller and optional LangChain/OpenAI writer, plus current live gates. The older rendered review board below remains its dated audit artifact; its source hashes are not rebound to subsequent changes.

## Implemented review — November 9, 2026

Open the [three-diagram review board](review-2026-11-09/index.html), with native SVG and PNG downloads:

1. [Implemented connections](review-2026-11-09/implemented-architecture.png): actual core/agent/MCP/provider ownership, local fixture paths and separately qualified external adapters.
2. [Agent workflow](review-2026-11-09/agent-workflow.png): coordinator, specialist, real application MCP, deterministic retrieval, early SSE rows, compact context and human authority.
3. [Review checkpoint](review-2026-11-09/review-checkpoint.png): established foundation, limited live evidence and proposed next decisions.

The [full implementation review](../implementation-review-2026-11-09.md) includes editable Mermaid diagrams, framework explanations, endpoint/status tables and source references. The [diagram evidence record](review-2026-11-09/README.md) documents dates and validation. These figures supersede the older proposed illustration as the entry point for reviewing what has actually been built; they do not establish live model/search quality.

## Preserved Phase 1 / Increment 1 target — October 26

**Implementation update:** Increment 1 development is now approved and the local framework is implemented. This illustration is preserved with its generation-time `PROPOSED` label, exact prompts and source hashes. It describes the target shape, not measured readiness. See the [current executable ownership diagram](../implementation-status.md#implemented-decisions) and [validation evidence](../../docs/validation/increment-1.md); local transports/storage are now adopted while live OpenAlex/model/optional encoder gates remain.

![Research Scout's Next.js workspace sends a question to a provider-agnostic Python core. A Deep Agents coordinator delegates to a provider-bound specialist, then local application MCP and deterministic routing. Four separate Python provider services sit outside the core. OpenAlex is primary through official MCP and combines lexical and provider-embedded semantic text queries with compatible filters and same-provider deduplication/rank fusion. Semantic Scholar is an explicit complementary choice; Crossref and DataCite are exact DOI checks routed by agency. Validated observations are saved before progressive events make rows usable, independently of the final agent summary. Human review and saved-revision bibliography/manifest exports remain separate from agent decisions.](increment-1-architecture.png)

**Caption:** Proposed Increment 1 architecture with an independent application core and four separately run Python provider services. A discovery run selects one provider; OpenAlex is the primary/default via its official MCP. Its lexical and semantic branches intentionally combine within the same provider. The semantic text query is embedded by OpenAlex, so this path does not require a separate application embedding endpoint or vector database. Semantic Scholar is complementary only through an explicit separately selected run, with its semantic capability and any compatible encoder configuration still to be proved. Crossref and DataCite serve explicit exact-DOI checks selected by registration agency.

The single dashed OpenAlex connection and the nonprimary cards' route labels show conditional choices. The omitted nonprimary connectors are a deliberate readability simplification; the exact graph remains in [architecture](../architecture.md) and [provider routing](../provider-routing.md). The figure does not depict four-provider search fan-out, provider-to-provider requests or silently merged metadata. Its OpenAlex service card summarizes the independent Python service's upstream official-MCP operation: the Python service owns the MCP client, while remote OpenAlex performs query embedding. The hosted MCP server and embedding model are not inside the local application core.

Eligible observations pass scope/identity/effective-filter validation and are persisted before the application publishes progressive events to Next.js. A valid early branch result can be inspected and saved while the other branch, rank fusion or final model summary remains pending. The upstream may return a whole page; this is application-level progressive publication, not a claim of upstream per-entity streaming. Source observations remain separate. Human save/include/exclude, detail/check and export operations use the API path; exports render immutable saved revisions without a new research/model call.

“Compatible filters” means verified provider enforcement or equivalent deterministic filtering on attributable fields. A missing or unsupported constraint is disclosed; an unresolved result does not become an eligible match. Semantic Scholar's local semantic option, if selected and proved, ranks only its bounded candidate pool. It must not claim native corpus-wide semantic coverage. Detailed branch, rank and recovery contracts are in [hybrid retrieval](../hybrid-retrieval.md) and [progressive results](../progressive-results.md).

The figure covers **metadata/abstract discovery and bibliographic checking**, not acquired full text or scientific-validity verification. At generation time, database, live model configuration and implementation-specific transports were undecided or proof-gated. The illustration itself remains a target overview; current implemented choices are in the linked status record. It does not report live provider access or deployment.

- [Current PNG](increment-1-architecture.png): actual native export **1672 × 941 pixels**, retained without upscaling.
- [Complete generation and correction prompts](increment-1-architecture-prompt.md).
- [Generation-start source hashes](increment-1-architecture-source-snapshot.json).
- [Output hash, dimensions and visual QA](increment-1-architecture-review.json).
- [Increment 1 plan](../increment-1.md) and [UX implications](../ux-research.md).

Created October 26, 2026 with the project's Illustrated Explainers skill and the built-in image-generation tool. The existing illustration and bundled paper/ink/blue-purple style reference were inspected before editing. Author visual QA corrected the observation-to-revision direction and removed misaligned nonprimary routing arrows. The JSON review records the root agent's independent-review status separately. Generating this artwork performed no application-provider trial, application model trial or deployment.

## Preserved history

The [superseded OpenAlex-only edition](history/2026-10-26-openalex-only/SUPERSEDED.md) retains its original PNG, generation/correction prompts, review record and index byte-for-byte. Its older scope deferred DOI checks and did not contain the current independent provider-service, hybrid or progressive-delivery contract. The historical README retains original-location relative links; its supersession note explains that context and links current documents correctly.

Two [failed provider-routing drafts](history/2026-10-26-provider-services-drafts/README.md) are retained only for provenance. They contain incorrect conditional connector endpoints and must not be used as the current architecture.
