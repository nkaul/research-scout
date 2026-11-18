# Required agentic retrieval and recorded timing

November 14, 2026. The user requested AI query refinement as the standard retrieval workflow, distinct Material keyword colors, and the timing plot from the approved hybrid design.

New interactive topic searches in Search and Exploration always submit `agentic: true`. The optional refinement checkbox and raw-query dispatch path are removed. The model interprets intent, produces provider-specific lexical/semantic queries and keywords, and reviews/reranks retrieved candidates. The existing bounded repair round can improve a weak provider query. Source scope, date bounds, video counts, provider isolation, request limits and paid-call accounting remain enforced.

Readiness is checked before creating a conversation. If model configuration or allowance blocks refinement, the UI displays the actual reason and prevents topic submission. There is no silent raw-query fallback. Exact DOI lookup remains a deterministic metadata action; saved reads, notes, projects, access lookup and explicit answer generation retain their separate behavior. Historical direct searches retain their recorded identity. Low-level explicit direct API calls remain available for diagnostics and fixture validation; they are not an interactive topic-search option.

## Retrieval focus

Actual saved keywords and tags use stable text-based Material color families, reused across collapsed and expanded views. Provider badges retain consistent provider colors. Labels convey meaning alongside color, and tested text contrast is at least 4.5:1. Missing historical keywords are not fabricated.

## How this search progressed

The Timing details panel plots persisted `timing_spans` on a common elapsed-time axis. Rows identify model planning/review, provider retrieval and local ranking, recorded lexical/semantic service branches, query repair, and DOI access/registry work. Expanding a row exposes its saved query, executed arguments or model input when available. Reading the plot makes no model/provider call.

Intervals contain a stable ID, phase/label, status, start, optional completion and measured duration, with provider/round/step/run/branch identifiers where applicable. Model requests and recorded source requests also carry their available timing fields. Provider-service journal replay preserves original intervals and cache provenance. Parent envelopes and child branches may overlap; the UI unions coverage rather than summing nested or concurrent durations. Remaining wall time is explicitly unattributed and can include routing, queueing, local work or uninstrumented stages.

Cancellation closes known local waits without claiming remote billing resolution. Recovery marks unfinished spans interrupted without inventing a completion across downtime. Terminal searches never keep an unfinished span's clock ticking. Full-turn restoration also includes timing data in its cache signature so newer saved timing is not masked by an older restored body.

Older searches show their recorded total duration and a missing-breakdown explanation. Detailed history is not reconstructed from later metadata loads, and the prototype's illustrative timings are not copied into the app.

Sanitized authored-fixture previews: [desktop timeline](../docs/validation/2026-11-14-required-rag-timeline-fixture-1440.png) and [mobile timeline](../docs/validation/2026-11-14-required-rag-timeline-fixture-390.png). These show six recorded test intervals, not a live provider/model run.

## Runtime and validation

The existing shared model allowance currently reports spent or held requests. This change neither resets the ledger nor raises its limit. Required AI retrieval will remain visibly blocked until that operational allowance is available.

Validation uses scripted model responses, authored UI fixtures and isolated actual fixture services/MCP/SSE. Fixture records are not live research-quality evidence. The [final receipt](../docs/validation/2026-11-14-required-rag-final.json) records **178/178 browser cases in one complete final run**, eight actual fixture integrations, 345 unique backend passes (one optional skip), 11/11 harness cases, Ruff, TypeScript, production build, source comparison and privacy checks. Seven socket-dependent backend cases passed on the targeted localhost-enabled rerun after the sandbox prevented binding.

The [restarted live UI review](../docs/validation/2026-11-14-required-rag-live.json) confirms eleven healthy services, 58 saved paper cards, 10 video cards, seven responsive widths, no optional AI checkbox, the actual allowance block and zero API writes. All 712 existing live JSON/config files, including projects, credentials and the ledger, remain byte-identical. No live provider/model call or model allowance increase is claimed.
