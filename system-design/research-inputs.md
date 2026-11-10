# Research inputs and design reconciliation

**October 26, 2026 · two-agent review · planning evidence**

The user requested exactly two research subagents. Their complementary readings inform one incremental product design. During the original readings neither agent modified files, installed packages, inspected credentials or made live research-provider/model calls. Public documentation was consulted for the integration facts below. Later refinements by the same Basic Research agent update this document and product organization for provider isolation, progressive entities and hybrid retrieval; they add no application code or external calls.

## Basic Research — resource guide

**Assigned source:** [Project Research Resource Guide](../discovery/research/project-research-resource-guide.md), all 404 lines, including all 142 directory entries across 14 categories. Compiled October 25 from research reviewed October 24–25, 2026.

**SHA-256:** `b1d150f0bb399c30395e646c1026c31615b9fb99ecc9e385288b8a5ee5e135fc`.

The guide's main contribution is a way to connect a project decision to evidence, usable resources and a reproducible approach. Its provider directory is discovery context, rather than a measured ranking of services or proof that integrations work.

### Complete category coverage

| Guide category | Entries | Design implication |
| --- | ---: | --- |
| Research papers and scholarly discovery | 25 | Distinguish indexes, original venues, publication status, metadata and accessible article content. |
| Evidence synthesis and study methods | 3 | Reviews, protocols and study registrations have different evidentiary roles. |
| General datasets and research repositories | 14 | Preserve original producer, dataset version, documentation and file-level access. |
| Official statistics and public sector data | 15 | Units, population, geography, methodology and revision/vintage matter. |
| Scientific and geographic domain data | 15 | Add type-specific fields for processing level, calibration, coordinates or population splits when needed. |
| Cloud catalogs, web corpora and knowledge graphs | 10 | A catalog, query engine, archive and knowledge graph are different capabilities. |
| Code repositories, packages and dependency intelligence | 11 | Pin code versions and distinguish maintenance/popularity signals from quality evidence. |
| Models, benchmarks and evaluation | 6 | Model discovery, inference, task quality and performance benchmarking are separate activities. |
| Documentation, standards and learning | 10 | Retain exact version, normative/draft status and authoritative producer. |
| Practitioner knowledge and user needs | 4 | Treat discussion as leads and hypotheses; validate important claims and user needs independently. |
| Design assets and cultural collections | 7 | Rights and attribution attach to actual files and permitted uses. |
| Patents, companies, markets and public funding | 8 | Preserve entity, jurisdiction, reporting period and original record; activity does not establish success. |
| References, provenance and research identities | 5 | Persistent identifiers and entity resolution support the evidence chain. |
| Search, extraction and integration discovery | 9 | Search tools and connector directories supply capabilities/leads, rather than original research evidence. |
| **Total** | **142** | These are catalog facets, not 142 implementation commitments or 14 required services. |

### Findings carried into the design

1. Keep **user intent, resource type, provider, acquisition route, evidence role and output** separate. A provider may supply several resource types; MCP is a route, not a research category.
2. Follow the common journey: define the decision → discover → inspect original artifacts → select/reject → produce an attributed result → revisit explicitly.
3. Separate the source registry from retrieved resources. A directory entry documents a possible source; a provider record documents an actual observation.
4. Discovery is distinct from access, acquisition, parsing and substantive evidence. Metadata APIs, search engines and citation counts do not establish that an article was read.
5. Rights and restrictions can differ by artifact/version. Future processing policy must accommodate material that may only be processed locally.
6. Documented, authenticated, protocol-tested and useful are different integration states. An unverified MCP entry is an evidence gap, not proof that a server does not exist.
7. Preserve version/time semantics and original producer relationships. Do not conflate related versions or count repeated metadata from several indexes as independent evidence.
8. The guide's 30/25/20/15/10 selection weights are an editorial aid, not calibrated confidence or measured provider scores.
9. Measure discovery relevance, source identity, acquisition, passage fidelity, evidence support and task completion separately. Look for contradictory findings and coverage gaps as later capabilities develop.
10. Start a source ledger now: question, original title/producer/ID/URL, actual query and route, retrieval date, known version, access, transformations and selection rationale. Add file checksums and passage locators when actual assets exist.

These findings come from the guide's “How to choose between sources,” “A repeatable project research workflow,” API/MCP labeling, category notes and final source-ledger sections.

## Interim Research — development handoff

