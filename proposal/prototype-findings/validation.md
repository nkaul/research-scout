# Research Scout validation — 23 October 2026

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


## What is working

The local Research section, isolated persistence, public evidence acquisition, optional catalog curation, three Markdown documents and reviewed save flow are implemented. The frontend production build passes. Simulated route tests exercise the complete start → inspect → human review → save → reload path while proving the normal workspace database is unchanged.

The real Deep Agents/LangChain/LangGraph harness and both MCP adapters have protocol/transport tests. The new task-scoped MCP server uses actual official-SDK JSON-RPC transport. The remote GitHub MCP adapter uses a mocked Streamable HTTP endpoint for compatibility tests; its live account-specific OAuth grant has **not** been verified.

## Live evidence and exact spending

The approved first live allowance was **6 generation attempts, 12 provider HTTP requests and at most $1**, within the existing cumulative $5 experiment ceiling. All six attempts and twelve requests were used. Recorded settled cost is **$0.001219**; no uncertain provider holds remain. No additional paid request is authorized by an unused dollar remainder once the request-count limit is reached.

The user then approved a **separate additional batch of up to 6 generations, 12 provider HTTP requests and $1**, still inside the historical $5 ceiling. It was admitted once as `research-scout-trial-2026-10-23` for the connected account's numeric owner ID. The corrected live run below passed using **3 generations, 6 provider HTTP requests and $0.001319**, leaving **3 generations and 6 provider requests** for an in-app trial. Both batches together have consumed 9 generations, 18 provider requests and **$0.002538**. No additional calls were made after this successful run.

| Run | Data / mode | Outcome | Generations / provider HTTP | Settled cost |
| --- | --- | --- | --- | --- |
| `f5b5cd4b5a4d4cccbfa9c22663f61007` | Real public GitHub + OpenAI through new MCP tools | Searched and inspected one repository; final turn chose catalog discovery rather than drafting. Stopped without a draft. | 3 / 6 | $0.000547 |
| `95717da09cfe4692bc474e59f2460993` | Real public GitHub + OpenAI; final turn restricted to draft | Initial AND query returned zero; second turn narrowed search but did not inspect. Draft rejected because no inspected candidate existed. No result was saved. | 3 / 6 | $0.000672 |
| `ae996c80beaf4a598f7d509db3320a51` | Real public GitHub, curated mode | Inspected `vivekn/sentiment`, curated AWS/Kaggle leads, generated report/approach/narration and paused for human review. | 0 / 0 | $0 |
| `3199b461fae44f87b384720c8d411255` | Real public GitHub + OpenAI; combined corrections | **Passed:** searched, inspected `cjhutto/vaderSentiment`, curated AWS/Kaggle leads, generated all three documents with four valid source references, and paused for human review. | 3 / 6 | $0.001319 |

These smoke runs used **anonymous public GitHub reads** from a local development CLI. They do not prove application OAuth or remote GitHub MCP compatibility. Tasks are scoped to the resolved public account's numeric ID so the user can inspect the retained results after normal app sign-in; the CLI does not create a browser session or bypass API authentication.

## Improvements driven by the live runs

1. The final model turn now exposes **only** `draft_research` and forces that tool choice. A host guard rejects any other final-turn action.
2. Stage instructions now reserve the second turn for inspection once search has results, and combine optional data discovery with an earlier action.
3. Search treats GitHub's AND semantics explicitly: remove repeated preferred-language words, cap lexical words, and transparently broaden an empty query inside the same bounded tool action. The trace records broadening. No new model turn is spent on that local fallback.
4. An agent reaching its turn limit without a validated draft reports the unresolved limit; it does not present a successful research result.

The corrected combined path now has both offline regression coverage and the successful live run recorded above. Its [unedited generated documents](examples/sentiment-analysis/README.md) are retained in this package. All citations resolve; an implementation-agent spot check supported the main metadata/README claims. Human acceptance remains pending, and this one case does not establish an aggregate quality score.

## In-app trial handoff

