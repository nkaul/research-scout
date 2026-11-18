# Research Scout

**November 15 landing and owner sign-in:** The approved Observatory landing is now `/`, and the current research workspace is `/app`. Choose **Sign in** to create the single local owner on first use; later visits accept username/email and password. Account options include sign-out and explicit Google linking. Password recovery writes private messages to the ignored `.scout/auth-outbox/` directory. The **separate Research Scout Google client ID** is configured and loaded locally; the localhost origins have been saved in Console, but Google still rejects them during verification; [localhost setup](docs/google-oauth-localhost.md). No HabitQuest credentials/settings are reused. [Design and boundaries](system-design/landing-and-local-auth-2026-11-15.md). The reported Google callback 503 from missing Python CA trust is fixed and live-probed; [verification](docs/validation/google-oauth-tls-2026-11-15.json).

**Latest November 14 information toolbar:** [Search overview, query focus, source coverage and timing](system-design/search-information-toolbar-2026-11-14.md) move to icon controls alongside Date/Limits/AI. Saved AI focus and Material tags appear beneath the settings, while full prompts and provider traces remain explicit. This supersedes the previous below-tabs information-bar placement and retains retrieval/state/budget ownership.

**Latest November 14 resource reading:** [Unified search information and readable Data/Repos](system-design/resource-information-and-reading-plan-2026-11-14.md) implements the approved v0.2 plan: one information pane below all resource tabs, accurate shared completion/coverage, source-derived points and Original/Saved excerpts with inline expansion, bounded readers, GitHub topic filters, verified saved README source and persistent local Repo notes. Existing retrieval ownership, request/credit limits, provider isolation and saved research remain intact.

**Latest November 14 central search:** [One Search across Papers, Videos, Data and Repos](system-design/central-resource-search-2026-11-14.md) adds remembered 0–20 limits and parent-owned resource jobs for new interactive searches. Data/Repos no longer need a second Find action; saved/tab reads remain read-only. Counts distinguish disabled, pending, empty, failed, relevant and overflow states. The saved embedding-query parser failure is corrected, and the larger atom tilts whole rings in three dimensions. Existing model budgets, provider isolation and credit history are preserved.

**Latest November 14 compact UI:** [Compact controls, resource loading and identity](system-design/compact-toolbar-and-brand-2026-11-14.md) puts source/date/video/AI controls on one desktop row, moves project/query actions to the workspace header and adds scoped resource-tab loading. Videos uses a slider popover, Custom and AI use icons with accessible labels/tooltips. Research Scout has a navigation mark, the curiosity tagline, proper-case headings and a larger animated atom with reduced-motion support. Retrieval, provider scope, explicit acquisition and credit policy remain unchanged.

**Latest November 14 optional AI refinement:** [AI/direct controls and used credits](system-design/optional-ai-refinement-2026-11-14.md) makes refinement an explicit remembered switch beside sources/date controls in Search and Exploration. On retains model planning/review and its gates; Off uses the saved direct query without hosted-model calls or credits, including explicit Data/Repos lookups. This supersedes the earlier mandatory-AI UI policy. Saved traces retain actual execution mode. The header displays used/100; accounting/history/reset rules are unchanged.

**Latest November 14 daily credits:** [Daily credits and model economics](system-design/daily-credit-tokenomics-2026-11-14.md) replaces the historical lifetime $0.25 admission blocker with 100 credits per local day. One credit is one dispatched hosted model request; reservations, explicit reset epochs and retained usage/cost history are authoritative in local SQLite. The header meter and `/admin` page require no login. Research/provider state and model routing stay separate.

AI topic refinement now produces a shared research frame and separate **Papers, Videos, Data and Repos** query plans in the existing planning call. The UI exposes inferred context, keywords, missing information and actual clarification questions. Resource adapters use their own saved model plans; canonical intent survives provider repairs. [Implemented design](system-design/shared-ai-query-refinement-2026-11-14.md) · [Audit](discovery/research/ai-refinement-integration-audit-2026-11-14.md).

