# Increment 1 — hybrid discovery, isolated providers and progressive results

**Current automatic discovery:** [Multi-source discovery, canonical DOI papers and automatic Unpaywall](automatic-federated-discovery-2026-11-09.md) is the latest user-directed default. Source selection is optional advanced behavior; a recorded eligible route searches multiple isolated services, groups matching DOIs into one paper and resolves access links through Unpaywall automatically. Earlier manual-selection/two-source defaults are superseded.

The automatic slice is implemented and validated: no-selector Search/Exploration entry points, two-to-four eligible provider plans, DOI paper grouping with provider provenance, up to twelve automatic Unpaywall lookups, progressive access cards and saved read-only restoration. Validation passed 270 Python, 43 browser and 11 structural harness cases plus lint/typecheck/build; actual fixture grouping and a bounded three-provider live search both passed. [Execution evidence and remaining limits](automatic-federated-discovery-2026-11-09.md#validation-checkpoint).

**Current provider relevance correction:** [Provider-specific queries and independent quality review](provider-relevance-v2-2026-11-09.md) replaces the shared-query/pooled stopping rule: Crossref uses bibliographic search, every selected provider gets its own query plan and repair decision, and primary results exclude adjacent/uncertain records. Search-workspace AI submissions use the same reviewed conversation path. The exact-question live retest passed: two Crossref pages, three model calls, five primary matches with abstracts, explicit intent/keywords/tags and saved LLM/provider request traces. 234 Python, 39 browser and 11 harness checks passed. Earlier checkpoints below retain their dated behavior.

**Latest November 9 query-relevance checkpoint:** [Agentic retrieval and ranking](agentic-retrieval-2026-11-09.md) adds optional structured LLM query planning, provider-batch relevance review and at most one query revision through LangGraph, retaining Deep Agents/application MCP and isolated providers. Chat direct-search fusion ordering is corrected. AI-reviewed results have explicit intent, query history, relevance reasons and shared paid-call accounting; prior deterministic-only statements below are historical where superseded. Live exact-query acceptance passed: 39 reviewed observations, 16 withheld, first reviewed batch at 14.8 seconds; 225 Python, 32 browser and 11 structural harness cases pass.

**Version 0.3 · October 26, 2026 · development/design approved; local framework implemented**

**Latest approved expansion — November 9:** [Provider integration execution](provider-expansion-2026-11-09.md) implements the user's new source request. arXiv/OpenAIRE/Europe PMC/Crossref discovery and progressive content have live proof; Unpaywall access is implemented and live-validated after private contact configuration. Validation: 185 Python tests, 27 browser journeys, 11 structural evals. Original work packages/limits below remain their historical baseline; the dated execution defines the expanded provider roles.

**Latest November 9 usability/data correction:** [Visible abstracts and richer evidence](richer-sources-and-abstracts.md) are implemented in the current provider-isolated slice. A [research-backed source expansion sequence](../discovery/research/free-scholarly-sources-review-2026-11-09.md#recommended-execution-sequence) proposes arXiv first, OpenAIRE V3 coverage/auth validation and Europe PMC for biomedical questions. These future adapters are not implied by Increment 1's existing four connections.

**Latest November 9 extension:** the user's explicit generation-streaming request adds the [bounded saved-evidence answer demo](streaming-generation-2026-11-09.md). It is implemented and live-tested through LangChain/LangGraph, while the existing Deep Agents/MCP retrieval remains deterministic and provider-isolated. Current tests: 143 Python, 18 browser, 11 harness evals; one live model stream with zero new scholarly calls. Production model selection and retention remain separate. Historical unconfigured/access statements below are superseded by the latest dated acceptance records.

**Subsequent November 9 access proof:** [OpenAlex OAuth/native live discovery acceptance](openalex-connection-2026-11-09.md) supersedes the original unconfigured OpenAlex status below. The grant, both native branches, details and an actual year-filtered UI/MCP journey passed; hosted generation remains deferred.

**November 9 approved follow-up:** the [integration execution record](integration-execution-2026-11-09.md) documents implemented deterministic conversation routing/UI and independent provider access work from the [adjusted plan](live-operations-and-chat-plan.md). Each discovery child retains the single-provider contracts below. Hosted generation/model choice and bookmark retention were deferred; OpenAlex authorization and S2 keyed search remain explicit gates.

**Status:** the user approved Increment 1 development/design, validation and basic context/harness evals. The local framework is implemented and tested with authored fixtures, actual Deep Agents/application MCP and independent services. Public Crossref/DataCite metadata probes succeeded; Semantic Scholar returned HTTP 429. OpenAlex OAuth/native live hybrid and a hosted language model remain unconfigured. See [implementation status](implementation-status.md) for adopted decisions and package checkpoints, and [validation evidence](../docs/validation/increment-1.md) for results. Production database and commercial model choices remain open.

References: [architecture](architecture.md), [provider routing](provider-routing.md), [hybrid retrieval](hybrid-retrieval.md), [progressive results](progressive-results.md), [UX intake](ux-research.md), [architecture illustrations](diagrams/README.md).

## 1. Outcome and execution summary

A user asks a scholarly question, receives progressively usable results from a bounded lexical-plus-semantic search within the selected provider, inspects/saves sources while work continues, explicitly checks selected DOI metadata, reopens saved work and exports an attributed bibliography/manifest.

**OpenAlex is the primary/default discovery resource, using its official MCP and native semantic search.** Semantic Scholar is a separately enabled complementary search choice. Crossref and DataCite have distinct registry-check services. No search fans out across providers; no provider failure silently switches the route. The user explicitly authorizes the within-provider lexical/semantic combination.

The approved execution sequence is below. Implementation/live-readiness evidence for each package is recorded in the checkpoint matrix rather than inferred from completion of code alone:

1. Define service isolation, source/branch identity, filtering, progressive events, state ownership and finite limits.
2. Prove Deep Agents/application MCP and OpenAlex's actual OAuth/tool/search-mode contracts with fixtures and separately bounded live checks.
3. Establish durable app state, provider operation receipts and snapshot/event recovery.
4. Build the independent OpenAlex service: lexical and native semantic branches, compatible filters, progressive observations and same-provider dedup/ranking.
5. Connect the core router, application MCP and progressive browser delivery; no final-agent-summary barrier.
6. Integrate the coordinator/specialist under the selected provider's capability and limits.
7. Complete the Next.js question → early rows → inspect/save journey with stable updates and partial states.
8. Add the separate Crossref service and explicit DOI agency/metadata checks.
9. Add the separate DataCite service and registration-aware exact lookup; preserve parallel observations/conflicts.
10. Add Semantic Scholar as a separately proved complementary choice, with an explicitly supported semantic strategy.
11. Export immutable saved revisions and test isolation, filters, hybrid branches, reconnect/restart and failure behavior.
12. Run bounded live acceptance per enabled provider, record actual results/usage and reconcile this design.

OpenAlex can become useful at an earlier checkpoint. Its use does not wait for all four services. Expanded Increment 1 is not fully validated until its own enabled-provider gates pass or a changed scope is explicitly recorded.

## 2. Rationale and requirements

The initial plan treated “one basic service” as one external provider and deferred Crossref/DataCite. That was our scope assumption, not a research requirement. The original [handoff](../discovery/research/research-scout-development-handoff.md#10-incremental-development-plan) placed OpenAlex plus Crossref/DataCite in Increment 1 and Semantic Scholar in Increment 2. This revision restores registry checks and proposes bringing forward a separately enabled Semantic Scholar slice.

| Confirmed direction | Consequence |
| --- | --- |
| Separate providers; avoid several provider integrations in one backend | Independent Python provider services/processes; provider-agnostic app core. |
| Explicit routing; no unjustified mixing | One discovery provider per run; exact agency-routed metadata checks; immutable source observations. |
| Show entities progressively | Persist and publish early valid records before other branches, agents or summaries finish. |
| OpenAlex is a key resource with official MCP | Default first integration; prove native lexical, semantic and supported structured capabilities. |
| Hybrid lexical + semantic with filters | Within-provider branch plan, explicit effective filters, progressive dedup and proposed deterministic fusion. |
| Python, Next.js, Deep Agents multi-agent, local/provider MCP | Coordinator + provider-bound specialist; application rules remain behind local MCP. |
| Storage decisions evolve separately | Interfaces and reviewed small-slice persistence option; no selected database. |

Metadata checking concerns bibliographic identity/fields, not scientific validity or full-paper understanding. Full-text acquisition, parsing, passage evidence, scientific synthesis, broad citation traversal, landscapes, web/video/dataset/code lanes, multi-user hosting and distributed background workers remain deferred.

## 3. Service and search scope

| Service | Increment 1 responsibility | Access readiness |
| --- | --- | --- |
| Application core | Brief/run lifecycle, agents, local MCP, deterministic routing, saved observations, progressive events, human selections and exports | Implemented FastAPI/local JSON/HTTP/MCP/SSE; fixture/process validation passed. |
| OpenAlex | Primary hybrid discovery and its own details through official MCP | OAuth and actual schemas unproved; allow only needed read tools. |
| Crossref | Explicit registration-agency lookup and Crossref DOI metadata | Public REST read path; configure client identity/contact policy. No write access needed. |
| DataCite | DataCite DOI singleton metadata after agency routing | Public metadata API; no member/write credentials required. |
| Semantic Scholar | Separate complementary search/details; semantic route must be verified or explicitly provided locally | Endpoint access/API-key configuration and compatible encoder, if needed, unproved. |

Each service independently owns its upstream client, access, cache namespace, retry/rate policy, health and durable attempts. The core must start with optional services stopped. One repository is acceptable; four provider routers inside the same backend process do not satisfy the separation requirement.

OpenAlex's connector documents `search_works` with keyword/Boolean and semantic modes, OQL/preview, and `get_work`. Its native semantic request takes text; **OpenAlex generates the query embedding**. No additional local embedding call/store is required for that route. Actual MCP arguments and filter combinations still require proof. [Connector](https://help.openalex.org/access/connector/), [semantic reference](https://help.openalex.org/api/semantic-search/).

Semantic Scholar's relevance-search name is not proof of a native vector-query endpoint. If native semantic retrieval is unavailable, propose a compatible local query-and-document encoder over that provider's bounded metadata pool. This reranks the fetched pool; it cannot discover absent papers. Model/version, hardware, permitted inputs and resource limits require proof before claiming hybrid support. Crossref/DataCite exact-DOI checks do not need an artificial lexical/semantic search pipeline.

## 4. Representative journey

1. Enter the question and filters. OpenAlex and hybrid retrieval are the implemented defaults; the selected provider and supported scope are visible. Questions are limited to 2,000 characters and 2,000 UTF-8 bytes without truncation; current hard filters are explicit year/type fields.
2. Start a run. The core returns an ID and shows preparation plus lexical/semantic branch status. A coordinator delegates once to a provider-bound specialist.
3. The specialist calls application MCP. The router dispatches only to the selected service. That service executes the admitted branch plan and returns normalized observations progressively.
4. As each valid, filter-eligible entity is persisted, it appears as a stable source row. Its title, available metadata, original link, source identity and content state are usable immediately, even while the other branch/summary is pending.
5. Inspect or include/exclude early rows. A detail request remains explicit, uses the originating provider and shows its own pending/error state. Optional generated fit notes arrive separately and cannot overwrite source fields.
6. The provider service retains lexical/semantic contributions and deduplicates its own canonical IDs. Proposed fusion updates ranking metadata; the UI does not jump/reorder a row under the user's focus. A final-rank view is an explicit view action.
7. Include up to three sources and exclude any candidate, with optional reasons. Selected record snapshots and human decisions survive late metadata/rank changes.
8. Explicitly request a selected DOI check. Normalize the DOI, establish its agency through saved evidence or a recorded agency lookup, then query only the matching Crossref or DataCite metadata service. Show matching/conflicting/missing observations separately.
9. Reconnect or reopen. Read saved snapshots/events without new external work. Other-provider search requires a separate explicit run; no blended result list.
10. Export bibliography and manifest from a saved revision, including provider/branch/query/filter provenance, missingness, registry observations and unresolved conflicts.

The UI can show ready entities while a run remains `RUNNING`. One failed branch yields an honest partial outcome, rather than a blank screen or a silently relabeled lexical-only “hybrid success.”

## 5. Hybrid and routing contracts

See [hybrid retrieval](hybrid-retrieval.md) for the detailed pipeline and [provider routing](provider-routing.md) for registry dependencies.

- Create one versioned plan with the selected provider, lexical/semantic representations, filter policy, per-branch limits and output cap. Preserve both requested and effective queries; disclose rewriting/truncation.
- Distinguish branch-specific lexical/Boolean expressions from the user's hard inclusion/exclusion predicates. Semantic matches need not repeat lexical words unless those words are an explicit hard constraint. Apply equivalent required filter semantics to both branches. Push supported filters upstream. A determinable unsupported filter may be applied locally and recorded; unknown fields remain unresolved/excluded under the stated policy. Never silently relax a filter or imply exhaustive coverage after bounded post-filtering.
- For OpenAlex, lexical and native semantic searches are two distinct upstream attempts. Shared filters do not make incompatible keyword/semantic parameters valid in a single provider request.
- Deduplicate and rank-fuse only inside the selected provider. Preserve branch rank/score, original record and filter evidence. Reciprocal rank fusion is a candidate, with parameters to evaluate; raw relevance/cosine scores are not directly interchangeable.
- Where local encoding is needed, query and document vectors use a compatible model/version/space, dimensionality, preprocessing and similarity rule. No dot products across unrelated embeddings. Key caches by content hash and encoder configuration.
- DOI checks use the explicit Crossref agency operation only when needed, then one matching metadata service. A Crossref miss/error never triggers blind DataCite lookup. Known DataCite routes work independently of Crossref.
- A linked registry record remains a separate observation. Default bibliography fields come from the selected whole discovery-record snapshot. An explicit whole-record citation-source choice can adopt a registry snapshot; no silent field filling, score pooling or source overwrite.

## 6. Agent, API and event contracts

| Role | Allowed work | Prohibited behavior |
| --- | --- | --- |
| Coordinator | Read bounded brief/capabilities, delegate once, return summary/references | Add providers, raise limits, mutate shortlist or start nested agent trees. |
| Discovery specialist | Call the selected run-scoped hybrid search capability; return saved IDs/field references | Substitute provider, invent source fields, claim full-paper reading or authorize human decisions/checks. |
| Deterministic services | Plan/admit branches, validate, normalize, filter, deduplicate/fuse, cache, persist, publish and export | Treat model suggestions as human acceptance or broaden/replay work silently. |
| Human | Inspect, select, choose citation record, request details/checks, start a different-provider run and export | Saved review needs no external credentials or completed summary. |

Implemented local interfaces (live readiness remains provider-specific):

| Interface | Behavior |
| --- | --- |
| `POST /api/research-runs` | Validate question, selected provider, hybrid plan/filters, limits and idempotency key; return run ID promptly. |
| `GET /api/research-runs/{id}` | Saved status, capability/branch states, usage, warnings and snapshot cursor. |
| `GET /api/research-runs/{id}/results` | Saved entity snapshot and versions; zero external calls. |
| `GET /api/research-runs/{id}/events` | SSE of persisted state snapshots, with opaque cursors and replay/gap recovery. |
| `POST .../papers/{source_ref}/details` | Explicit originating-provider hydration, separate timeout/allowance. |
| `POST .../papers/{source_ref}/metadata-checks` | Human-requested DOI agency/registry workflow, separately audited. |
| `PUT .../selections/{source_ref}` | Human include/exclude/reason or whole-record citation choice, with expected revision. |
| `POST .../exports` and `POST .../cancel` | Snapshot/export existing data or fence future work; preserve completed observations. |
| Local `/mcp/` | Run-scoped `search_papers` and saved `get_research_run` through the same rules; no arbitrary URLs/paths or provider credentials. |

Provider services receive operation IDs, allowed capability/query/filters, deadlines and bounded grants. Their result/status interface permits branch/entity updates before overall completion. The provider owns upstream retry accounting; app-to-service timeouts are uncertain outcomes, not permission to redispatch.

Persist candidates before returning references to a model. Validate model IDs/field references; a later model failure preserves visible records as `PARTIAL`. Inspect effective Deep Agents defaults, scratch tools, subagents and internal repair/compaction calls; lock compatible versions after the actual capability proof.

## 7. State, persistence and progressive recovery

Run execution, branch/provider operations, metadata checks, selection and connection state are independent. Proposed run outcomes are `SUCCEEDED | EMPTY | PARTIAL | FAILED | CANCELLED | INTERRUPTED`; first arrival does not mean completion.

Use stable `(provider, record_id, observation_version)` source identity plus operation/branch provenance. Application events add run-scoped sequence and entity version. Persist a coherent state change/sequence before publication; replay/deduplicate events and recover expired cursors from a snapshot without starting external work.

The local implementation uses JSON snapshots/manifests behind interfaces with one core writer and atomic publication of state plus bounded event history. Provider services have separate locked journals/cache namespaces; no provider writes core files. Crash/reopen, single-writer and grant-reconciliation cases have test evidence. No production database or automatic durable framework replay policy is adopted; nonterminal runs reopen as interrupted.

Reopen, selection and export make zero external/model calls, including with all services stopped. Human details/checks have their own deadlines and remaining run grants after agent execution ends. Cancellation fences future work/late effects, retaining observed records and uncertain-attempt receipts. No automatic replay on restart.

Selection/source-snapshot or included metadata-check changes produce a new export revision. Early user decisions stay intact when more results, ranking, details or verification arrive; prior exports retain their original source versions. Reevaluate filters on updated filter-bearing metadata. A newly ineligible source leaves the current eligible rank view but any saved selection/history remains visible with an explicit warning; it is never silently erased or left labeled eligible.

## 8. Finite limits and live proposals

Provider/candidate/shortlist/topology/deadline defaults below are adopted for the local framework. Live token/money/session ceilings remain proposals until a model and actual access are configured. They are not quotas or measured quality/latency. A lower configured/account remainder wins. The old four-operation ceiling assumed a single OpenAlex search and is superseded.

| Limit | Proposed default |
| --- | --- |
| Native retrieval branches | One lexical and one semantic query within the selected provider; no automatic query expansion/paging. |
| Candidate capacity | Up to 10 raw retrieved candidates per native branch and at most 20 distinct raw union entities; postfiltering may yield fewer eligible/displayed results. Reserving both branches prevents early lexical results suppressing semantic-only arrivals. No extra overfetch is included; a larger raw ceiling needs a separately recorded plan/grant. |
| Local semantic alternative | Up to 20 same-provider lexical candidates; semantic reranking cannot claim broader recall. |
| Human shortlist/check targets | At most 3 included sources; explicit registry checks for at most those 3 DOI-bearing selections. Any candidate may be excluded. |
| Selected discovery provider | At most 8 upstream attempts across admitted branches, details and retries. The nonselected discovery provider receives zero calls. |
| Crossref | At most 6 upstream attempts, counting agency and metadata operations plus retries. |
| DataCite | At most 3 upstream attempts, including retries. |
| Overall research attempts | At most 16 per discovery run across its later detail/check actions. Per-provider caps also apply; unused allowance is not silently transferred. |
| Local embedding work, if needed | At most 4 batches and 42 input texts including retries; baseline one query plus at most 20 records. Exact length/model/hardware limits must be recorded before enablement. |
| Agent topology | One coordinator-to-specialist delegation; no nested spawning. |
| Model usage | Fixture harness: 6 generations, a future 12-HTTP-attempt ceiling, and 6,000 input / 1,500 output UTF-8 byte upper-bound units per generation. These are not provider tokens. Current scripted model makes zero HTTP calls. Live token/rate accounting remains unimplemented. |
| Model money | Proposed $0.25/run using verified selected-model rates and holds; model not selected. |
| Deadlines/concurrency | Proposed 180-second agent execution; 30-second explicit detail/check-operation timeout. One active agent execution, with at most two admitted native search branches; provider-specific rate controls still apply. |
| UI stream/replay | Saved window of at most 64 events / 4 MiB; explicit snapshot resync after a gap, heartbeat every 10 seconds. Connection loss never creates a new run. |

Initial live session proposal: bounded capability checks plus at most **two** full provider-scoped discovery runs (OpenAlex and separately enabled Semantic Scholar), **40 research upstream attempts**, **12 model generations / 24 model HTTP attempts**, and **$0.50 total model charges/holds**. Per-run caps still apply. OpenAlex's keyword and semantic capabilities need separate evidence; Crossref agency/metadata and DataCite singleton need their own evidence. Authentication/control traffic and provider-internal usage are recorded separately; unknown charges are not assumed free.

Local embedding work needs finite compute/time admission and disclosed input handling. A future hosted embedding option needs its own rates/cost ceiling before enablement; it is not covered by the local-work proposal. Validation made four anonymous public metadata requests, with no subscriptions, purchases, account creation, model downloads or paid model calls. See the [probe receipt](../docs/validation/provider-access.md).

## 9. UX and export

The user selected the [Dub-inspired application design](dub-ux-adoption.md) on October 29. Use Discover + Saved shortlist, with Research notes as a view of existing saved selection reasons. Authored React components/CSS retain the current stack: white/slate surfaces, dark primary actions, a compact source index, a persistent desktop reader and a focused mobile dialog. Overview, Metadata and Your notes separate reading, explicit checks and human decisions. This supersedes the earlier blue palette and initially closed desktop inspector; provider and progressive-results contracts remain unchanged. See [UX intake](ux-research.md) for preserved research context.

Render early entities, per-branch/operation progress and partial errors. Keep scroll/focus stable, deduplicate updates, allow inspection/saving during runs, distinguish pending fit notes/checks from absent source data and provide accessible throttled announcements. Keep raw protocol diagnostics secondary. A native provider's full-page response cannot be shown before it exists; publish valid entities as soon as it is received and processed.

`bibliography.md` renders the explicitly selected citation-record snapshot with missing-field warnings. `manifest.json` retains brief, provider/transport, lexical/semantic queries/ranks, requested/effective filters, fusion/encoder configuration if used, actual counts/truncation, retrieval/cache times, attempts/usage, agency evidence, separate registry records/conflicts, selection revision and relevant versions.

No export claims exhaustive literature search, independent scientific corroboration or full-text review. Export never queries, re-embeds or regenerates a model response.

## 10. Work packages and dependencies

| ID | Work package | Depends on | Reviewable exit evidence |
| --- | --- | --- | --- |
| I1-01 | Settle service/process boundaries, hybrid/filter contracts, event/source identities, storage/framework/transport choices and finite limits; sketch UI early states. | Plan review | Decision record, schemas, fixture matrix and UI acceptance sketch. |
| I1-02 | Prove Deep Agents/local MCP using injected model; separately inspect OpenAlex OAuth/tool schemas and lexical/semantic/filter capability. | I1-01 | Locked compatibility matrix, effective tool allowlist and per-mode readiness report. |
| I1-03 | Implement core state/revisions/event sequence and independent provider journals, operation IDs and attempt grants. | I1-01 | Crash/reopen/idempotency report; no replay or budget reset. |
| I1-04 | Build standalone OpenAlex service, two admitted native branches, filters, provider-scoped identity/fusion and early observation delivery. | I1-02, I1-03 | Keyword/semantic contracts, filter differences, branch-failure and provenance evidence. |
| I1-05 | Connect core router/application MCP, saved snapshot and progressive event stream; prove nonblocking lifecycle/reconnect. | I1-03, I1-04 | First entity before other branch/summary, replay/gap and exact-route report. |
| I1-06 | Integrate bounded coordinator/specialist and structured references without delaying UI publication. | I1-02, I1-05 | Actual graph/delegation trace and retained results after model failure. |
| I1-07 | Complete Next.js early rows, stable hybrid updates, inspector/selection, progress/partial/reconnect and keyboard/mobile flow. | Sketch from I1-01; integration after I1-05/I1-06 | Browser walkthrough showing inspect/save while search continues. |
| I1-08 | Build independent Crossref agency/metadata service and explicit human-check path; no field blending. | I1-03, I1-05 | Agency/metadata receipts and matched/conflicting/missing cases. |
| I1-09 | Build independent DataCite singleton service and exact agency route. | I1-03, I1-05; agency contract from I1-08 | Known DataCite route works with Crossref stopped; unresolved agency remains explicit. |
| I1-10 | Build separately enabled Semantic Scholar service and prove native semantic support or bounded compatible local-encoder alternative. | I1-01, I1-03, I1-05 | Provider-only search/detail, semantic-space/resource proof and honest candidate-pool scope. |
| I1-11 | Add deterministic revision exports at the OpenAlex checkpoint; extend the offline contract/failure/isolation/event/UX matrix as other services arrive. | Initial exports: I1-03, I1-05, I1-07. Complete matrix: applicable I1-04 through I1-10. | Early zero-call reopen/export and immutable snapshots; then a scoped all-enabled-service fixture validation report. |
| I1-12 | Run separately labeled bounded live checks/journeys when configured; record versions/usage/quality limitations and reconcile design. | Applicable provider readiness plus I1-11 | Per-provider completion matrix, actual measurements and unresolved gates/next increment. |

Crossref/DataCite/UX work can develop independently once contracts exist. OpenAlex's first useful checkpoint includes saved selections, reopen and deterministic export; it does not depend on the complementary provider's access. I1-11 begins with those exports and expands later into the full enabled-service matrix. Fixtures permit progress without live grants; they never substitute for provider-specific live proof.

## 11. Acceptance and evidence

| Required case | Observable acceptance |
| --- | --- |
| Primary OpenAlex hybrid | Trace shows native keyword and semantic paths through official MCP; semantic text is embedded by OpenAlex with no redundant local embedding call. |
| Filter consistency | Requested/effective hard filters match stated policy across branches; semantic hits need not satisfy lexical wording unless explicitly required. Unsupported/unknown cases are disclosed, raw retrieval caps hold, and bounded post-filtering does not imply exhaustive retrieval. |
| Changed filter metadata | A newer date/type or other filter-bearing value triggers reevaluation, removes the ineligible version from current fusion and keeps an already saved decision/history visible with a warning. Earlier exports remain immutable. |
| Within-provider fusion | Known provider IDs deduplicate, both branch contributions persist, raw scores are not conflated, and other providers' results/fields never enter the fused list. |
| Progressive usability | Delayed second branch/final model turn does not prevent a valid first row appearing; user can inspect/save it without waiting. |
| Stream/reconnect | Duplicate/out-of-order events do not duplicate/regress rows; valid replay or snapshot gap recovery makes zero external calls. |
| Stable revisions | Late detail/rank/check updates preserve human decision/focus and old exports; the next export records the intended new snapshot. |
| Provider isolation | OpenAlex works with all others stopped; separately enabled Semantic Scholar works with OpenAlex stopped. Core/saved work starts with none available. |
| Branch/provider failure | Retained results remain visibly partial; no search/provider/transport substitution or automatic query expansion. |
| DOI routing | Crossref, DataCite, another agency, unresolved agency, malformed DOI and provider miss are distinct; only matching metadata service is called. |
| Record conflicts | Separate registry observations survive disagreements; shared DOI is not field replacement, version collapse or independent scientific corroboration. |
| Local encoding, where used | Compatible query/document space, version, dimensions/preprocessing, cache invalidation and resource admission proved; reranking is labeled limited to fetched candidates. |
| Agent/capability limits | Exactly one admitted delegation; default/unrelated tools remain unavailable; invalid model references/source instructions cannot broaden authority. |
| Admission/restart | All actual attempts/retries count; duplicate/uncertain operations and service restarts cannot reset grants or create free replay. |
| Cancel/late output | Future work fenced; completed observations/receipts retained; late output cannot overwrite current human state. |
| Saved operations | With all services stopped, reopen/decide/export works without research/model/embedding calls. |
| Sensitive configuration | Credentials absent from prompts, events, source fixtures, logs and exports. |

Use focused contract tests for identity/filter/budget/recovery behavior, injected model/server fixtures for the real graph/MCP path, and a browser walkthrough for progressive usability. Include five reviewed fixture topics/cases; these are not measured provider relevance.

Keep **offline fixtures**, **live provider with deterministic model** and **full live agent journey** as separate readiness levels. A single successful query is not aggregate precision/recall or production accuracy. Record relevance observations and denominators, per-branch contribution/overlap, first usable entity time and event-to-render delay without invented performance targets.

## 12. Review decisions and change record

| Item | Current position | Status |
| --- | --- | --- |
| Provider isolation/routing, progressive UI, OpenAlex importance, hybrid strategy | As specified above | Confirmed user direction |
| Increment 1 registry checks | Separate Crossref/DataCite services, explicit agency route | Approved and implemented; sample live probes passed |
| Semantic Scholar timing | Separately enabled late Increment 1 checkpoint, originally Increment 2 | Framework implemented; live access/encoder pending |
| Local owner/service packaging | Core + independent provider processes, one active agent run | Implemented |
| Python framework/internal transport | FastAPI and loopback HTTP | Adopted and locally validated |
| Persistence | Single-writer atomic JSON/state-event snapshots plus isolated locked journals | Implemented/tested local slice; production database open |
| Browser/application MCP transport | SSE and loopback Streamable HTTP respectively | Implemented; actual local protocol/recovery tests |
| Fusion/secondary-provider encoder | Equal-weight RRF `k=60`; injected compatible bounded local encoder contract | RRF adopted uncalibrated; real encoder unselected |
| Model, UI library and numerical limits | Scripted fixture model; authored React/CSS components; local finite limits above | Local implementation adopted; hosted model/rates/token accounting open |

Version 0.2 supersedes OpenAlex-only scope, a single backend containing every provider adapter, the four-attempt/single-search ceiling and nonprogressive completion assumptions. It preserves human selection, immutable exports, finite admission, partial results and database choice remaining open. The source discovery documents remain unchanged.

Version 0.3 records the user's explicit development approval, implemented local choices, actual validation and unresolved live gates. It does not retroactively label fictional fixtures, synthetic evals or the target illustration as live-provider/LLM quality evidence.
