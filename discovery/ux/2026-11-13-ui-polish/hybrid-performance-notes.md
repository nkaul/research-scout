# Hybrid preview — performance and progressive retrieval

The appended `parts/hybrid-performance.js` mounts a compact status/timing bar directly below the search settings. It retains the Refined layout and uses the existing atom indicator. This is a standalone design prototype; every duration, provider state and source record is illustrative. No provider/model/network operation is performed.

The initial bar separates first evidence, original retrieval, opening a saved view and selected-source reading. The detail disclosure shows overlapping provider spans, relevance review and DOI access. Parallel spans are explicitly **not** added into an artificial total. The design follows the distinction implemented by `frontend/src/components/load-time.tsx` and `frontend/src/lib/load-timing.ts`, with quiet millisecond/second units.

Pressing Search preserves the user's original question and commits the current query/source/date/AI draft into the trace. A short local sequence then shows planning, providers returning independently, relevance review, DOI access and completion. Available paper/video cards appear while remaining rows retain skeletons. Switching tabs, filtering and sorting keep that partial state. Access remains pending until its separate stage. The Stop action clears admitted demo timers, keeps available records and shows a partial state; it does not automatically retry.

Source/date/video-count edits remain next-search drafts. Deselected sources are not silently queried by the simulation. The small authored dataset has one representative paper for OpenAlex, arXiv and Crossref, plus three YouTube videos. Other source choices can validly return zero sample records. This is not a demonstration of provider relevance, throughput, quotas or actual request timing.

Root integration API:

- `window.hybridPerformance.start()` animates the local sequence.
- `stop()` keeps available evidence and marks the remainder stopped.
- `reset()` restores the complete initial sample state.
- `showDemoState('loading'|'complete'|'partial')` sets a deterministic frozen review state.
- `openDetails()` opens the timeline.
- `getSnapshot()` returns local progress metadata for verification.

The part intercepts the base mockup's submit handler in capture, wraps its result renderer and selected-source function, and leaves the base Papers/Videos, metadata, abstracts, notes, projects and explicit media/PDF controls available. Timing completions use tickets so a late earlier selection cannot overwrite the latest reader clock. Narrow layouts wrap the metrics into two columns; reduced motion disables shimmer/track transitions. The parent agent validates the integrated HTML and captures final screenshots.

An integrated Chromium spot check passed the initial timing bar, simultaneous early cards and remaining skeletons, Stop retaining available cards, applied custom years after closing their editor, direct-search labels without an implied LLM stage, 390px width without horizontal overflow and zero JavaScript errors. The Search simulation, sources, timings and captions remain clearly separate from live-provider validation.
