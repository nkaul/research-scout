# Refined + Workbench — updated mockup

November 13, 2026. The user prefers Refined as the base, with Workbench's retrieval focus and query transparency, a performance/progress bar below settings, and more Material color accents. These files preserve the standalone proposal. On November 14 the user approved applying this hybrid to the app; see [the adoption record](../../../system-design/refined-workbench-adoption-2026-11-14.md) for implemented behavior and validation.

[Review the four states](hybrid-review.html) · [Open the full-width mockup](hybrid-refined-v2.html) · [Original three directions](index.html)

| State | Review question | Open |
| --- | --- | --- |
| Papers | Does the familiar layout feel clearer and more engaging? | [Mockup](hybrid-refined-v2.html?view=papers) · [Screenshot](previews/hybrid-papers.png) |
| Query transparency | Can the user distinguish their question, the LLM input and the provider queries? | [Mockup](hybrid-refined-v2.html?view=trace) · [Screenshot](previews/hybrid-query-trace.png) |
| Retrieving | Are early results useful while the remaining providers continue? | [Mockup](hybrid-refined-v2.html?view=loading) · [Screenshot](previews/hybrid-loading.png) |
| Videos | Do media results follow the same concise structure without implying automatic playback/captions? | [Mockup](hybrid-refined-v2.html?view=videos) · [Screenshot](previews/hybrid-videos.png) |

## Layout and visual choices

The original editable search stays at the top. A compact retrieval-focus row adds topic chips and an inline Query trace disclosure. Source scope, date slider/custom years, visible video count and project context remain together. A single performance bar sits below these settings rather than scattering durations around individual headings.

The selected result and primary actions retain Refined's Material blue. Teal/indigo topic chips, blue OpenAlex chips, purple Crossref chips, warm arXiv chips and red YouTube chips bring color to useful labels. Open-access status uses green; pending/stopped states use amber. Text labels and icons carry meaning alongside color. Large backgrounds remain calm, so the evidence titles and source text keep their hierarchy.

Common labels remain readable; paper titles are 16px, abstract/reader text 14px, and icon action targets generally at least 32px. The old duplicate completion/timing row is removed, and sort joins the local filter row. Query/timing details expand only when requested. This balances the added transparency with the user's earlier concern about losing space above results.

## Original question, LLM input and provider requests

The trace separates four things:

1. The original question, captured verbatim when Search is pressed.
2. The planning input and policy/request preview supplied to an LLM.
3. The resulting focused retrieval query and extracted keywords/tags.
4. Separate lexical/semantic queries and fixed filters for each selected provider.

Editing the question or settings prepares a draft; it does not silently rewrite the previous trace. AI refinement can be disabled for a direct search. Custom questions are captured honestly; this static prototype does not pretend to generate a new plan for arbitrary text.

The trace is illustrative. Its request envelope excerpts the policy and omits the expanded schema. On a future application adoption, bind it to the existing `retrieval.llm_requests[].body`, execution status and `source_requests[].executed_arguments` rather than reconstructing or paraphrasing what was sent. Planned queries and executed requests must stay distinguishable. [Query component notes](hybrid-query-notes.md) map the proposal to the current backend fields.

Unpaywall stays a separate DOI access step, not a topic-search provider. OpenAlex's provider-native semantic search remains distinct from local candidate reranking for the REST adapters. Provider observations remain separate even when exact DOI/citation matches share a display card.

## Performance and progress

The bar separates first-evidence latency, original retrieval duration, opening a saved view, and selected-source reading time. It uses milliseconds/seconds with quiet, stable labels. Timing details show overlapping provider spans; parallel durations are not added into a misleading sum.

Search runs a short local simulation. Provider responses arrive progressively: available records remain interactive, while skeletons show work still pending. Relevance review and DOI access have their own states. Stop keeps the available evidence and marks the remainder partial; it does not retry. [Performance notes](hybrid-performance-notes.md) describe the state model and its relationship to the current timing components.

All timings, progress states, papers, video descriptions, captions and access badges are **sample data**. They are not live measurements or a quality evaluation.

## Functions retained in the proposed layout

| Existing function | Mockup affordance |
| --- | --- |
| Basic Search and explicit Exploration | The original question and Search remain primary; Exploration stays a separate action. |
| Sources and fixed scope | Seven discovery choices, at most four selected; default OpenAlex/Crossref/arXiv/YouTube. |
| Adaptive years/custom years and video count | Visible controls; changes prepare the next search. YouTube count is disabled when YouTube is removed. |
| Papers/Videos and filtering/sorting | Separate tabs and local result controls remain mounted while inspecting a source. |
| Seamless reader and notes | Pointer/keyboard intent, a concise right-hand reader and note-editing protection. Narrow screens use an explicit inline reader. |
| Abstracts and provenance | Expand available text, switch to the original abstract, and inspect separate provider observations. |
| Paper source/PDF actions | One aligned row for details, project save, source, PDF preview, new-tab PDF and download. PDF actions are illustrative placeholders. |
| Video content | Thumbnail/description and explicit playback/transcript controls; sample captions are distinct from descriptions. |
| Projects | Project selection, an independent-research option and local project creation/save feedback. No real project is created. |
| Loading, partial outcomes and timing | Atom activity, incremental skeletons, source progress, separate access status and a compact timing bar. |

Other existing application operations, persistence, history, shortlist/DOI authority checks and request budgets remain in the working app. This mockup does not implement or remove them. Adoption would require wiring the refined components to those existing behaviors and their validation contracts; a visual selection does not authorize changing them.

## Preview and validation

The prototype is self-contained and makes no provider/model requests. It uses the existing local browser toolchain; no dependency or framework change is introduced. The four gallery states use the same layout, not four competing redesigns. A Preview selector also exposes a stopped/partial state.

[Integrated browser checks](hybrid-preview-checks.json) record rendering, local interactions and responsive checks. These establish prototype behavior, not a participant-based usability study or full accessibility certification. [Mobile preview](previews/hybrid-mobile.png) and [timing-detail preview](previews/hybrid-timings.png) supplement the four main screenshots.

The final integrated run passes 13 interaction groups at seven widths from 320 to 1440px, with zero JavaScript errors or provider/model calls. The four-state gallery and 38 linked resources pass. Eight representative visible Material chip/primary-action color pairs exceed 4.5:1 contrast (minimum 4.78:1). Loading review also confirms that the reader and cards agree on pending DOI access and that query planning is not shown as ongoing after retrieval begins.

The independently authored parts live under `parts/`. To rebuild the standalone file after editing a part, run from the repository root:

```sh
.tools/node/bin/node discovery/ux/2026-11-13-ui-polish/parts/assemble-preview.mjs
```

The existing read-only preview server serves this directory on port 3133. The current Research Scout UI and backend are unchanged by this iteration.
