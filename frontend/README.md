# Research Scout frontend

**November 15 landing/auth routes:** `/` renders the approved Observatory landing; `/app` retains the current ResearchWorkspace and validates the backend session. `/login`, `/forgot-password`, `/reset-password` and `/account` use the Python core's authentication API through the same-origin proxy. Auth/landing styles are scoped CSS Modules; no other mockup design is adopted. Landing questions become URL drafts and never start retrieval automatically. Existing saved root bookmarks forward to `/app`. [Implementation](../system-design/landing-and-local-auth-2026-11-15.md) · [Separate Google client setup](../docs/google-oauth-localhost.md).

For an optimized local frontend, build with `SCOUT_API_URL=http://127.0.0.1:8100 npm run build`, then start with the same API URL and `npm run start`. Rewrites use the build-time API origin; server session validation uses its runtime counterpart, so they must match. Run the backend with `--no-frontend` when managing the frontend separately. Development mode remains available through the usual launcher; duplicate-effect diagnostics are validated against production builds.

**Latest November 14 information toolbar:** [Search overview, query focus, source coverage and timing](../system-design/search-information-toolbar-2026-11-14.md) move to icon controls alongside Date/Limits/AI. Saved AI focus and Material tags appear beneath the settings, while full prompts and provider traces remain explicit. This supersedes the previous below-tabs information-bar placement and retains retrieval/state/budget ownership.

**Latest November 14 resource reading:** [Unified search information and readable Data/Repos](../system-design/resource-information-and-reading-plan-2026-11-14.md) implements the approved v0.2 plan: one information pane below all resource tabs, accurate shared completion/coverage, source-derived points and Original/Saved excerpts with inline expansion, bounded readers, GitHub topic filters, verified saved README source and persistent local Repo notes. Existing retrieval ownership, request/credit limits, provider isolation and saved research remain intact.

**Latest November 14 central search:** [One Search across Papers, Videos, Data and Repos](../system-design/central-resource-search-2026-11-14.md) adds remembered 0–20 limits and parent-owned resource jobs for new interactive searches. Data/Repos no longer need a second Find action; saved/tab reads remain read-only. Counts distinguish disabled, pending, empty, failed, relevant and overflow states. The saved embedding-query parser failure is corrected, and the larger atom tilts whole rings in three dimensions. Existing model budgets, provider isolation and credit history are preserved.

**Latest November 14 compact UI:** [Compact controls, resource loading and identity](../system-design/compact-toolbar-and-brand-2026-11-14.md) puts source/date/video/AI controls on one desktop row, moves project/query actions to the workspace header and adds scoped resource-tab loading. Videos uses a slider popover, Custom and AI use icons with accessible labels/tooltips. Research Scout has a navigation mark, the curiosity tagline, proper-case headings and a larger animated atom with reduced-motion support. Retrieval, provider scope, explicit acquisition and credit policy remain unchanged.

**Latest November 14 optional AI refinement:** [AI/direct controls and used credits](../system-design/optional-ai-refinement-2026-11-14.md) makes refinement an explicit remembered switch beside sources/date controls in Search and Exploration. On retains model planning/review and its gates; Off uses the saved direct query without hosted-model calls or credits, including explicit Data/Repos lookups. This supersedes the earlier mandatory-AI UI policy. Saved traces retain actual execution mode. The header displays used/100; accounting/history/reset rules are unchanged.

**Latest November 14 daily credits:** [Daily credits and model economics](../system-design/daily-credit-tokenomics-2026-11-14.md) replaces the historical lifetime $0.25 admission blocker with 100 credits per local day. One credit is one dispatched hosted model request; reservations, explicit reset epochs and retained usage/cost history are authoritative in local SQLite. The header meter and `/admin` page require no login. Research/provider state and model routing stay separate.

The header’s **AI plan & query trace** now exposes the shared canonical intent, four resource plans and missing-information fields through `ai-query-plan.tsx`. `lib/ai-query-plan.ts` mirrors the server’s presentation eligibility checks. Main Search shows actual clarification questions and continues in the same Exploration conversation. Data/Repos show their pinned model queries and keep new acquisition disabled for historical/unresolved plans while preserving saved results. [Design](../system-design/shared-ai-query-refinement-2026-11-14.md).

The separate **Repos** tab uses `src/components/repository-results.tsx`, `repo-results.module.css` and `src/lib/repositories.ts`. Mount/history is GET-only; explicit Find/Refresh uses saved conversation/turn references and a remembered 1–20 repository count. Metadata progresses to bounded README evidence, locally ranked candidates, source versions and query/timing details. The responsive nonmodal reader preserves the hidden paper reader and unsaved notes. README text stays plain; immutable Git blob links are distinguished from mutable current README URLs. [Architecture](../system-design/github-repositories-2026-11-14.md).