The **Repos** tab now discovers public GitHub projects using the selected research turn’s saved AI-refined intent. Its dedicated provider and specialist return metadata first, then bounded README excerpts and local vectorless ranking. Visible fetch counts, source versions, match reasons, missing evidence and request timings stay separate from Papers, Videos and Data. [Reference research](discovery/research/github-repository-source-analysis-2026-11-14.md) · [Architecture](system-design/github-repositories-2026-11-14.md) · [Validation](docs/validation/2026-11-14-repos-final.json).

The **Data** tab now finds dataset metadata for the selected research question using its saved AI-refined context. A dedicated LangGraph/DeepAgents workflow reaches Hugging Face and DataCite through application MCP and isolated services. Find/Refresh is explicit; results progressively show source, task, license, access, version and transparent metadata match reasons. No extra hosted model call or dataset-file download is needed. [Source research](discovery/research/dataset-source-analysis-2026-11-14.md) · [Architecture and scope](system-design/dataset-discovery-2026-11-14.md) · [Validation](docs/validation/2026-11-14-datasets-final.json).

New topic searches now require **agentic AI query planning and relevance review**. Retrieval-focus chips use stable Material colors, and Timing details plots recorded model/provider/repair/access spans with saved inputs. Model readiness failures are visible; historical searches retain their original total without invented stage timings. [Current behavior and boundaries](system-design/required-agentic-rag-and-timing-2026-11-14.md).

The November 14 frontend adopts the approved **Refined + Workbench** design: compact research settings, Material provider/topic chips, saved query and LLM/provider request traces, and a performance bar with recorded or browser-measured values. Papers, Videos, projects, notes and explicit PDF/media controls retain their existing behavior. [Adoption design](system-design/refined-workbench-adoption-2026-11-14.md).

The November 13 repository layout puts Python/API services and uv tooling in [backend/](backend/README.md), Next.js application/browser tooling in [frontend/](frontend/README.md), and architecture in [system-design/](system-design/README.md). Existing root configuration and saved research stay in place. [Migration design](system-design/backend-uv-layout-2026-11-13.md).

The latest video behavior fix restores full description expansion, separates metadata and caption requests, adds explicit retry/status feedback and makes thumbnails open the right-hand player. Validation: 317 backend tests, 74 unique mocked browser cases and 11 harness cases pass; an actual saved-video UI test fetched 133 caption segments. [Design and evidence](system-design/video-content-recovery-2026-11-12.md).

The current workspace adds automatic row-following metadata, inline abstract/PDF controls and **durable research projects with concepts, multiple queries and saved resources**. Preview and project saving are separate actions. Validation covers 301 backend tests, 88 unique browser cases across full/focused runs and 11 harness checks. [Current design and evidence](system-design/project-research-workspace-2026-11-11.md).

The latest UI refinement adds a right-hand detail panel, a remembered date slider, compact video rows, atom activity and progressive skeletons. **294 backend tests, 78 browser cases and 11 harness checks passed.** [Implementation and validation](system-design/right-panel-and-loading-2026-11-11.md). [YouTube retrieval/MCP/relevance review](system-design/youtube-retrieval-and-relevance-2026-11-11.md).

Three parallel UI reviews tightened navigation/state, video/transcript behavior and reader accessibility. The combined checkpoint passed 294 backend tests, 70 browser cases and 11 harness cases, plus build/typecheck/lint. [Current multi-agent review](system-design/multi-agent-ui-review-2026-11-11.md).

Opening a main result now docks a nonmodal reader on the right, with an inline reader on smaller screens. Date controls use a remembered year slider; atom activity and skeleton rows show progressive loading. [Current reader and loading design](system-design/right-panel-and-loading-2026-11-11.md). Video cards have thumbnails, an explicit YouTube player and timestamped public-caption loading with saved availability states. Live caption acceptance passed for one saved video. [Preview stability and video content](system-design/preview-stability-and-video-2026-11-11.md).

Top Search shows **Papers** and **Videos** in separate tabs. OpenAlex, Crossref, arXiv and YouTube are selected by default; source choices, adaptive publication ranges (1/2/3/5 years or custom) and the last-used tab are remembered locally. [Current tabs and defaults](system-design/tabs-and-search-defaults-2026-11-11.md).

