# Progressive results and UI delivery

**Current automatic discovery:** [Multi-source discovery, canonical DOI papers and automatic Unpaywall](automatic-federated-discovery-2026-11-09.md) is the latest user-directed default. Source selection is optional advanced behavior; a recorded eligible route searches multiple isolated services, groups matching DOIs into one paper and resolves access links through Unpaywall automatically. Earlier manual-selection/two-source defaults are superseded.

**Current provider relevance correction:** [Provider-specific queries and independent quality review](provider-relevance-v2-2026-11-09.md) replaces the shared-query/pooled stopping rule: Crossref uses bibliographic search, every selected provider gets its own query plan and repair decision, and primary results exclude adjacent/uncertain records. Search-workspace AI submissions use the same reviewed conversation path. The exact-question live retest passed: two Crossref pages, three model calls, five primary matches with abstracts, explicit intent/keywords/tags and saved LLM/provider request traces. 234 Python, 39 browser and 11 harness checks passed. Earlier checkpoints below retain their dated behavior.

**Latest November 9 query-relevance checkpoint:** [Agentic retrieval and ranking](agentic-retrieval-2026-11-09.md) adds optional structured LLM query planning, provider-batch relevance review and at most one query revision through LangGraph, retaining Deep Agents/application MCP and isolated providers. Chat direct-search fusion ordering is corrected. AI-reviewed results have explicit intent, query history, relevance reasons and shared paid-call accounting; prior deterministic-only statements below are historical where superseded. Live exact-query acceptance passed: 39 reviewed observations, 16 withheld, first reviewed batch at 14.8 seconds; 225 Python, 32 browser and 11 structural harness cases pass.

**October 26, 2026 · approved progressive display; local delivery implemented and validated**