**Assigned source:** [Research Scout development handoff](../discovery/research/research-scout-development-handoff.md), all 1,260 lines and all 16 sections. Prepared October 26 from research reviewed October 25–26, 2026.

**SHA-256:** `89c9236f5c8abbc42b02ad39aa83421fa7e01d337545914a8be61f2fbef7f3a7`.

The handoff covers the objective, provider recommendations and source reviews; interfaces and access; shared-core architecture; evidence workflow and conceptual data; API/MCP contracts; increments; evaluation; operations; outputs; backlog; continuation instructions; and source register. It is planning evidence, not an implemented application.

### Original agent recommendation — superseded sequencing

The initial two-agent planning pass proposed the following sequence. The OpenAlex-only increment and combined-backend adapter placement were agent assumptions, not user requirements. The latest direction below supersedes those parts while preserving the original readings and rationale.

- Build one complete useful journey around **OpenAlex only**: question → bounded discovery → inspected candidates → human shortlist → provisional bibliography and query manifest.
- Reduce the handoff's original first increment, which included OpenAlex, Crossref and DataCite, by moving independent DOI verification and bibliographic reconciliation to Increment 2. This reduction is superseded in the revised proposal.
- Preserve the latest confirmed stack: Python, Next.js, LangChain Deep Agents with multiple roles, local application MCP and suitable provider MCP. A fixed-only search service would leave the agent foundation unproven.
- Keep database selection open. The handoff's SQLite/FTS5, backend framework, local-first and transport suggestions remain proposed choices.
- Make UI/API and MCP use the same domain services. The initial proposal placed provider adapters in the application backend; the latest direction replaces that placement with separate provider services and a provider-agnostic core/router.
- Preserve distinctions among missing metadata, provider miss, malformed identifier, independently verified identifier, abstract availability and full-text acquisition.
- Save an immutable selection/metadata revision before exporting. Never generate missing authors, dates or identifiers to complete a bibliography.
- Retain bounded retries, usage accounting, partial results, cancellation and restart semantics in the first slice. They are needed for correctness even before larger operational work.
- Defer full-text ingestion, passage search, comparison, landscapes, web, video and datasets until their underlying capabilities can be proved.

### Latest direction and revised sequence

**Confirmed by the latest user instruction:** keep each provider separate, avoid multiple provider integrations in one backend and route to specific providers. Multiple-provider use requires an explicit purpose supported by the research; there is no default mixing, fan-out or provider fallback.

The resulting design uses a provider-agnostic application core/router and independent Python provider-service/process boundaries. Each provider owns its own integration, transport, access configuration, credential handling, request limits and observations. Shared application contracts do not become a shared provider implementation. The [provider routing contract](provider-routing.md) and [architecture](architecture.md) define these boundaries.

**Revised sequencing proposed for review:**

1. Prove the shared application journey against a separate OpenAlex service first.
2. Include separate Crossref and DataCite services in Increment 1 for explicit, registration-agency-aware DOI verification. Their presence in the handoff's original Increment 1 is preserved; do not turn a provider miss into a request to every registry.
3. Enable a separate Semantic Scholar discovery service at a later Increment 1 build checkpoint. The handoff originally placed Semantic Scholar in Increment 2; bringing it into Increment 1 is a new sequencing proposal, not a finding from the guide or a confirmed user choice.
4. Keep each discovery run scoped to the selected provider, OpenAlex or Semantic Scholar. A provider change creates a separately attributed run; it is not fallback or an invisible extension of the first search.
5. Keep registration-agency observations distinct from discovery records. Exact identifiers can link observations; differing assertions remain explicit conflicts. Do not force one preferred metadata record, blend rankings or infer identity from a similar title.

DOI verification has a research-supported purpose distinct from discovery: check an exact identifier against its responsible agency. That check does not establish substantive correctness of a paper, nor make OpenAlex/Semantic Scholar metadata independently verified field by field. An unknown agency or unresolved identifier remains an explicit outcome.

The two staged product outcomes remain **MVP 1: discovery workspace** and **MVP 2: evidence workbench**. Provider isolation is confirmed; service enablement order, additional Increment 1 scope and later evidence milestones remain proposals. Database selection and application implementation remain open.

### Later user refinements — progressive and hybrid discovery

The user subsequently confirmed progressive entity rendering: publish usable provider-scoped records as they arrive, allow inspection and saving while the run continues, and do not wait for every agent/provider or a final summary. Later metadata, verification and ranking updates must preserve human decisions, reasons and saved revisions. The [progressive-results contract](progressive-results.md) records the detailed lifecycle.