The November 10 rollback restored the previous Dub-inspired UI at the user’s request; that Material blue preview was rejected. The later November 14 hybrid adoption above is the current design. [Rollback record](system-design/ui-rollback-2026-11-10.md). [YouTube live access passed on November 11](system-design/youtube-live-2026-11-11.md): the supplied key loaded after restart, and one video-only search returned 10 live records with descriptions using one provider attempt and zero model calls. Web search remains deferred.

Discovery now defaults to **automatic connected sources**: no provider selection is required, matching DOIs form one paper card, and Unpaywall resolves access locations automatically. See [the current federation checkpoint](system-design/automatic-federated-discovery-2026-11-09.md). Manual source controls remain under advanced settings.

Full integration checkpoint before the UI rollback: **276 Python tests, 44 browser journeys and 11 structural harness cases passed**, plus lint/typecheck/build. The earlier November 9 automatic live search chose OpenAlex, arXiv and Crossref and displayed 26 primary papers, including six reported open-access results from Unpaywall. Access enrichment currently checks up to 12 unique DOIs per turn; additional DOI groups show an explicit deferred state. [Evidence and limits](system-design/automatic-federated-discovery-2026-11-09.md#validation-checkpoint). Earlier dated checkpoints below preserve their historical scope.

A local research workspace with primary OpenAlex hybrid discovery, isolated Python provider services, a Next.js UI and progressive source results.

**Latest November 9 provider expansion:** [Implementation, architecture and live proof](system-design/provider-expansion-2026-11-09.md). arXiv, Europe PMC, OpenAIRE Graph V3 and Crossref topic discovery now run through the actual agents/application MCP and independent services. Live examples returned 20 records from each: arXiv/Europe PMC supplied 20 abstracts each, Crossref 3 abstracts, and OpenAIRE 2 separately labeled descriptions. Available content appeared before search completion. Unpaywall's separate DOI access action is now live-validated with privately configured contact information, returning five reported access locations in the acceptance example. Its published API limit is 100,000 calls/day, not unlimited. No new OpenAI call was used.

**Latest November 9 source/abstract update:** chat cards now show provider abstract snippets immediately and can read fuller saved/same-provider details. New answers use richer saved abstract excerpts locally; earlier citations remain unchanged. [Implementation and boundaries](system-design/richer-sources-and-abstracts.md). The [free-source research review](discovery/research/free-scholarly-sources-review-2026-11-09.md) recommends arXiv, OpenAIRE V3 and domain-scoped Europe PMC next; all three direct API probes passed, but these new services are not yet Scout integrations. Unpaywall is an OA-location resolver over the same database as OpenAlex.

**Latest November 9 update:** [Provider contributions, streaming architecture and measured acceptance](system-design/streaming-generation-2026-11-09.md). Exploration chat now offers explicit **Stream answer · demo**, a real OpenAI Responses stream over saved live sources. One live call showed text after 2.26 seconds and completed after 20.36 seconds, with zero new scholarly calls. Routing remains deterministic; production model selection is open. Crossref/DataCite currently expose DOI operations, not topic discovery. Semantic Scholar search remains rate-limited without a key.

The [earlier integration execution](system-design/integration-execution-2026-11-09.md) added conversation APIs/UI, LangGraph routing, actual Deep Agents/MCP discovery children and agency-routed DOI lookup. [OpenAlex OAuth and live discovery passed](system-design/openalex-connection-2026-11-09.md), including matching year filters and actual UI/MCP execution. Crossref/DataCite live UI and Semantic Scholar details also passed. Current workspace URL: **http://127.0.0.1:3100/** → **Exploration chat**.

For the **November 9 implementation review**, start with the [architecture and agentic audit](system-design/implementation-review-2026-11-09.md) and [diagram review board](system-design/diagrams/review-2026-11-09/index.html). They distinguish the working local fixture framework, live adapter code, dated external probes and the unconfigured hosted model.

The [live connections and exploration chat execution plan](system-design/live-operations-and-chat-plan.md) preserves the earlier generation deferral. The latest explicit streaming request reopens the bounded answer demo; production model selection and bookmark retention remain deferred.

Increment 1 development is approved. The framework is validated with authored fixtures, actual Deep Agents graphs/MCP and separate service processes. The earlier streaming checkpoint passed 143 Python tests, 18 browser journeys and 11 structural harness evals, plus one actual streaming generation. See the current counts above, [implementation status](system-design/implementation-status.md) and the dated [original validation report](docs/validation/increment-1.md).

## Run locally

The Python services form a uv project under [backend/](backend/README.md); the Next.js application and browser tests live under [frontend/](frontend/README.md). Python 3.13 and Node.js 24 are the validated toolchain. Backend dependencies are declared in [backend/pyproject.toml](backend/pyproject.toml) and resolved in [backend/uv.lock](backend/uv.lock); frontend dependencies use [frontend/package-lock.json](frontend/package-lock.json).

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) if needed. This checkout has an ignored uv bootstrap at `.tools/uv/bin/uv` and a Node toolchain at `.tools/node/bin`. From the repository root, `export PATH="$PWD/.tools/uv/bin:$PWD/.tools/node/bin:$PATH"` selects them. The backend requires uv `>=0.13.8,<0.14`.