**Latest November 9 source expansion:** [Live progressive abstract acceptance](provider-expansion-2026-11-09.md#implemented-behavior-and-measured-acceptance) proves arXiv, Europe PMC and Crossref abstracts arriving before terminal status, and OpenAIRE records/descriptions separately. Whole provider pages are normalized into persisted entity updates; no synthetic token animation is used. Complete saved abstracts can be read while other work continues; only new detail calls wait for their originating child run, rather than the whole conversation.

**November 9 answer-stream extension:** source/entity publication remains progressive. The new explicit [saved-evidence answer action](streaming-generation-2026-11-09.md) separately consumes real OpenAI text deltas, persists bounded prefixes and sends them through conversation SSE snapshots. The UI renders those prefixes while the answer is running; one live demonstration proved seven visible partial prefixes before completion. No synthetic typing animation or new scholarly retrieval is involved. Reload/reconnect uses saved snapshots only.

The user requires results to appear progressively as agents and providers produce usable entities. The UI must not wait for the whole research run, a final agent summary or unrelated operations to finish. This document specifies that behavior for Increment 1. It follows the separate provider processes and explicit routes in [provider isolation and routing](provider-routing.md); the [application architecture](architecture.md) and [Increment 1 plan](increment-1.md) own the wider service and execution design.

The local slice now uses FastAPI, atomic single-writer JSON aggregates and SSE `state` events containing committed public snapshots, with opaque `stream-id:sequence` cursors, replay and `resync.required` gap recovery. The event window is 64 events / 4 MiB. The detailed event taxonomy below remains a conceptual target; the current wire protocol uses saved state snapshots. See [implementation status](implementation-status.md) and [validation](../docs/validation/increment-1.md). No production database or deployment platform is selected.

## 1. Visible behavior

After the user starts a provider-scoped search, the workspace shows its current operation status. Each validated source entity appears as soon as the application core has saved it. A row can be inspected and saved while discovery or the agent's final response is still running. Later arrivals add rows or update their own observations without replacing the visible list or undoing human selections.

The provider may return only a complete response or page. In that case, no source entity exists for display until that response is available and validated. Once the page arrives, process and publish valid entities without an application-level barrier waiting for the agent summary or every remaining entity. A transport that actually supports incremental entities can feed the same contract after a separate capability proof. Do not animate invented papers or present tokens, estimated stages or unvalidated response fragments as source results.

Provider isolation still applies. OpenAlex is the primary/default discovery resource; a separately enabled Semantic Scholar run is a complementary choice. Each search runs against its selected service only. The user-required [hybrid plan](hybrid-retrieval.md) admits bounded lexical and semantic branches within that provider; either branch can publish eligible entities while the other is still running. Same-provider union/rank updates retain branch provenance and stable row identities. This does not authorize cross-provider fan-out, fallback, blended provider ranking or an unplanned query. Explicit detail and DOI metadata-check operations have their own progress. A justified agency-lookup route remains visibly distinct from the eventual Crossref or DataCite metadata observation.

## 2. Commit before publication

```mermaid
sequenceDiagram
    participant P as Selected provider service
    participant C as Application core / single state writer
    participant S as Application-owned saved state
    participant U as Next.js workspace
    participant A as Discovery agent
    P->>C: Attributable provider response or verified entity update
    C->>C: Validate scope, operation, identity and observation
    C->>S: Commit observation, view version and event sequence
    S-->>C: Commit published
    C-->>U: Entity event; render or update its row
    C-->>A: Bounded source references / tool result
    Note over U,A: Row is usable before a later model summary
    A->>C: Later structured annotation or completion
    C->>S: Validate references and commit separate annotation/status
    C-->>U: Annotation or status event
```

The application core owns the browser-facing event stream. Provider processes keep ownership of their own clients, upstream receipts and caches; they do not write application selections or append directly to its event log. The core may receive a whole provider response, then publish its entities one at a time. The diagram does not imply that the upstream MCP/API streams records or that an additional model call is needed for publication.

For each admitted observation, the core:

1. Checks the operation ID, originating provider, run scope, cancellation fence, schema and source identity. A model-supplied reference must point to a saved observation; model text alone cannot create a purported provider record.
2. Saves the immutable provider observation and the updated application view, preserving original fields, missingness, truncation, retrieval time and provenance.
3. Assigns the next application event sequence and commits the matching event information with that state revision.
4. Publishes the committed event to connected clients and makes the same state available through ordinary saved reads. Agent processing and final summarization do not hold up this publication.

A publisher failure cannot undo saved results. A failed or cancelled model response cannot erase provider entities already committed. The stream is a delivery mechanism; saved state is the authority.

## 3. State and event contract

The proposed stream is scoped to one research run, including its explicitly requested review operations. The application writer assigns a monotonically increasing sequence within a stable stream identity. The opaque cursor binds the stream identity, run and sequence; it is never an upstream provider cursor. Restoring a different state generation changes the stream identity rather than reusing old event IDs.

| Field | Purpose |
| --- | --- |
| `event_id`, `event_schema_version` | Unique application event identity and payload interpretation. |
| `run_id`, `stream_id`, `sequence`, `state_revision` | Ordering, replay scope and the committed application state. |
| `operation_id`, `operation_kind`, `provider` | Distinguish search, detail, agency lookup, registry lookup and annotation work. |
| `entity_key`, `entity_version`, `observation_ref` | Idempotent row updates linked to an immutable provider observation. |
| `selection_revision` where relevant | Human selection/citation state, independent of source arrival order. |
| `committed_at`, `content_origin` | Observation delivery timing and source-authored versus generated content. |
| Bounded typed payload or saved-state reference | Enough information to update the UI without entire raw responses or credentials. |

An observation identity includes `(provider, provider_record_id, observation_version)`. A discovery-row key also binds its run/result membership. The same DOI from different providers is not a shared row key. Exact-DOI links and registry checks attach separate observations under the routing policy; they do not blend records or scores.

Proposed event types are `entity.upserted`, `operation.updated`, `annotation.updated`, `selection.updated` and `run.updated`. A `resync.required` control message requests a saved snapshot when replay is unavailable. Heartbeats indicate connection liveness and do not claim research progress or advance the saved-state cursor.

Delivery is replayable and may repeat events; it is not an exactly-once network guarantee. The UI ignores already applied event IDs, applies only newer entity versions and keeps selection state separate. Duplicate operation results are reconciled by operation/observation identity before publication, so they do not append duplicate rows or silently create another upstream attempt.

## 4. Snapshot, connection and replay

**Proposed transport:** Server-Sent Events (SSE) from the application core to Next.js. It suits one-way entity/status delivery while save, detail, cancel and export remain ordinary application requests. SSE is a candidate to prove with the selected framework and local launch/proxy setup; it is not an adopted library or an assertion about provider streaming. Bounded snapshot polling can be a documented delivery alternative if the selected environment cannot support SSE, with the same state/version contracts and no provider rerun.

Illustrative interfaces:

| Interface | Contract |
| --- | --- |
| `GET /api/research-runs/{id}/snapshot` | Return saved entities, observations, annotations, selection state, operation/run states, committed revision and a replay cursor from one consistent view. No external calls. |
| `GET /api/research-runs/{id}/events` | Subscribe after a supplied opaque cursor; reconnect can use SSE `Last-Event-ID`. Replay committed events after that point, then continue with live events. |

Read a snapshot at cursor **S**, apply it, then subscribe to events strictly after **S**. Events committed between those requests are replayed, closing the snapshot/subscribe race. The replay-to-live handover must also use the committed sequence so an event arriving during replay is not lost. Scope and authorization are checked by the core, rather than trusted from a cursor or model argument. Provider/model credentials are absent from the stream and URL; the local application access mechanism remains part of the wider architecture proof. SSE IDs and reconnection do not supply an application event journal or durable replay; the core must implement those contracts.

On a reconnect, resume after the last applied event. If the cursor is expired, from another stream generation, or outside the retained range, signal resynchronization and read a new saved snapshot. If the client detects a sequence gap, pause incremental application and use the same snapshot/replay recovery. Do not silently skip missing updates. A fresh snapshot preserves committed selections and operation states and performs no research-provider, agency-resolution or model work.

An interrupted connection is a delivery problem, not evidence that the research operation failed. Keep existing rows usable, show reconnecting status and recover saved changes. Browser reload, disconnect or replay never creates another research run or repeats its upstream operations.

## 5. Operation states and partial outcomes

Run state, provider operation state, entity completeness and generated annotation state are independent. A run can still be `RUNNING` while its search operation has returned candidates and its final model annotation remains pending. A completed search does not wait for later human-requested details or registry checks. A failed registry check does not change a successful discovery record into a failed paper.

For each operation, record its provider, capability, start/finish observations, attempts, remaining allowance and outcome. Suggested outcomes include queued, running, succeeded, empty, partial, unavailable, failed, cancelled and interrupted; retain uncertainty about an outstanding remote request separately. Progress comes from these observed transitions and committed entity counts, not an invented completion percentage.

| Situation | UI and saved-state behavior |
| --- | --- |
| Some valid entities and some malformed/unavailable results | Publish accepted entities, show attributable errors and a partial outcome. Do not fabricate replacements. |
| Provider succeeds but a later model turn fails | Keep source rows and human actions available; show failed/pending annotation separately and retain a partial run outcome. |
| Other provider service is unavailable | Do not wait for it unless this explicit operation depends on it. Never initiate another-provider discovery. |
| Browser disconnects | Continue admitted backend work under existing limits; reconnect from saved state without repeating it. |
| User cancels | Commit the operation/run fence and publish its state. Retain earlier accepted rows; stop future dispatch and reject later responses from changing the active result set. |
| Response arrives after cancellation/deadline | Keep attributable attempt/usage evidence, including uncertainty as needed. Do not insert late candidates, replace current data or restart the operation. |
| App restarts | Read saved rows and selections, mark interrupted operations appropriately and resume delivery from saved state. No automatic research execution or paid replay. |

Cancellation does not promise to revoke an already dispatched upstream request or its charge. A future explicit review action has its own operation scope, timeout and remaining allowance; it is not a continuation of a cancelled discovery execution. Late callback validation uses operation identity and execution generation, not just a matching run ID.

## 6. UI behavior and revisions

Use stable provider-scoped row keys and preserve keyboard focus, scroll position, expanded details and human saved state when entities arrive. Keep insertion order stable by default; show provider rank as recorded data. Do not automatically reorder existing rows when a later annotation or provider rank arrives. An explicit user sort can reorder rows while preserving focused identity and selection.

Replace a whole-page loading overlay with an operation-status area, initial empty/skeleton state and progressively populated rows. Once a row exists, its inspect/save actions are available subject to ordinary scope and selection rules. A cache read or saved selection must not wait behind a long provider request or model response. Detail and registry actions show their own loading/error states; source rows remain readable during those operations.

Source-authored title/abstract/metadata and generated fit notes have distinct fields, labels, versions and events. Show generated annotation as pending, ready or failed without masking available source content. A final agent message cannot overwrite original metadata, remove an accepted row, silently reorder the list or clear a human selection.

Registry results appear as separate attributable observations and check statuses, including disagreements and unresolved agency. They do not silently fill missing discovery fields. Following [provider routing](provider-routing.md), an explicit citation-source choice can select a whole registry record/version. Human selection writes use expected revisions so concurrent row arrivals or detail updates cannot overwrite the user's action.

If a newer adopted source observation changes a filter-bearing field, publish the [versioned eligibility change](hybrid-retrieval.md) separately from the human selection. An out-of-scope or unresolved work leaves current eligible fusion/counts, but its saved selection, source history and reason remain visible with a warning. Mark the affected row in place or retain a visible saved-source reference so focus and the user's decision are not silently lost; do not keep an ineligible work labeled as matching. Older exports retain the original source/filter snapshot, and separate registry observations never silently replace discovery fields.

When selected source-record versions or the chosen citation source change, the next export uses a new immutable selection/source revision. Earlier exports keep their snapshots. Newly arriving unselected candidates and transient progress events do not rewrite existing exports. Export during discovery is allowed from the currently saved selection, with the run's in-progress/partial coverage and exact source revision recorded; it does not wait for a summary or trigger additional research.

## 7. Bounded local persistence and delivery

The proposed JSON mechanism must commit application state and its event sequence together. A feasible first-slice layout is one versioned run aggregate containing current view references, operation/selection state, stream sequence and a bounded retained event window, published by the single application writer with atomic replacement. If immutable observation files are separate, publish them first and commit their references with the run aggregate; an unreferenced file after a crash must not become a visible result by itself. The implementation must prove its actual filesystem durability and crash behavior.

This is a small local publication contract, not distributed transactions across provider services. Provider journals and application commits can disagree after interruption; reconcile by the same operation IDs and recorded status. If an outcome cannot be established, retain uncertainty and do not repeat the remote request automatically. If the local-file option cannot provide the required publication/recovery behavior, resolve the persistence decision explicitly rather than claiming database guarantees.

Bound retained events by configurable count/bytes/age, connected-client buffers by count/bytes, and per-message payload size. Select limits during implementation; none is measured yet. Compact only behind a consistent saved snapshot and retain the replay range/cursor needed to detect gaps. A slow subscriber is disconnected and resynchronizes from that snapshot instead of blocking the application writer or growing memory without limit. Backpressure and reconnect do not authorize extra upstream calls. Provider queues, retry budgets and candidate limits remain those of their own services and operations.

Publication occurs after commit and outside the writer's state lock. An ordered application dispatcher drains committed events by sequence; independent operation callbacks do not publish directly out of order. Small bounded delivery batches may reduce overhead, but cannot introduce a barrier waiting for agent completion or all remaining entities. The local service framework must permit event delivery, saved reads and short selection writes while the admitted provider/model operation is waiting on I/O.

## 8. Acceptance evidence

| Case | Required observable result |
| --- | --- |
| Staggered entities and delayed final summary | A fixture produces one valid entity, then delays later entities and the model summary. The first row renders and can be inspected/saved during that delay; its selection survives later arrivals. |
| Whole-page upstream response | No fabricated entities appear before the valid response. Once it arrives, a delayed later item/annotation does not hold already committed entities out of the UI. The report states the actual upstream delivery granularity. |
| Provider isolation | An OpenAlex-scoped run publishes only OpenAlex discovery observations with other provider services stopped. A separately enabled Semantic Scholar run has its own result set. Explicit agency/registry operations retain their own routing provenance. |
| Duplicate delivery and concurrent human action | Duplicate/replayed events or operation responses create one row per membership identity. Saving during updates preserves the decision; stale selection revisions are rejected or reconciled visibly. |
| Reconnect and replay gap | Disconnect before/after an event, reconnect with the prior cursor, then test an expired/gapped cursor. Replay or snapshot recovery restores rows, selection and states without provider/model calls. |
| Crash around publication | Interrupt before commit and after commit but before browser publication. Restart exposes only committed state, recovers matching event/version information and marks uncertain work without rerunning research. |
| Metadata and export revisions | Save/export a discovery record, then receive detail and conflicting registry observations. Keep fields separately attributed; an explicit source/version change creates a new export revision while the earlier export stays unchanged. |
| Partial failure and content origin | Valid provider entities remain visible after malformed sibling results, annotation failure or model limit exhaustion. Generated notes are labeled separately and cannot replace source fields or invent source entities. |
| Cancellation and late callback | Cancel after an entity is committed. Retain that row and publish cancelled status; a delayed old-generation response cannot insert another candidate or change current human decisions. |
| Bounded slow-client behavior | Under a stalled subscriber and retained-window exhaustion, buffers remain bounded, a fresh snapshot restores state, and provider execution, other saved reads and selection writes are not held by the stream. |

Use deterministic fixtures to control arrival, failure and crash points, then verify the browser behavior over the actual selected app transport. Record fixture results separately from live provider observations. A live API that returns one page is not evidence of upstream per-entity streaming.

## 9. Proposed measurements and remaining decisions

Measure **time to first usable entity**, from the accepted start action to the first inspectable/saveable row, with separate provider-response, application-validation/commit, delivery and render intervals. Also measure **committed event to rendered row**, retained-event replay/snapshot recovery time, selection-write responsiveness during discovery, queue/buffer usage and duplicate/gap recovery outcomes. Report actual entity counts, page granularity, cached versus live path, fixture/live mode and whether a final summary was still pending.

Client/server clocks are not assumed synchronized. Use monotonic intervals within each process and correlated operation/event IDs; document the measurement method for intervals spanning server and browser. Set target numbers only after a baseline and a representative environment exist. These are proposed metrics, not current performance results or invented latency guarantees.

Before implementation, settle the app event transport and connection lifecycle, cursor/schema format, local publication mechanism, replay/buffer limits, local access binding and measured UI update policy. The confirmed requirement already stands: expose each saved, validated entity when available, preserve useful work through partial outcomes, and keep human review usable throughout execution.
