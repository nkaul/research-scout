# Bounded Scout framework runtime

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


Implemented and tested on 23 October 2026. The runtime uses actual released framework packages, not local stand-ins. Its offline tests inject deterministic models and mock provider HTTP. A live application run is separate evidence recorded by the operator; the tests below do not establish live GitHub MCP compatibility or research quality.

## Installed and locked stack

The `research` dependency group pins LangChain `1.4.7`, LangGraph `1.2.16`, Deep Agents `0.7.30`, official MCP SDK `2.3.0` and the minimum compatible LangChain core `1.6.13`. `uv.lock` records exact transitive distributions and hashes. The existing environment is CPython `3.13.5` on macOS Intel; LangChain OpenAI `1.7.0`, OpenAI SDK `3.29.0` and httpx2 `2.13.1` remain unchanged.

The unavoidable existing dependency changes are core `1.6.9 → 1.6.13`, langchain-protocol `0.0.19 → 0.0.20`, langsmith `0.14.7 → 0.14.12`, tenacity `9.2.1 → 9.1.4` and websockets `17.2 → 16.1.1`. Deep Agents also brings its required Anthropic and Google integrations; Scout does not instantiate or expose those providers.

The latest cryptography major releases have no compatible Intel Mac wheel. An initial source build failed because this machine has no OpenSSL/pkg-config build setup. The group therefore pins cryptography `48.0.1` only on `darwin/x86_64`, using its published universal wheel. Other platforms resolve the current compatible version. No system packages were installed. The package resolution and installation use the ignored local `.tools/agentic-dependencies/uv` executable and `.tools/uv-cache`.

```sh
cd backend
../.tools/agentic-dependencies/uv sync --locked --group research --group ai-pretest --group dev
```

## Graph and tool authority

`framework.run_agent(brief=..., tools=..., thread_id=..., model=..., checkpointer=None)` constructs the compiled graph returned by `create_deep_agent`. Deep Agents builds on LangChain's agent and LangGraph. It requires an explicitly injected `BaseChatModel` and typed application tools; it never chooses a default provider or constructs a model from an agent-supplied name.

The permitted tool names are `search_repositories`, `inspect_repository`, `discover_public_data` and `draft_research`. Root application services retain authentication, verified-public acquisition, task ownership, finite tool quotas, evidence validation and proposal persistence. `draft_research` stages a cited proposal; it cannot save accepted collection membership. A separate authenticated human action saves the reviewed selection.

Passing `tools=` to Deep Agents is additive. Scout uses a dedicated wrapper-model identity and its own `HarnessProfile` to exclude every filesystem/shell/planning/delegation tool, disable the general-purpose subagent and remove summarization middleware. It supplies `StateBackend`, which is an in-state virtual backend with no host filesystem access. No skills, memory files or subagents are configured. A separate executor check rejects any out-of-catalog tool returned by the model before execution. The isolated profile does not change the existing classifier model. These choices follow the documented [harness profiles](https://docs.langchain.com/oss/python/deepagents/profiles) and [Deep Agents constructor](https://reference.langchain.com/python/deepagents/graph/create_deep_agent) contracts.

The application boundary allows at most three model generations, twelve tool actions and four calls in a model response. Tool execution is serialized. Each earlier turn receives its remaining-turn hint. On the third turn the wire catalog contains only `draft_research`, with a forced function tool choice; a model that still returns another action is rejected. Drafting must be the sole action in its turn. A successful draft ends the graph immediately with a fixed public completion message, without a fourth generation. Failed drafting remains an unresolved/failed result for the application to handle; there is no hidden repair budget.

The result contains `drafted`, a public `output`, `model_generations`, `tool_calls` and `checkpoint_reused`. Framework counters aid diagnosis; the monetary and HTTP ledgers remain authoritative.

## Persistence and replay limits

The current application keeps durable task state, steps, source snapshots, proposals and accepted-save receipts in its independent Research SQLite adapter. The graph checkpointer is optional and is not configured as a production automatic-resume service by this base implementation. It contains serializable messages and counters, not credentials or tool closures.

When an injected checkpointer already has messages for the thread, `run_agent` returns that state without replaying the model or tools. An uncertain paid boundary requires explicit application reconciliation. A checkpoint is not proof that a repeated external call is free, nor does this runner promise exactly-once inference. The application must derive the opaque thread identity from its authenticated task and recheck ownership before accessing it.

## Separate Responses provider

`provider.open_research_model` is an async context manager taking the trusted `authorized` callback, `owner` and `task_id`. It yields a real ChatOpenAI model configured for Responses, `store=false`, default service tier, disabled streaming, no previous response ID and zero SDK retries. It closes its async clients on exit. The existing `BudgetedProvider` tool prohibition is unchanged.

`ResearchAISettings` reads optional `RESEARCH_MODEL` and `RESEARCH_GRANT_ID` from the existing settings environment, including the ignored local `.env`. An absent research model reuses the configured classification model; an explicitly configured model must already belong to the approved model allowlist and price table. Model selection does not expand authorization.

The new request hook allows only the four audited local function schemas and the exact OpenAI Responses/count destinations. Hosted web/MCP/filesystem tools and stateful provider features are rejected. Before each generation it sends the full accumulated input **and function schemas** to the input-token counter, checks the input/output ceilings, and conservatively reserves input plus maximum output costs. OpenAI documents that function definitions add input tokens in its [token counting guide](https://developers.openai.com/api/docs/guides/token-counting); the hook includes them rather than reusing the classifier's tool-free count whitelist.

Both the dedicated finite Research grant and the existing `ApplicationLedger`/`RequestAllowance` must admit the request. Defaults are three generations, six HTTP requests and $0.50 per run, inside the separately approved aggregate six-generation/twelve-HTTP/$1 smoke grant and the historical $5 experiment ceiling. Existing application windows are never renewed automatically. Failed/uncertain outcomes retain conservative holds when dispatch may have occurred; known pre-dispatch policy failures release their reservations. A duplicate task/request hash cannot silently repeat an attempted generation.

`admit_research_smoke(existing_ledger, actor=owner, grant_id=...)` is an explicit operator admission operation. It records the bounded grant once and is idempotent for that exact scope; it cannot change the owner, reset counters or replenish a grant. The default grant ID is `research-scout-smoke-2026-10-23`. Selecting a different configured grant ID does not create or authorize it. An operator may admit a later grant only after new user approval, within its stated limits and the remaining historical cap.

`research_model_readiness(owner=...)` checks the configured owner-bound grant, outstanding uncertainty, remaining generations/HTTP, conservative full-run spending bound and existing application allowance. It sends no request and creates no Research grant. Missing, exhausted or insufficient authority is reported as a blocker.

## Offline verification

```sh
cd backend
.venv/bin/pytest tests/research/test_framework.py tests/research/test_store.py -q
.venv/bin/pytest tests/pretest/ai/test_reliability.py tests/pretest/ai/test_safety.py tests/demo/test_allowance.py -q
.venv/bin/ruff check app/research/framework.py app/research/provider.py tests/research/test_framework.py
```

The focused framework/provider suite has 15 passing tests; with storage it has 26. It exercises the actual Deep Agents compiled graph and actual ChatOpenAI serialization against mock HTTP, full-schema counting, third-turn forced drafting, denial of a third-turn data-discovery escape, no hidden filesystem tools, no fourth generation, immediate draft completion, checkpoint reuse without replay, owner-bound durable grants, wrong-destination rejection, old classifier tool-denial preservation, uncertainty holds and all three spending boundaries. A further 57 existing provider-safety/reliability/allowance tests pass after installation. These checks make no real provider calls.