The ignored local environment now selects `RESEARCH_LIVE_AI=true`, `RESEARCH_MODEL=gpt-6-luna`, and the explicitly admitted trial grant. Read-only readiness confirms the account has enough authority for one bounded three-generation/six-provider-request run. No backend restart or sign-in replacement was needed to select the grant; the provider reads those settings per request.

At this handoff, the historical ledger reports **$0.316336** total estimated charges, **$0** reserved, and **$4.683664** remaining under its $5 ceiling. These totals include earlier project work, not only Scout. The trial grant has $0.998681 unspent, but its remaining **request and generation counts** also apply. Exhaustion disables another full live run; unused dollars never replenish the counts automatically.

Open `http://127.0.0.1:3000`, sign in normally, choose **Research**, and select the latest **Waiting human** run for `cjhutto/vaderSentiment`. Read the three documents and save the repository only if you accept the evidence and license findings. To try your own brief, select **Live agent**; at most one full run remains in the approved trial batch. Curated discovery uses no model allowance.

## Test coverage and reproduction

Recorded checks: **327 backend tests passed**, including **54 Research tests**; the Research browser scenario passed; frontend TypeScript/targeted lint and the production Next.js build passed. `git diff --check` is clean. The localhost frontend returned HTTP 200, while unauthenticated backend and same-origin proxy Research requests both correctly returned HTTP 401.

```bash
cd backend
.venv/bin/python -m pytest tests/research -q
.venv/bin/python -m pytest tests/demo tests/research -q
.venv/bin/ruff check app/research app/github/client.py tests/research

# Frontend: use the repository's Node and Chromium if installed.
cd ../frontend
PATH="$PWD/../.tools/node/bin:$PATH" npm run build
PATH="$PWD/../.tools/node/bin:$PATH" \
  PLAYWRIGHT_BROWSERS_PATH="$PWD/../.tools/playwright" \
  npm run test:demo -- research-scout.spec.ts
```

| Area | What is asserted |
| --- | --- |
| Real framework runtime with injected deterministic model | Search/observation/inspection/draft cycles, final-turn enforcement, immediate stop after draft, no hidden filesystem/shell/delegation tools, optional checkpoint no-replay behavior |
| Mock OpenAI HTTP through actual ChatOpenAI graph | Full tool schemas included in input counting; actual response tool-call IDs correlated; three generations/six HTTP requests; `store=false`; no hidden completion call |
| Provider policy | Finite owner-bound grants, worst-case reservation, existing global ceiling and other budget holds, request admission, no automatic renewal, ambiguous outcomes held and blocked |
| MCP | Initialization/list/call framing, strict arguments, task closures, no save tool, bounded output, remote identity/token checks, exact readonly tool allowlist and language constraints |
| Storage/report | Separate DB refusal for unrelated tables, cross-owner denial, immutable cited evidence, hashes, selected providers, policy recheck, atomic idempotent saved snapshots |
| Service/API | Session, Origin and CSRF; async task lifecycle; normal DB unchanged; cross-owner artifact/save/stop/retry denied; no save before review; successful save marks completed |
| Failure handling | Inflight cancellation and logout fence output; README auth/rate failures pause; missing README is an explicit metadata-only limitation; interrupted tasks do not auto-replay |
| Public-only content | README acquisition carries no OAuth Authorization header, so an intervening visibility change cannot expose private README content through the user's wide repo grant |
| Browser | Simulated backend data is visibly labeled; isolated Research navigation/library/count, policy-disabled selection, explicit saves, Markdown download, persisted history and mobile layout |

Browser screenshots are local test artifacts in `frontend/test-results/research-scout-*.png`, including a 1920×1080 view and mobile view. They are fixture-based UI evidence, not live-model evidence.

## Scope limits

- No broad relevance/precision benchmark or human quality score is claimed from one-repository smoke cases.
- Report citations are checked for membership and traceability, not automatically proven entailed.
- Raw source versions are not commit-pinned. Retained passage hashes identify the observation, not a complete repository snapshot.
- Data links are curated leads; downloads, freshness, dataset access and compatibility are unverified.
- Production Research state is durable SQLite; graph conversation resumption across process restart is deliberately not automatic.
- Existing taxonomy, ground-truth records, frozen benchmarks and AWS resources are not migrated or replaced by Research.
