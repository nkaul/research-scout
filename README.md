# Research Scout

Discovery now defaults to **automatic connected sources**: no provider selection is required, matching DOIs form one paper card, and Unpaywall resolves access locations automatically. See [the current federation checkpoint](system-design/automatic-federated-discovery-2026-11-09.md). Manual source controls remain under advanced settings.

Current validation: **270 Python tests, 43 browser journeys and 11 structural harness cases passed**, plus lint/typecheck/build. An automatic live search chose OpenAlex, arXiv and Crossref and displayed 26 primary papers, including six reported open-access results from Unpaywall. Access enrichment currently checks up to 12 unique DOIs per turn; additional DOI groups show an explicit deferred state. [Evidence and limits](system-design/automatic-federated-discovery-2026-11-09.md#validation-checkpoint). Earlier dated checkpoints below preserve their historical scope.

A local research workspace with primary OpenAlex hybrid discovery, isolated Python provider services, a Next.js UI and progressive source results.

**Latest November 9 provider expansion:** [Implementation, architecture and live proof](system-design/provider-expansion-2026-11-09.md). arXiv, Europe PMC, OpenAIRE Graph V3 and Crossref topic discovery now run through the actual agents/application MCP and independent services. Live examples returned 20 records from each: arXiv/Europe PMC supplied 20 abstracts each, Crossref 3 abstracts, and OpenAIRE 2 separately labeled descriptions. Available content appeared before search completion. Unpaywall's separate DOI access action is now live-validated with privately configured contact information, returning five reported access locations in the acceptance example. Its published API limit is 100,000 calls/day, not unlimited. No new OpenAI call was used.

**Latest November 9 source/abstract update:** chat cards now show provider abstract snippets immediately and can read fuller saved/same-provider details. New answers use richer saved abstract excerpts locally; earlier citations remain unchanged. [Implementation and boundaries](system-design/richer-sources-and-abstracts.md). The [free-source research review](discovery/research/free-scholarly-sources-review-2026-11-09.md) recommends arXiv, OpenAIRE V3 and domain-scoped Europe PMC next; all three direct API probes passed, but these new services are not yet Scout integrations. Unpaywall is an OA-location resolver over the same database as OpenAlex.

**Latest November 9 update:** [Provider contributions, streaming architecture and measured acceptance](system-design/streaming-generation-2026-11-09.md). Exploration chat now offers explicit **Stream answer · demo**, a real OpenAI Responses stream over saved live sources. One live call showed text after 2.26 seconds and completed after 20.36 seconds, with zero new scholarly calls. Routing remains deterministic; production model selection is open. Crossref/DataCite currently expose DOI operations, not topic discovery. Semantic Scholar search remains rate-limited without a key.

The [earlier integration execution](system-design/integration-execution-2026-11-09.md) added conversation APIs/UI, LangGraph routing, actual Deep Agents/MCP discovery children and agency-routed DOI lookup. [OpenAlex OAuth and live discovery passed](system-design/openalex-connection-2026-11-09.md), including matching year filters and actual UI/MCP execution. Crossref/DataCite live UI and Semantic Scholar details also passed. Current workspace URL: **http://127.0.0.1:3100/** → **Exploration chat**.

For the **November 9 implementation review**, start with the [architecture and agentic audit](system-design/implementation-review-2026-11-09.md) and [diagram review board](system-design/diagrams/review-2026-11-09/index.html). They distinguish the working local fixture framework, live adapter code, dated external probes and the unconfigured hosted model.

The [live connections and exploration chat execution plan](system-design/live-operations-and-chat-plan.md) preserves the earlier generation deferral. The latest explicit streaming request reopens the bounded answer demo; production model selection and bookmark retention remain deferred.

Increment 1 development is approved. The framework is validated with authored fixtures, actual Deep Agents graphs/MCP and separate service processes. The earlier streaming checkpoint passed 143 Python tests, 18 browser journeys and 11 structural harness evals, plus one actual streaming generation. See the current counts above, [implementation status](system-design/implementation-status.md) and the dated [original validation report](docs/validation/increment-1.md).

## Run locally

Python 3.13 and Node.js 24 are the validated toolchain. Dependencies are captured in [requirements.lock](requirements.lock) and [frontend/package-lock.json](frontend/package-lock.json). This workspace also has an ignored Node toolchain at `.tools/node/bin`; the launcher uses it when present.

For direct npm commands on this workspace, first run `export PATH="$PWD/.tools/node/bin:$PATH"` from the repository root if Node is not already on your PATH.

```bash
python3.13 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install --only-binary cryptography -r requirements.lock
.venv/bin/python -m pip install --no-deps -e .
cd frontend
npm ci
cd ..
.venv/bin/python scripts/dev.py
```

Open **http://127.0.0.1:3100**. The core/MCP listens on **8100**. Separate provider processes use **8111** (OpenAlex), **8112** (Crossref), **8113** (DataCite), **8114** (Semantic Scholar), **8115** (arXiv), **8116** (OpenAIRE), **8117** (Europe PMC) and **8118** (Unpaywall). The launcher writes logs/state under ignored `.scout/` and stops only its own processes on Ctrl-C. Port 3100 keeps this project separate from GitHub Manager.

Startup checks refuse occupied ports before launching children. Stop the earlier Research Scout launcher before starting another; existing services are never reused or terminated by this check. Research questions accept up to 2,000 characters and 2,000 UTF-8 bytes, with a visible byte count and no silent truncation.

API preflight also rejects unusually large escaped JSON context before creating a run. The bounded fixture harness retains the full brief and source ID/version references while reducing optional previews to fit.

Default mode is **fixture**: clearly labeled fictional records and scripted model responses, with no provider credentials, paid model calls or model downloads. The framework still executes real Deep Agents → application MCP → provider service → persisted events → UI. Lexical results can be inspected/saved before the semantic branch or summary finishes.

Optional `.env` configuration starts from [.env.example](.env.example). The launcher reads only this repository's `.env`, never a parent project's file. Provider-specific fixture/live modes are honored; explicit `--mode` overrides all providers. `SCOUT_MODEL_MODE=disabled` keeps the Deep Agents capability dispatch deterministic. Independently, `SCOUT_RETRIEVAL_ENABLED=true` plus a core-only OpenAI key enables **Refine search with AI** in exploration chat: structured queries, relevance review and at most one revised search. See [provider-aware intent and visible query trace](system-design/provider-relevance-v2-2026-11-09.md) and the [original agentic retrieval checkpoint](system-design/agentic-retrieval-2026-11-09.md). It shares the model budget with the answer writer; fixture launches force both off. The ignored local profile enables both features. The independent `SCOUT_GENERATION_ENABLED=true` plus a server-side OpenAI key enables the explicit answer action; it defaults off in the example and is forced off by `--mode fixture`. The current ignored local `.env` selects live providers and enables this bounded demo. A fresh clone defaults to fixtures. Live provider mode alone never enables a paid model or substitutes another provider after failure. `--check-config` prints nonsecret modes without upstream calls.

To run just the core and selected services:

```bash
.venv/bin/python scripts/dev.py --no-frontend --providers openalex
```

Each provider can also run independently:

```bash
.venv/bin/python -m research_scout.providers --provider openalex --port 8111 --mode fixture
```

## Validate

```bash
.venv/bin/python -m pytest -q
.venv/bin/ruff check src tests scripts
.venv/bin/python -m research_scout.agents.evaluate --output docs/validation/context-harness-evals.json
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

To require the actual fixture-backend browser journey, keep `scripts/dev.py --no-frontend` running and use `SCOUT_BROWSER_INTEGRATION=1 npm run test:browser` in `frontend/`. This starts its own frontend and requires port 3100 to be free. If reviewing an already running frontend on that port, use `SCOUT_BROWSER_EXTERNAL_SERVER=1 SCOUT_BROWSER_INTEGRATION=1 npm run test:browser`.

## Code and design

| Location | Responsibility |
| --- | --- |
| [src/research_scout/api.py](src/research_scout/api.py) | Loopback API, SSE and local MCP; scholarly clients stay in provider services. |
| [conversations.py](src/research_scout/conversations.py), [generation.py](src/research_scout/generation.py) | LangGraph turns, activity, saved evidence and optional bounded LangChain/OpenAI answer stream. |
| [core.py](src/research_scout/core.py), [store.py](src/research_scout/store.py) | Run ownership, explicit routing, revision/attempt admission and atomic local state/event publication. |
| [providers/](src/research_scout/providers/) | Independently launched single-provider services, live adapters, receipts and labeled fixtures. |
| [agents/](src/research_scout/agents/) | Actual bounded Deep Agents graphs, compact context and application MCP client. |
| [frontend/](frontend/) | Next.js workspace, source rows, inspector, shortlist, explicit checks and exports. |
| [tests/](tests/), [evals/](evals/) | Unit/contracts, real process/MCP integration, browser checks and synthetic harness baseline. |
| [system-design/](system-design/README.md) | Approved target, implementation decisions and remaining gates. |

Each discovery run selects one provider; a conversation can explicitly compare two separate child runs. OpenAlex embeds semantic query text itself. Other discovery providers use a bounded lexical pool and explicitly configured local CPU reranking. Crossref/DataCite DOI checks stay registration-aware. Unpaywall is DOI access resolution, with no paper discovery, abstract inference or file downloads. Provider observations remain separate.

The local JSON repository is a bounded single-writer implementation behind interfaces; no production database, vector store, cloud deployment or multi-user operating model is selected.
