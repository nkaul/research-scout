# Refined + Workbench frontend adoption

November 14, 2026. The user approved applying the [Refined + Workbench hybrid](../discovery/ux/2026-11-13-ui-polish/hybrid-design-notes.md) to the working frontend. This supersedes the earlier preview-only status for this specific hybrid; the older Material blue/preview-v2 trial remains rejected. The existing Next.js/React/TypeScript stack and Python service boundaries are retained.

## Implemented layout

The existing research question and Search action remain primary. The header now groups a compact retrieval-focus row, an inline query trace, visible source/date/video controls, project context and a performance bar below the settings. Main results retain Papers/Videos tabs, local filtering, abstract/description controls, coverage details and a persistent desktop reader. The mobile reader remains inline and explicit.

The shared Material palette uses blue for primary actions/selection, tonal topic chips and named provider chips, green for available access and amber for incomplete work. Labels and icons carry meaning alongside color. The existing paper/video components retain their actions and source identities; CSS changes do not replace returned records with the prototype dataset.

Source-selection chips/removal controls, request-allowance information and explanatory notes move inside the Sources disclosure in the compact header. Seven discovery choices and the four-source ceiling remain. The adaptive slider, custom years, explicit Apply range & search action and remembered video count are unchanged in behavior. The slider's accessible value and range tooltip retain the exact years even when the visible caption is compact. Outside-click/Escape closes Sources; pressing Search also closes its disclosure without changing scope.

Project selection, concepts, query saving, durable resource saves, the legacy shortlist, notes, provider observations, DOI eligibility and history retain their existing APIs and authority checks. Thumbnail playback, transcript loading, PDF preview/new-tab/download and provider details remain explicit actions. Passive reader updates still use saved reads, preserve keyboard focus, pause during note editing and respect version/pin fences.

## Query transparency uses saved evidence

[RetrievalFocus](../frontend/src/components/retrieval-focus.tsx) renders the current saved turn's original question, interpreted intent, keywords/tags and focused queries. Draft edits do not change those saved records. The three trace tabs separate:

- Original question and planned retrieval context.
- Exact recorded `llm_requests[].body`, model, purpose and execution status.
- Planned provider query pairs versus actual `source_requests[].executed_arguments`, transport, cache status and recorded semantic execution mode.

Unknown fields are retained in JSON rendering; source/model text is escaped React content. A prepared request is not described as a received response. Direct search and missing audit data have distinct empty states. Compacted histories require an explicit saved GET through the existing revision-aware restore path; null placeholders are not presented as complete prompt bodies. Opening a trace does not make a model/provider call.

The existing full relevance review, warnings, exclusions, assumptions and query history remain available in a secondary disclosure. This avoids dropping evidence while making the common query trace easier to scan. Exploration chat retains its existing refinement component and behavior.

Full saved-turn restoration is fenced by the starting conversation revision and turn signature as well as navigation intent. If newer streamed state arrives during the GET, the older body and its errors are discarded. A delayed restore therefore cannot change a completed search back to running or replace the newer query trace. The regression was reproduced against the earlier build before validating the fix.

## Performance values are measured or recorded

[SearchPerformance](../frontend/src/components/search-performance.tsx) and its [pure helpers](../frontend/src/lib/search-performance.ts) separate four clocks:

| Metric | Evidence |
| --- | --- |
| First evidence | Measured from an admitted Search in this browser until its first available result. No historical latency is inferred when opening saved research. |
| Retrieval | Valid saved start/completion timestamps, or the current wall clock while that turn is running. |
| Saved view | Existing guarded browser load ticket for reading the saved conversation. |
| Reader | Existing guarded load ticket for the current selected metadata record, including an admitted pending selection. |

Missing metrics display unavailable values rather than invented milliseconds. First-evidence measurements are scoped to the exact conversation/turn, cached within the current workspace session and not restarted when revisiting the same saved result. Reader clocks retain the existing selection/ticket guards. Completed clocks stay quiet.

Provider completion comes from recorded activity/branch outcomes, not from seeing one result or the overall turn status. DOI access remains distinct from discovery. Stop invokes the existing turn-specific cancellation endpoint, retains available evidence and does not retry. Reconnecting reads saved state; it does not start a new search.

The prototype's illustrative waterfall is not copied into production: this backend does not record per-provider start/end timing spans. Timing details instead explain the recorded/observed metrics and show actual provider activity, counts and attempts. Parallel provider durations are not added into a fabricated total.

## Component integration and state boundaries

[ResearchWorkspace](../frontend/src/components/research-workspace.tsx) keeps the original submission, preferences, project and source-reader ownership. [SearchResults](../frontend/src/components/search-results.tsx) keeps its existing saved GET, SSE, revision, cancellation and turn-restore ownership. React portals place the two new presentation components into stable header slots; they do not create a second conversation fetch or another research orchestration path.

The Material styling is scoped to the hybrid workspace and existing CSS modules. No UI framework/dependency change, backend schema change, provider grant change or model-budget increase is part of this adoption. Root `.env`, `.scout` state, OAuth caches and ledgers remain in their existing locations.

## Validation

**Final result:** [163 unique browser cases pass across the recorded runs](../docs/validation/2026-11-14-refined-workbench-final.json), including 15 new cases and seven actual fixture-service/MCP/SSE cases. The final affected run passes 45/45 with no skips. TypeScript, the final isolated production build, exact comparison of all 51 frontend source files against that build, document links, privacy and diff checks pass. The stale-restore regression fails on the earlier build and passes with the revision/signature guard.

The [read-only live check](../docs/validation/2026-11-14-refined-workbench-live.json) retains 58 paper cards and 10 video cards, projects, provider usage and model cost/holds, with zero API writes. All eleven live services remain healthy. Seven widths from 320 to 1440 pixels show no horizontal overflow. No new live provider/model request or backend test run was needed for this frontend change.

The [validation index](../docs/validation/increment-1.md) and dated adoption receipt record final checks. Browser acceptance uses an isolated production frontend and fixture core/providers on separate ports, so its searches cannot mutate live research. The actual live app is inspected separately with API writes blocked and existing saved paper/video views. Synthetic fixture/model records remain labeled; they are not live retrieval-quality evidence.

Initial isolated development-server navigation failures occurred before page rendering; a source-copy/production-build test environment resolved them. The production build and TypeScript checks run against the final frontend source. New browser cases cover exact audit bodies, plan/execution separation, compacted restores, draft preservation, missing timings, slow/stale reader responses, source completion, Stop, Material contrast and responsive action alignment. Historical layout assertions are updated only where controls intentionally moved; provider, persistence and no-extra-call assertions remain.