The separate **Data** tab is implemented in `src/components/dataset-results.tsx` and `src/lib/datasets.ts`. It restores saved dataset searches with GETs; only explicit Find/Refresh sends a selected conversation/turn reference to the dataset API. The visible remembered limit is 1–20 records per catalog (default10), with Hugging Face and DataCite enabled. Progressive cards, status/timing, recorded catalog queries and a responsive metadata reader preserve Papers/Videos and unsaved paper notes. Metadata applicability is a local hint, not a new LLM review; files, dataset analysis and dataset project pins are deferred. [Architecture](../system-design/dataset-discovery-2026-11-14.md).

Next.js App Router + React + TypeScript workspace. The user-selected [Refined + Workbench hybrid](../system-design/refined-workbench-adoption-2026-11-14.md) uses a light sidebar, compact research settings, Material chips and persistent desktop preview. Query transparency reads saved LLM/provider request traces; the performance bar uses recorded or measured clocks. All fonts and SVG icons are local. This update adds no dependencies or component framework.

The main dashboard is `src/app/page.tsx`, rendering `src/components/research-workspace.tsx`. `search-results.tsx` owns saved/live result state; `retrieval-focus.tsx` and `search-performance.tsx` present that state in the workspace header. Appearance is in `src/app/globals.css` and the adjacent component CSS modules.

AI refinement is a remembered optional switch. On requires model planning/relevance readiness and never silently falls back; Off submits the saved direct query without hosted model calls. DOI and saved actions remain separate. `search-timeline.tsx` plots persisted stage intervals with exact saved request inputs and overlap-aware wall-time coverage. [Required retrieval and timing](../system-design/required-agentic-rag-and-timing-2026-11-14.md).

The frontend uses **port 3100** so it can run alongside GitHub Manager on port 3000. Application API requests are rewritten to `http://127.0.0.1:8100` by default. Set `SCOUT_API_URL` before starting/building to use a different backend. Python services form the separate [backend uv project](../backend/README.md). From the repository root, start the stack with `uv run --project backend --locked python backend/scripts/dev.py`; use `--extra encoder` on uv sync/run for the optional encoder profile. Shared configuration and runtime state remain in repository-root `.env` and `.scout/`.

From this directory, with Node.js on `PATH`:

```sh
npm ci
npm run dev
```

The repository-local runtime can be selected with `PATH="../.tools/node/bin:$PATH"`. Open [Research Scout](http://127.0.0.1:3100). For a production build, run `npm run build`, then `npm run start`. Next.js telemetry is disabled by these scripts.

The frontend shows the backend's actual fixture/live mode. Fixture records remain explicitly labeled as synthetic. A provider/structured-filter change becomes a new request only after Search. Available saved source rows can be reviewed during execution; lexical/semantic statuses, later annotations and registry checks remain distinct. Stable rows preserve scroll/focus and human choices. Reconnect/reopen use saved application state. The final rank is applied explicitly.

The source preview has Overview, Metadata and Your notes tabs; smaller screens show the same content in an inline responsive reader. Human include/exclude/reason decisions, explicit detail lookup, agency-routed DOI checking and whole-record citation-source choice retain the existing API behavior. Registry fields never overwrite discovery fields. Research notes groups the current run's saved selection reasons. The three-paper shortlist and 2,000 UTF-8-byte question bounds are visible; over-limit text stays editable. Bibliography and manifest downloads use the saved revision.

Settings contains year bounds for the next explicit search, source density and optional list excerpts. Result filtering searches already received titles/authors/years locally. Provider controls display existing application configuration. These display actions make no new research/model calls; they do not install the unsupported controls or fictional data from the design trial.

## Checks

```sh
npm run typecheck
npm run build
npm run test:browser
```

Install the test browser when needed with `PLAYWRIGHT_BROWSERS_PATH=.browser-cache npx playwright install chromium`. The browser suite uses full Chromium with GPU disabled because this machine's headless-shell build did not produce animation frames even on an isolated blank page. It retains real click/hit testing and uses a dedicated server with automatic server reuse disabled.

Deterministic tests under `tests/browser/` intercept only application requests and inject controlled snapshot events. They validate UI behavior, not live provider relevance. `SCOUT_BROWSER_INTEGRATION=1 npm run test:browser` additionally enables fixture-backend acceptance cases. Start synthetic services from the repository root with `uv run --project backend --locked python backend/scripts/dev.py --mode fixture --state-dir .scout/fixture-validation --no-frontend`. This is fixture validation and does not authorize live provider/model calls. Set `SCOUT_BROWSER_EXTERNAL_SERVER=1` to use a fixture frontend process you started yourself, and optionally `SCOUT_BROWSER_URL` for its URL.

Browser screenshots/traces live under `tests/browser/artifacts/` and are ignored. Frontend-only utility scripts live under `scripts/`; the historical `validate_live_ui.mjs` probe makes explicit live DOI lookups and is not a default test command. Chromium binaries, dependencies and `.next/` are local ignored artifacts. The dependency lockfile records exact resolved versions.

Current API usage was checked against the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and [external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) documentation on October 26, 2026. The installed application versions are Next.js 16.4.3 and React 19.3.1.