The latest user instruction requires **hybrid lexical + semantic + filters retrieval for OpenAlex and other discovery providers**. The immediately preceding product draft treated lexical and semantic modes as alternatives and prohibited an automatic second query. That was a planning restriction; the user now explicitly authorizes planned within-provider lexical/semantic combination. It is superseded. Provider isolation, separate discovery scopes and the prohibition on default cross-provider fan-out/fallback remain in force.

For the primary/default OpenAlex service, the revised plan uses its native MCP lexical and semantic searches under a declared filter plan. Query text goes to the provider's semantic search; OpenAlex performs the embedding, so no local embedding model or vector store is required for this native route. Combine candidate identities/ranks only within that provider, preserving each branch's executed query, filters, original rank, observations and failure/partial state. The rank-fusion algorithm is a proposal to evaluate, not an adopted or measured relevance improvement. [OpenAlex connector](https://help.openalex.org/access/connector/), [semantic search](https://help.openalex.org/api/semantic-search/).

The resulting journey is **user input + filter plan → two bounded retrieval branches → progressively visible entities → same-provider identifier deduplication and rank fusion**. Early rows remain inspectable/saveable while the other branch is pending. Later branch hits and ranking changes do not overwrite user decisions or create duplicate rows; the summary remains a separate artifact. Unsupported filter combinations and missing branches remain visible rather than being silently relaxed or called a complete hybrid search.

Semantic Scholar remains a separate selected search scope; its brand or scholarly-graph features do not establish native semantic-query support. If the capability proof does not establish native semantic retrieval, a compatible local query/document encoder for bounded reranking of its own permitted candidate titles/abstracts is proposed. Model/settings and this local path remain open and unproved. Reranking a lexical pool does not recover documents outside that pool; preserve that coverage limitation and evaluate the semantic stage separately. No Semantic Scholar records or scores enter an OpenAlex fused ranking.

Crossref/DataCite remain exact-DOI verification services, selected through the registration-agency route; they do not need semantic search. Their observations do not become fields in a forced common metadata record. The [hybrid-retrieval design](hybrid-retrieval.md) records the proposed algorithm, provider-specific capability proofs and evaluation obligations.

## Current checks affecting the proposal

Official pages were opened on October 26, 2026. No authenticated integration or tool-schema discovery was performed.

| Area | Finding and consequence | Primary reference |
| --- | --- | --- |
| Provider MCP | OpenAlex publishes a remote OAuth/Streamable HTTP connector. Its documented discovery tools are `search_works` and `get_work`; the runtime tool schemas still need checking. | [OpenAlex connector](https://help.openalex.org/access/connector/) |
| Capability scope | The connector does not fetch PDFs or bulk-export whole result sets. Its wider catalog includes profile-management operations, so expose a narrow discovery allowlist. | [OpenAlex connector](https://help.openalex.org/access/connector/) |
| REST access | Basic anonymous API use exists; a verified-email key is needed for keyed use and cursor traversal beyond its first page. A REST key is a different credential from MCP OAuth. | [Authentication](https://help.openalex.org/api/authentication/), [paging](https://help.openalex.org/api/paging/) |
| Search reproducibility | Transport and query fields affect matching. Provider ranking/reranking must be recorded; REST and MCP should not be treated as interchangeable query replays. | [Search](https://help.openalex.org/api/searching/), [connector](https://help.openalex.org/access/connector/) |
| Native OpenAlex hybrid route | The documented connector supplies lexical/Boolean and semantic search. The plan combines those operations within OpenAlex; its semantic route embeds query text at the provider. Filters and actual tool arguments still require a capability proof. | [Connector](https://help.openalex.org/access/connector/), [semantic search](https://help.openalex.org/api/semantic-search/) |
| Framework integration | Current LangChain documentation uses the beta `langchain.mcp.MCPAdapter` surface and provides a migration route from older adapters. Choose and lock compatible versions after a capability proof. | [LangChain MCP](https://docs.langchain.com/oss/python/langchain/mcp) |
| Agent capabilities | Deep Agents has default scaffolding and a general-purpose subagent; supplying custom tools alone is not a proof that other capabilities disappeared. Inspect the effective role/tool catalog. | [Subagents](https://docs.langchain.com/oss/python/deepagents/subagents), [backends](https://docs.langchain.com/oss/python/deepagents/backends) |

Interim Research also found contradictory authentication/read-only wording in the [official server repository README](https://github.com/ourresearch/openalex-mcp-server). Current provider documentation and a recorded runtime capability proof govern integration behavior; a README assertion alone is insufficient.

## Reconciled design direction

| Question | Reconciled proposal | Reason |
| --- | --- | --- |
| One product or competing plans? | One product, two staged MVP outcomes. | The two readings provide complementary breadth and first-slice discipline. |
| MVP 1 | Discovery workspace: attributed searches, inspected resources, saved shortlists and exports. | Useful before document ingestion or synthesis exists. |
| MVP 2 | Evidence workbench: accessible documents, locatable passages and supported comparisons. | Adds a distinct evidence-quality obligation. |
| Provider isolation | A provider-agnostic application core/router with separate Python provider services. | Latest confirmed user direction; provider integrations do not share the application backend. |
| First enabled provider | OpenAlex scholarly discovery. | Proposed first build checkpoint, rather than a restriction to one provider for all of Increment 1. |
| Increment 1 verification | Separate Crossref/DataCite services, chosen by an explicit registration-agency route. | Returns verification to the handoff's original increment while preserving observations and conflicts. |
| Additional discovery lane | Separate Semantic Scholar service at a later Increment 1 checkpoint. | New sequencing proposal; the original handoff placed it in Increment 2. |
| Discovery scope | One explicitly selected provider per run; no default cross-provider fan-out, blending or fallback. | Keeps user intent, service access, ranking and evidence provenance inspectable. |
| Hybrid retrieval | Planned lexical + semantic branches with filters inside the selected discovery provider; same-provider deduplication and proposed rank fusion. | Latest confirmed search strategy supersedes the earlier single-mode restriction; branch ranks and provenance remain inspectable. |
| Progressive entities | Usable rows appear before all branches/agents finish; human inspection and saving remain available. | Latest confirmed experience requirement; later updates preserve decisions and saved revisions. |
| Semantic capability | OpenAlex native semantic search first; a bounded compatible local encoder/reranker is proposed for another provider only if needed and proved. | No local embeddings are needed for OpenAlex's native route; another provider's semantic coverage cannot be inferred by name. |
| First agent topology | One Deep Agents coordinator and one provider-scoped scholarly-discovery specialist per run. | Proves real delegation without conflating agent roles with independent provider services. |
| Access route | Local application MCP → provider-agnostic core/router → named provider service → its verified MCP/API route. | Shared application semantics coexist with independent provider ownership. |
| Transport choice | A separately recorded MCP/API choice within one provider service, with no automatic switch to another provider. | Avoid hidden duplicate requests or changed search semantics. |
| Metadata relationships | Separate provider observations, exact identifier links and explicit differences; no forced common record. | Verification does not overwrite discovery or establish version equivalence. |
| Storage | An interface and explicit first-slice persistence decision, with no database selected here. | Preserves the user's decision to discuss databases incrementally. |

The product structure is detailed in [product organization](product-organization.md), the shared boundaries in [architecture](architecture.md), and the concrete first slice in the [Increment 1 review plan](increment-1.md). These recommendations remain subject to review; the confirmed stack remains authoritative.

## Original refinement review by the same two agents

Basic Research reviewed the drafted organization against the complete resource guide and found the category coverage, independent facets, journeys and staged MVP outcomes coherent. Interim Research reviewed a realistic first-slice execution against the handoff and access findings. Their concrete corrections were incorporated:

- The initial specialist is search-only; user-triggered details remain a deterministic service action.
- Search and detail attempts share one remaining allowance; retries can reduce available details, which the UI must disclose.
- The agent deadline is separate from later human review/detail-action timeouts.
- Successful provider candidates survive a subsequent model failure as a partial result; model IDs/field references are checked against saved records.
- Selected metadata hydration creates a new export revision even when selected IDs are unchanged.
- The three-paper cap applies to inclusion; the user may exclude every candidate.

This is a document/design review, not runtime validation. Actual protocol compatibility, schema completeness, budget admission and persistence crash behavior remain implementation proof gates in the plan. No additional subagents or live research/model calls were used.

That original review validated the then-current OpenAlex-only draft. Its provider count, shared-backend adapter placement, single-query assumptions and deferred-verification sequence do not establish approval for the revised design. Later Basic Research updates preserve the original research and review record, align product organization and this reconciliation with provider isolation, progressive rendering and hybrid discovery, and leave revised service/branch limits, access proofs and quality measurements to the updated architecture/Increment 1 and focused retrieval plans.
