# Right-hand reader, compact results and visible loading

**November 11, 2026 · implemented UI refinement.** This follows the user's request to replace main Search pop-ups with a right-hand reading panel, reduce the gap before results, introduce a date slider and make incremental loading visible. Three parallel agents covered the reader layout, controls/loading, and YouTube research; the coordinator integrated result rendering and regression coverage. The retained Dub-inspired visual system and Python/Next.js stack continue.

## Reading without losing the result list

Main Search now renders one nonmodal `Source details` aside beside the result column above 900px. There is no backdrop, inert background or desktop focus trap. The search composer, Papers/Videos tabs, local filter and cards remain interactive. Selecting another source replaces the panel contents without opening a raw provider run or changing the saved Search URL. The panel provides Overview, Metadata and Your notes; paper DOI is visible in Overview too.

At 900px and below, the same reader stacks above results in normal document flow. Its content scrolls within the reader, and the page remains available. This is an inline responsive panel rather than a mobile pop-up. Close and Escape restore the invoker where it is still connected; Escape prevents the native search input from clearing the current filter. The older explicit single-provider mobile reader remains a separate dialog. These main-Search changes supersede the focused-dialog decision in the earlier [preview checkpoint](preview-stability-and-video-2026-11-11.md).

The existing stale read/submission fences, per-search filter/draft retention, source identities, human decisions and saved citation versions remain in effect. Opening or closing details does not implicitly repeat a search or cancel already accepted server work.

## Compact browsing controls

Papers and Videos remain the two result tabs. The source/date controls, resource count, local filter and optional chat action use a tighter hierarchy; repeated explanatory paragraphs and a separate filter toolbar no longer precede the cards. The longer search summary is available in a collapsed section. Provider status, warnings, relevance review and provenance remain available with accurate scope.

Video rows place a small thumbnail beside the title, channel, description and actions: 140px in a wide result column, 96px in a narrow column and 88px on small screens. The reader puts the description before the larger optional player and transcript. Saved captions stay distinct from metadata. Images and YouTube links retain validated video identities and safe origins.

The publication date control is a native keyboard-accessible range slider with **1, 2, 3, 5 years and Custom** stops. Its spoken value includes the concrete year bounds. Presets include the current calendar year: two years in 2026 means 2025–2026. Custom exposes independently editable From/To years, initially seeded from the current range if no custom values exist. Existing browser preference storage is retained; custom values survive switching presets, navigation and reload. Controls apply to the next explicit Search, leaving saved result scope unchanged.

## Progressive loading

An animated atom appears next to the research question while a submission is being admitted or the current search is active. Placeholder rows appear below Papers/Videos immediately, including before the conversation ID exists and while saved results first load. A running search retains its real cards with a small additional skeleton beneath them as later batches arrive. Switching resource tabs changes the skeleton shape without making retrieval requests.

The skeleton is decorative (`aria-hidden`); a short status message describes loading. Usable cards stay interactive instead of placing the entire results region behind an accessibility busy state. The placeholders stop on terminal results or a failed saved read, exposing the real empty/error state. Caption loading has its own smaller skeleton and status. Atom/skeleton animation respects reduced-motion preferences.

## YouTube discovery and relevance

The [YouTube retrieval review](youtube-retrieval-and-relevance-2026-11-11.md) documents the implemented REST search, local metadata embedding rerank, optional AI query planning/relevance review and explicit public-caption fetch. It also records official caption permissions, current quota documentation and community MCP options.

This UI iteration adds no external YouTube MCP connection, model calls, bulk caption ingestion or transcript-based search. Querying YouTube by embeddings or spoken-content similarity is not offered by the documented Data API interface. Timestamped passage ranking over acquired captions is a proposed follow-up, with explicit metadata-only fallback and comparative relevance evaluation before changing defaults. Existing saved caption acceptance is reused for read-only UI inspection; it is not a new universal transcript-availability claim.

## Validation

The [combined receipt](../docs/validation/2026-11-11-docked-ui-final.json) records **294 backend tests, 78 browser cases and 11 structural harness cases passed**, with zero failed/skipped cases, plus type checking, production build, Ruff and diff checks. The browser run includes actual local Deep Agents/MCP HTTP/SSE journeys against isolated fixture services. New authored cases cover nonmodal desktop docking, interactive result filtering, Escape preservation, narrow layouts, cohesive video thumbnails, saved captions, date slider keyboard submission/persistence, admission-time atom/skeletons, incremental batches and failed saved reads. Existing tests assert the new panel and slider semantics while preserving their earlier behavioral guarantees.

The backend suite used the existing virtual environment and pinned local encoder. Initial focused runs exposed test-fixture/timing/selector migrations and the native Escape-clearing edge case; the final full browser run passed all 78 cases without retries. Initial agent browser runs also collided in a shared artifact directory; isolated output directories resolved that validation setup issue. Historical failed attempts are retained privately rather than presented as acceptance evidence.

After fixture validation, the configured live app was restored. A [read-only saved-caption inspection](../docs/validation/2026-11-11-docked-ui-live-ui.json) passed at **1440, 1024, 900, 768, 390 and 320px**, with no page/panel horizontal overflow. It confirmed right docking above 900px, inline placement below it, a 140px video-row thumbnail, 92 existing published-caption segments, retained draft/filter and no lingering completion skeleton. API mutations were blocked: zero POST requests or browser errors, unchanged provider usage and unchanged model-cost/holds. No new live search, caption acquisition or model call was made. The model allowance was not changed.

Screenshots: [desktop reader](../docs/validation/2026-11-11-docked-ui-1440.png), [mobile inline reader](../docs/validation/2026-11-11-docked-ui-390.png). The exact configured key/token/contact scan found zero matches in git-visible working files; `.env` remains ignored. This scan does not cover Git history, encoded values or unknown secrets.
