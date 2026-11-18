# Search information in the settings toolbar

Status: implemented and validated following the user's November 14 request. Three parallel agents handled information controls, AI focus and browser acceptance; the root integrated the toolbar hosts and live inspection.

This supersedes the placement and collapsed-focus presentation in [the unified information plan](resource-information-and-reading-plan-2026-11-14.md). Retrieval, source identities, saved research and budgets retain their existing ownership.

The Sources / Date / Limits / AI settings bar now also hosts four tooltip-labeled icon controls:

| Control | Presentation |
| --- | --- |
| Search overview | Saved limits, resource outcomes and available counts. Resource tabs keep their counts; another visible count row is unnecessary. |
| Query and focus | Exact original question, saved plan, LLM inputs and actual provider arguments, opened explicitly. |
| Sources and coverage | Consolidated outcomes for the active Papers, Videos, Data or Repos tab; paper access coverage remains separate from discovery/relevance. |
| Timing and usage | Visible compact elapsed metric beside the clock icon, with the detailed timeline and separate saved-view/reader clocks on expansion. |

Selecting an icon opens its panel immediately below the settings bar; selecting it again closes the panel. Changing sections switches that one panel. There is no second textual section-tab strip or generic Search information toggle below the resource tabs. Icons have accessible names, selected/expanded state, keyboard activation and tooltips. Filter, current search status and Stop remain reachable without opening diagnostics.

AI-refined research automatically exposes a compact **AI query focus** row below the settings. It shows saved resource query/focus and the model's recorded tags/keywords in stable Material colors. Inline overflow expansion reveals additional saved chips. Exact request bodies and detailed relevance review remain behind Query details. Direct queries do not gain invented AI tags. Current saved execution remains independent from the AI switch used to prepare the next query.

The toolbar and detail area are rendered by the existing `SearchInformation` owner through explicit host elements in `ResearchWorkspace`. `SearchResults` retains its parent/child GET/SSE lifecycle, revision guards and scope reset. The toolbar host sits in the settings bar; the details host is outside the search form, so trace controls cannot submit research. Every toolbar action is a non-submit button. Standalone rendering retains an inline fallback.

Responsive wrapping keeps controls usable on tablet and phone widths. New pending/search/turn scopes hide old query focus and expanded details. Tab changes only change the active source/query context; opening icons, expanding tags and reading saved requests add no acquisition or model call.

## Validation

[Combined receipt](../docs/validation/2026-11-14-information-toolbar-final.json) · [Read-only live inspection](../docs/validation/2026-11-14-information-toolbar-live.json).

- TypeScript and an isolated production build pass. All 93 frontend source files match the tested build.
- **80/80 affected browser cases pass in one clean final source-matched run**, including seven new toolbar/AI-focus cases, with zero failures/skips/flaky outcomes. Earlier runs exposed two old status/Stop selectors and initial saved-read/subscription baseline races in tests; the corrected checks retain strict unchanged GET counts and zero additional EventSource URLs. A source comparison caught the first preview before the toolbar stylesheet finished writing, so the final build was rebuilt and all 80 cases repeated against it. Earlier outcomes remain in the receipt; no automatic retries were used.
- Actual isolated browser→HTTP→agent/application MCP fixture searches and versioned README/notes reading continue to pass. Icon clicks, tag expansion, filtering and tab changes preserve the existing request/subscription owners. Fixture results are authored examples, not live research-quality measurements.
- Live Next.js inspection reuses 58 saved paper cards, 10 videos and saved AI-refined Data/Repos context. All browser API writes and external assets were blocked; there were zero writes or browser errors. Seven widths from 320 to 1440 pixels fit without horizontal overflow. Visual review confirms the four icons beside Date/Limits/AI, visible clock, automatic colored focus row and no blank direct-mode information bar.
- The live app hot-reloaded without restarting backend services. Accounting remained at 24 used / 100 during read-only inspection, with the same reset epoch. No validation provider search, hosted-model request or credit reset occurred. Backend code/dependencies are unchanged, so the backend suite was not rerun for this presentation update.