From the repository root:

```bash
uv sync --project backend --locked
npm --prefix frontend ci
uv run --project backend --locked python backend/scripts/dev.py
```

uv creates `backend/.venv` from the committed lock; the earlier root `.venv` is no longer the project environment. Development dependencies are included by default. Use `--locked` to verify the committed resolution rather than changing it during routine setup. See [uv project commands](https://docs.astral.sh/uv/guides/projects/) and [locking/syncing](https://docs.astral.sh/uv/concepts/projects/sync/).

For the optional local encoder profile, include its extra on both setup and every subsequent uv invocation that shares this environment:

```bash
uv sync --project backend --locked --extra encoder
uv run --project backend --locked --extra encoder python backend/scripts/dev.py
```

Use the same `--extra encoder` flag for tests and tools when this profile is active. uv selects extras per invocation; omitting the extra can remove its packages during automatic synchronization. Encoder model artifacts remain separately cached and are not downloaded at application startup.

Open **http://127.0.0.1:3100**. The core/MCP listens on **8100**. Separate provider processes use **8111** (OpenAlex), **8112** (Crossref), **8113** (DataCite), **8114** (Semantic Scholar), **8115** (arXiv), **8116** (OpenAIRE), **8117** (Europe PMC), **8118** (Unpaywall) and **8119** (YouTube). The launcher still reads repository-root `.env` and writes logs/state under repository-root `.scout/`; credentials, caches and saved research keep their existing locations. Model accounting uses `backend/db/tokenomics.sqlite3`; the old JSON ledger remains historical evidence. It stops only its own processes on Ctrl-C. Port 3100 keeps this project separate from GitHub Manager.

Startup checks refuse occupied ports before launching children. Stop the earlier Research Scout launcher before starting another; existing services are never reused or terminated by this check. Research questions accept up to 2,000 characters and 2,000 UTF-8 bytes, with a visible byte count and no silent truncation.

API preflight also rejects unusually large escaped JSON context before creating a run. The bounded fixture harness retains the full brief and source ID/version references while reducing optional previews to fit.

Default mode is **fixture**: clearly labeled fictional records and scripted model responses, with no provider credentials, paid model calls or model downloads. The framework still executes real Deep Agents → application MCP → provider service → persisted events → UI. Lexical results can be inspected/saved before the semantic branch or summary finishes.

Optional `.env` configuration starts from [.env.example](.env.example). The launcher reads only this repository's `.env`, never a parent project's file. Provider-specific fixture/live modes are honored; explicit `--mode` overrides all providers. `SCOUT_MODEL_MODE=disabled` keeps the Deep Agents capability dispatch deterministic. Independently, `SCOUT_RETRIEVAL_ENABLED=true` plus a core-only OpenAI key enables **Refine search with AI** in exploration chat: structured queries, relevance review and at most one revised search. See [provider-aware intent and visible query trace](system-design/provider-relevance-v2-2026-11-09.md) and the [original agentic retrieval checkpoint](system-design/agentic-retrieval-2026-11-09.md). It shares the model budget with the answer writer; fixture launches force both off. The ignored local profile enables both features. The independent `SCOUT_GENERATION_ENABLED=true` plus a server-side OpenAI key enables the explicit answer action; it defaults off in the example and is forced off by `--mode fixture`. The current ignored local `.env` selects live providers and enables this bounded demo. A fresh clone defaults to fixtures. Live provider mode alone never enables a paid model or substitutes another provider after failure. `--check-config` prints nonsecret modes without upstream calls.

To run just the core and selected services:

```bash
uv run --project backend --locked python backend/scripts/dev.py --no-frontend --providers openalex
```

Each provider can also run independently:

```bash
uv run --project backend --locked python -m research_scout.providers --provider openalex --port 8111 --mode fixture
```

## Validate

```bash
uv run --directory backend --locked pytest -q
uv run --directory backend --locked ruff check src tests scripts
uv run --project backend --locked python -m research_scout.agents.evaluate --output docs/validation/context-harness-evals.json
cd frontend
npm run typecheck
npm run build
npm run test:browser
```

Browser tests use Playwright's full Chromium with a local browser cache. Install it first if needed:

```bash
cd frontend
PLAYWRIGHT_BROWSERS_PATH=.browser-cache npx playwright install chromium
```

Tests cover source/filter identity, provider isolation, finite durable grants, agent/tool scope, progressive rendering, human revisions, immutable exports, cancellation/deadline fences, restart and replay. Synthetic evals measure structural context/harness behavior; they do not establish live model quality or literature-search accuracy. The [validation report](docs/validation/increment-1.md) separates fixtures, actual local protocols, browser evidence and public live adapter probes.

To require the actual fixture-backend browser journey, run `uv run --project backend --locked python backend/scripts/dev.py --mode fixture --state-dir .scout/fixture-validation --no-frontend` from the repository root, then use `SCOUT_BROWSER_INTEGRATION=1 npm run test:browser` in `frontend/`. This starts its own frontend and requires port 3100 to be free. If reviewing an already running fixture frontend on that port, use `SCOUT_BROWSER_EXTERNAL_SERVER=1 SCOUT_BROWSER_INTEGRATION=1 npm run test:browser`. Fixture acceptance requires fixture services; it does not authorize live research or model calls.

## Code and design

| Location | Responsibility |
| --- | --- |
| [backend/](backend/README.md) | uv project, Python package, backend tests, scripts, fixture assets and evals. |
| [api.py](backend/src/research_scout/api.py) | Loopback API, SSE and local MCP; scholarly clients stay in provider services. |
| [conversations.py](backend/src/research_scout/conversations.py), [generation.py](backend/src/research_scout/generation.py) | LangGraph turns, activity, saved evidence and optional bounded LangChain/OpenAI answer stream. |
| [core.py](backend/src/research_scout/core.py), [store.py](backend/src/research_scout/store.py) | Run ownership, explicit routing, revision/attempt admission and atomic local state/event publication. |
| [providers/](backend/src/research_scout/providers/) | Independently launched single-provider services, live adapters, receipts and labeled fixtures. |
| [agents/](backend/src/research_scout/agents/) | Actual bounded Deep Agents graphs, compact context and application MCP client. |
| [frontend/](frontend/) | Next.js workspace, source rows, inspector, shortlist, explicit checks and exports. |
| [backend/tests/](backend/tests/), [backend/evals/](backend/evals/) | Python contracts, real process/MCP integration and synthetic harness baseline. |
| [frontend/tests/browser/](frontend/tests/browser/) | Mocked UI contracts and explicitly enabled fixture-backend browser journeys. |
| [system-design/](system-design/README.md) | Approved target, implementation decisions and remaining gates. |

Each discovery run selects one provider; a conversation can explicitly compare two separate child runs. OpenAlex embeds semantic query text itself. Other discovery providers use a bounded lexical pool and explicitly configured local CPU reranking. Crossref/DataCite DOI checks stay registration-aware. Unpaywall is DOI access resolution, with no paper discovery, abstract inference or file downloads. Provider observations remain separate.

The local JSON repository is a bounded single-writer implementation behind interfaces; no production database, vector store, cloud deployment or multi-user operating model is selected.
