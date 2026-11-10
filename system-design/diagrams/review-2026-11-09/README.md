# Implemented architecture and review diagrams

**November 9, 2026 · current repository review · native SVG/PNG exports**

Open [index.html](index.html) to switch diagrams, fit the view or scroll at full size, and download SVG/PNG files. The viewer is standalone and loads no network libraries or fonts. The [full architecture review](../../implementation-review-2026-11-09.md) includes precise Mermaid source and the connection/status matrix.

| Figure | Purpose | Files |
| --- | --- | --- |
| Implemented architecture | Actual process boundaries and tool ownership. Local fixture operation is green; upstream adapter code has explicit pending or dated evidence. The UI was not reachable at review time. | [SVG](implemented-architecture.svg), [PNG](implemented-architecture.png) |
| Agent workflow | Fixed run scope → coordinator → specialist → actual application MCP → one provider → core validation/progressive storage → compact context/validated scripted result → human review. | [SVG](agent-workflow.svg), [PNG](agent-workflow.png) |
| Review checkpoint | Separate the fixture-proven foundation, limited live evidence and proposed next steps toward a single live OpenAlex/real-model slice. | [SVG](review-checkpoint.svg), [PNG](review-checkpoint.png) |

All three exports are **1920 × 1280 pixels** in PNG form; SVG remains scalable. [build-diagrams.mjs](build-diagrams.mjs) contains exact drawing/text source. The composition follows the project's [Illustrated Explainers skill](../../../.agents/skills/illustrated-explainers/SKILL.md): light paper, blue/purple ink, recognizable browser/robot/tool/record/storage/human objects and legible exact labels. New raster artwork was unnecessary for these editable technical diagrams. Earlier illustrated target figures and all trial UI artifacts are preserved.

## Content contract

- Code and current evidence, rather than a proposed architecture, define the connections. Two compiled application graphs and four single-provider services have different responsibilities.
- Core/API/agents/application MCP share one process on 8100. The model is scripted. LangChain supplies model/tool interfaces; Deep Agents builds LangGraph execution graphs. App JSON persists the run; LangGraph checkpointing is unconfigured.
- Solid routing lines describe local request/data paths. Four provider routes are conditional choices, not simultaneous discovery fan-out. NDJSON responses are normalized/validated and persisted before SSE makes early rows usable.
- OpenAlex's official MCP is an implemented, live-unproved client path. Crossref/DataCite/Semantic Scholar use REST. The local MCP server is the only MCP surface freshly initialized/cataloged in the November 9 review.
- Crossref/DataCite HTTP 200 and Semantic Scholar HTTP 429 are **October 26** probe results. They are not current external checks. All fresh local provider health responses were fixture mode; `ready` is not live access/semantic proof.
- The workflow shows four scripted model generations on the normal tested path. No LLM planner, live model, vector database, full-text/PDF/web/video pipeline or production graph continuation is implied.
- The review checkpoint's next steps are proposals. They do not enable providers/models, select a production database or authorize paid inference.

Sources: [independent subagent audit](../../../docs/reviews/2026-11-09-agentic-audit.md), [fresh runtime receipt](../../../docs/reviews/2026-11-09-runtime-status.json), [source fingerprints](../../../docs/reviews/2026-11-09-source-status.json), [dated public probes](../../../docs/validation/provider-access.json), [framework validation](../../../docs/validation/increment-1.md), [UI validation](../../../docs/validation/dub-ux-adoption.md).

## Visual and source review

[verify-diagrams.mjs](verify-diagrams.mjs) exports PNGs with the existing local Playwright installation, checks actual rendered text bounds against the canvas/panels, and exercises viewer tabs/keyboard navigation/zoom at desktop and phone widths. [visual-review.json](visual-review.json) records the outcome; `previews/` contains viewer screenshots. Rendered exports were visually inspected for text, status labels, arrows, margins and reading order. This is artifact QA, not new application/provider/model testing.

To regenerate from the repository root:

```sh
.tools/node/bin/node system-design/diagrams/review-2026-11-09/build-diagrams.mjs
.tools/node/bin/node system-design/diagrams/review-2026-11-09/verify-diagrams.mjs
```

[review-receipt.json](review-receipt.json) records final artifact/source hashes, dimensions and review status. The original October 26 proposed illustration keeps its own generation-time receipt.
