# Agent framework options and verified Python behavior

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


**Status:** Research and new proposal; no framework integration, dependency change, provider call, or deployment was performed.  
**Checked:** 2026-10-23 against current official Python documentation and maintainer package metadata. These are documentation observations, not a tested compatibility matrix. Live documentation can change independently of a released wheel.

## Recommended direction

Use an explicit **LangGraph policy workflow** around a narrowly scoped **LangChain `create_agent` tool-selection loop** when a fixed workflow demonstrably lacks enough flexibility. Keep the application's authorization, no-repeat policy, cost reservations, generation fencing, validation, review, and commits outside model control. Evaluate Deep Agents later only if planning, large artifact context, or isolated specialist work solves a measured problem. This is an incremental choice of harness, not a requirement to deploy three frameworks or services together.

LangGraph distinguishes predetermined workflows from agents that choose processes and tools. LangChain's agent already runs on LangGraph; Deep Agents supplies a more opinionated harness above the same foundations. A graph can also contain ordinary Python and individual model calls. Therefore the choice concerns how much control flow the application defines and how much harness behavior it adopts, rather than three competing execution servers. [Workflows and agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents), [LangChain agents](https://docs.langchain.com/oss/python/langchain/agents), [Deep Agents overview](https://docs.langchain.com/oss/python/deepagents/overview).

**Proposed common loop:** an admitted user task → bounded tool/evidence choices → validated result → human review where required. The same mechanism can support Public Repository Research Scout (brief → public search → selected reads → comparison → reviewed shortlist), Personal Curator (existing repository → evidence → canonical candidates), Project Family Investigation (related-repository evidence → reviewable relationship proposal), and Maintenance Watch (approved public cohort → recent signals → reviewable report). Each gets its own scope, result schema, allowed catalog, receipts, and limits; a shared agent prompt does not grant all capabilities.

For the existing classification boundary, start with one ambiguous public repository. Scale to at most three only after the one-repository scenario passes safety and accounting checks. Successful analysis, including `NO_MATCH`, stops another planner call unless the explicit re-analysis policy authorizes the exact repository. For the public Scout, admit the search brief and bounded search/read budget before planning; keep discovered repositories in a **separate research collection**, never silently add them to My Repos or invoke classification on them. Scout deduplication uses task/source snapshot receipts; it cannot mint a different operation name to evade existing classification receipts. Public-product use becomes a reasonable local MVP candidate after the common read/auth/budget spike, without first adopting Deep Agents.

## Repository evidence and migration boundary

The current repository declares `langchain-core>=1.6.9` and `langchain-openai>=1.7.0` in the `ai-pretest` group, with Python `>=3.12,<3.15`; these lower bounds are neither installed-version evidence nor direct declarations of LangChain agents, LangGraph, Deep Agents, or an MCP server. Backend dependencies (original GitHub Manager source: `backend/pyproject.toml`).

The inspected classifier is a compact structured-output call. `BudgetedProvider.before` rejects wire payloads containing tools, stateful provider features, unexpected destinations, or unapproved tier settings; the provider sets `max_retries=0`, counts input tokens, reserves spend, and retains uncertain-outcome holds. Classification instructions also prohibit tools. A `create_agent` loop therefore needs a **new, separately audited provider execution mode**, not removal of the existing prohibition or a cosmetic wrapper around the present call. Current chains (original GitHub Manager source: `backend/app/pretest/ai/chains.py`), Provider boundary (original GitHub Manager source: `backend/app/pretest/ai/provider.py`).

Durable analysis receipts and finite budget holds already have application semantics. Reuse them as authorities; do not substitute a conversation checkpoint for an analysis receipt or a framework call counter for the monetary ledger. Analysis receipts (original GitHub Manager source: `backend/app/demo/analysis.py`), Run budgets (original GitHub Manager source: `backend/app/demo/run_budget.py`). The approved architecture likewise preserves GitHub fields, manual decisions, canonical IDs, and reset fencing. Approved system design (original GitHub Manager source: `docs/system-design.md`).

## Alternatives and tradeoffs

| Option | Useful behavior | Cost and correctness consequence | Decision / revisit condition |
| --- | --- | --- | --- |
| Existing Python pipeline plus structured model call | Fixed extraction, retrieval, classification, validation | Smallest change and easiest attempt accounting; cannot choose an unanticipated evidence step | Preserve as baseline and fallback; preferable when all useful paths are known |
| Bounded LangGraph workflow with individual model nodes | Explicit branches, resume and review boundaries | Additional state/persistence contracts; a graph alone does not make decisions autonomous | Establish policy control first; meaningful even without a dynamic agent |
| LangGraph policy plus bounded LangChain agent | Model selects useful tools/order for research, curation, family investigation, or maintenance evidence inside an allowed segment | Additional model turns and non-deterministic tool choices; requires a tool-capable audited transport | Recommended common experiment; adopt only if task quality/reviewer effort improves at an acceptable cost |
| Custom LangGraph model/tool loop | Full control over messages and tool dispatch | Fewer harness defaults but more loop, error, and structured-output code to own | Alternative if `create_agent` hides details needed for strict policy/accounting |
| Deep Agents harness for selected long tasks | Filesystem context, memory, optional planning, specialist delegation | Broader default capability surface and more paths that can spend or retain data | Deferred; choose it instead of a bespoke harness when measured needs justify it |

A plain LangChain agent can also run without an explicit outer graph if application code provides all required policy boundaries. For this product, the reviewable reset, retry, and spend invariants favor explicit workflow states. This is a project recommendation, not a framework requirement. LangGraph v1 recommends `langchain.agents.create_agent`; its older `langgraph.prebuilt.create_react_agent` is deprecated. [Migration guide](https://docs.langchain.com/oss/python/migrate/langgraph-v1).

## Verified state, context, and memory contracts

`StateGraph` defines shared state, nodes, and fixed/conditional edges. Nodes are ordinary functions; state keys use reducers when specified, otherwise updates replace values. The graph runtime does not make arbitrary state fields trusted. Proposed authority fields such as the exact cohort and remaining approved scope should be controlled by the application, with agent output copied through an explicit schema adapter. [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api).

LangChain runtime context provides invocation-scoped dependency injection using `context_schema` and `context=...`. Tools can access runtime context, store, and execution identity through `ToolRuntime`. Context is distinct from evolving graph state and is not a persistence mechanism. [Runtime](https://docs.langchain.com/oss/python/langchain/runtime).

| Proposed location | Contents | Trust / lifecycle rule |
| --- | --- | --- |
| Graph state / checkpointer | Run ID, immutable cohort reference, evidence references/hashes, proposed outcome, bounded progress and counters | Compact serializable recovery state; never authority for a stale permission or grant |
| Invocation context | Authenticated actor/workspace, capability adapter, policy and budget service handles | Reconstruct from trusted server code on every invocation/resume; do not store tokens in checkpoints |
| Application repositories | Canonical taxonomy, manual decisions, receipts, grants, operation idempotency, generation/epochs | Existing application authority; read fresh at every effect boundary |
| Optional cross-thread store | Approved preferences or derived research notes with provenance/version/expiry | Optional convenience; no second canonical registry and no automatic promotion to user decisions |

Checkpointers save thread-scoped graph snapshots; stores hold application-defined data across threads. Supplying a `BaseStore` does not checkpoint execution, and supplying a checkpointer does not establish global organizational memory. Namespaces are a storage partition mechanism; application authorization still decides which namespace a caller can access. [Persistence comparison](https://docs.langchain.com/oss/python/langgraph/persistence), [Stores](https://docs.langchain.com/oss/python/langgraph/stores).

**Proposed persistence choice:** use in-memory checkpoints for deterministic unit fixtures and a separately scoped `AsyncSqliteSaver` file for the first local restart/interrupt experiment. The official reference describes SQLite as a local option and does not recommend async SQLite for production. A durable cloud saver remains an explicit later decision; this research did not verify a DynamoDB adapter. Do not introduce PostgreSQL or migrate application tables merely because an example uses it. A custom saver requires the full checkpoint/pending-write/async contract and conformance testing. [Checkpoint saver reference](https://reference.langchain.com/python/langgraph/checkpoints), [Saver interface](https://reference.langchain.com/python/langgraph.checkpoint).

## Interrupts, replay, and effects

`interrupt()` needs a checkpointer, a `thread_id`, and a JSON-serializable payload. Resume uses `Command(resume=...)` with the same thread. The interrupted node starts again; side effects before the interrupt may execute again. Interrupt ordering within a node must remain stable across resume, and interrupts must not be swallowed by broad exception handling. [Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts).

A historical checkpoint replay reruns nodes after the selected checkpoint, including model/API calls and interrupts. Checkpoint durability modes are `exit`, `async`, and `sync`: `exit` loses mid-run recovery; `async` allows a crash window; `sync` persists before the next step at a latency cost. Checkpointing is not a guarantee of exactly-once external effects. [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers).

**Proposed effect discipline:**

1. Put approval in its own node and keep the dynamic agent read-only. Recheck actor, repository access, private-content policy, canonical revision, grant, and reset generation after resume and before any new request or commit.
2. Give every externally visible operation a durable application idempotency key derived from run/workspace/operation/input version. A checkpointer and application transaction are separate failure domains; recover the committed operation from its receipt if a crash occurs between them.
3. Claim the repository and check durable analysis receipts **before** planner construction, token counting, and inference. Reapply the guard before each classification-capable operation and at commit. Do not let another tool name bypass it.
4. Keep uncertain paid outcomes reserved. A transport timeout is not evidence that no generation occurred. Resume/replay may reconcile a receipt; it must not silently authorize another paid request.
5. Bind approval to exact proposed payload, cohort, revisions, generation, and expiry. A resumed framework interrupt is delivery of an answer, not proof of current application authorization.

Tasks can isolate work within a node: completed task results can be reused on resume, whereas ordinary node code reruns. They reduce repeated work but do not remove the failure gap between an external effect and recording its result. The Functional API is a smaller integration alternative if explicit graph structure proves unnecessary. [Functional API](https://docs.langchain.com/oss/python/langgraph/functional-api), [Use tasks](https://docs.langchain.com/oss/python/langgraph/use-functional-api).

## Dynamic tools, structured output, and recovery

LangChain tools have typed input schemas. Pre-registered tools can be filtered per model call with middleware; tools added at runtime need both model exposure and execution handling via `wrap_tool_call`. `ToolRuntime` supplies trusted context without making workspace identity an unconstrained model argument. Filtering a model-visible catalog is useful context control; server-side authorization remains necessary for every invocation. [Tools and dynamic selection](https://docs.langchain.com/oss/python/langchain/tools).

`create_agent(response_format=...)` returns validated output in `structured_response`. `ProviderStrategy` uses native output support; `ToolStrategy` uses tool calling and can feed validation errors back for another model turn. Passing a schema type permits automatic strategy selection; JSON Schema dictionaries require an explicit strategy. Tool calling and native structured output must work together for the selected model. `ProviderStrategy.strict` requires LangChain >=1.2; capability profile selection is documented for >=1.1. [Structured output](https://docs.langchain.com/oss/python/langchain/structured-output).

**Proposed schema policy:** choose the strategy explicitly in the compatibility spike; do not silently switch to a tool-based repair path or a different model. Keep the current deterministic registry-ID, evidence-ID, protected-decision, cardinality, and stale-input validators after framework parsing. Structured syntax does not establish factual support or authority. Charge every schema repair/model retry against the same grant; exhausted repair ends in review/failure, not another automatic budget.

Current middleware includes `ToolErrorMiddleware` (requires >=1.3.14), model/tool retry, and model/tool call limits. Error middleware can sanitize an exception into a model-visible failed tool message; returning `None` propagates it. Model limits default to no limit unless configured. A global tool limit defaults to continuing with error messages, so reaching that cap alone need not end the model loop. [Prebuilt middleware](https://docs.langchain.com/oss/python/langchain/middleware/built-in).

**Proposed recovery policy:** only argument/evidence-selection errors are model-recoverable, with a finite repair allowance. Treat grant exhaustion, revoked access, policy denial, generation mismatch, and unresolved paid outcomes as terminal host decisions. Retry bounded idempotent reads on transient errors; do not stack SDK, middleware, graph-node, and queue retries without counting actual HTTP attempts. Graph recursion limits, model turns, tool calls, tokens, dollars, elapsed time, and concurrent work require separate ceilings. A failed tool message must not suggest a policy workaround.

## MCP adapters and client lifetimes

The current LangChain Python entry point is beta `langchain.mcp.MCPAdapter`, requiring `langchain[mcp]>=1.4.0` and built on FastMCP. `list_tools()` adapts a server catalog for `create_agent`. Beta status and dependency pinning matter even though the surrounding LangChain APIs are stable. [MCP overview](https://docs.langchain.com/oss/python/langchain/mcp).

The adapter connects for discovery inside `async with`; returned tools retain the client and remain callable after discovery exits. A tool call acquires/releases the client by default. Keeping the adapter open around invocation reuses a connection across calls. These are **client lifecycle** statements; they do not mean every MCP protocol era has server-side sessions. Modern-era discovery differs from legacy initialization. A multi-server `MCPConfig` shares a negotiated era; `ClientGroup` or one adapter per server permits independent eras/authentication. [Connections and protocol eras](https://docs.langchain.com/oss/python/langchain/mcp/connections).

The new adapter does not expose the former `get_prompt`, `get_resources`, or `session` methods. The official migration guide describes the replacement APIs. The standalone `langchain-mcp-adapters` repository was archived on 2026-09-17; its old `MultiServerMCPClient` examples are historical compatibility references. If retained briefly, `get_tools()` creates per-call sessions; tools created with `load_mcp_tools(session)` must be used while that session remains valid. Do not mix these lifetimes with `MCPAdapter` semantics. [Migration guide](https://docs.langchain.com/oss/python/migrate/langchain-mcp-adapters), [Archived adapter repository](https://github.com/langchain-ai/langchain-mcp-adapters).

MCP server `isError=True` becomes `ToolMessage(status="error")`; transport/session failures raise. Structured MCP data is attached as `artifact["structured_content"]`, rather than automatically becoming model-visible text. **Proposed adapter rule:** validate the artifact against the application contract and explicitly produce bounded evidence content with provenance. Audit both successful content and errors before another model turn. Do not infer permissions from optional tool annotations or expose an entire discovered catalog automatically. [MCP tool outputs and errors](https://docs.langchain.com/oss/python/langchain/mcp/tools).

## What Deep Agents adds, and when to use it

Current Deep Agents provides filesystem/context-management and delegation capabilities atop the LangGraph runtime. **Since v0.7, task planning is opt-in** via `TodoListMiddleware`/`write_todos`; older descriptions of planning as always enabled are inaccurate for the current line. A TODO list is progress state, not an authoritative application workflow or spend grant. [Deep Agents core capabilities](https://docs.langchain.com/oss/python/deepagents/overview).

The default `StateBackend` filesystem is thread-scoped state retained through the configured checkpointer. `FilesystemBackend` touches a real local root; `StoreBackend` supports cross-thread files; `CompositeBackend` routes paths. Shell-capable backends expand available effects. **Proposed constraint:** if evaluated, use a scoped virtual backend for approved compact artifacts, explicit per-workspace namespaces, and no shell or arbitrary host filesystem. A filesystem interface is not itself sandbox isolation. [Backends](https://docs.langchain.com/oss/python/deepagents/backends).

Subagents default to isolated task context; optional fork mode inherits context, requires >=0.7.13, and is beta. A default general-purpose subagent exists. Current docs remove the synchronous `task` tool by disabling the active harness profile's general-purpose subagent **and** supplying no custom synchronous subagents; `subagents=[]` alone is insufficient. **Proposed constraint:** use an explicitly named small specialist set only after evaluation, with shared host grants and bounded fan-out. Context isolation does not imply a separate security boundary or free inference. [Subagents](https://docs.langchain.com/oss/python/deepagents/subagents).

Deep Agents memory consists of files controlled by a backend; files can be loaded into prompts or read on demand, and writable memory can be updated by the agent. **Proposed constraint:** canonical taxonomy, accepted/rejected mappings, privacy policy, grants, and no-repeat receipts remain authoritative application records. Agent-authored memory is a versioned proposal with provenance and expiry, not permission to overwrite those records. [Memory](https://docs.langchain.com/oss/python/deepagents/memory).

Evaluate this richer harness only when the simpler bounded agent repeatedly needs large persistent research artifacts or isolated specialist contexts, and when those additions beat simpler prompt/evidence improvements on cost and review effort. It can replace the inner custom harness for that workflow; there is no reason to wrap a Deep Agent in another tool-selection agent merely to include both names.

## Concrete compatibility baseline to investigate later

The following is a **candidate for a separately approved isolated spike**, not a claim of installed compatibility or a request to change dependencies now:

| Component | Candidate / observed requirement | Evidence and caveat |
| --- | --- | --- |
| Python | 3.12 for initial spike | Within this repo's declared range; verify the exact interpreter and platform in the spike |
| LangChain | `langchain==1.4.7` | Maintainer PyPI release dated 2026-10-21; Python >=3.10,<4. [Package metadata](https://pypi.org/project/langchain/1.4.7/) |
| LangGraph | `langgraph==1.2.16` | Maintainer PyPI release dated 2026-10-16; Python >=3.10. [Package metadata](https://pypi.org/project/langgraph/1.2.16/) |
| MCP integration | `langchain[mcp]==1.4.7`, only when testing MCP | Current namespace requires >=1.4.0; lock its exact compatible FastMCP/MCP dependencies after resolution rather than separately assuming protocol interoperability |
| GHM MCP server | `mcp==2.3.0` as the companion server candidate | Official SDK release dated 2026-10-02. Its `MCPServer` API is distinct from the separate FastMCP package used by LangChain's adapter; prove interoperability rather than assuming identical libraries. [SDK package metadata](https://pypi.org/project/mcp/2.3.0/), [MCP integration proposal](mcp-integration.md) |
| Local checkpointer | Exact compatible `langgraph-checkpoint-sqlite` release to be selected and locked in spike | Async saver for local restart tests only; no new cloud database decision |
| Deep Agents | Omit initially; compare `deepagents==0.7.30` only in the later harness experiment | Maintainer PyPI release dated 2026-10-22; Python >=3.11,<4, beta classifier. [Package metadata](https://pypi.org/project/deepagents/0.7.30/) |
| Existing provider/core | Preserve behavior first; resolve exact compatible versions in isolation | Current lower bounds do not prove compatibility with the candidate agent stack; review the full dependency diff before adoption |

LangChain describes semantic versioning for stable APIs while beta APIs can change. Pin all direct and transitive versions in the experiment lock; record Python, provider model, prompt/schema/tool catalog versions, protocol era, serializer, and fixture hashes. Re-run contract/recovery fixtures for an upgrade before changing the application environment. Do not use unbounded `-U` installation as the production strategy. [Versioning policy](https://docs.langchain.com/oss/python/versioning).

## Incremental acceptance path

1. **Policy and compatibility spike, offline:** resolve the candidate stack in an isolated environment; use fake model and MCP fixtures to verify tool schemas, output strategy, error mapping, and one agent invocation. Importing packages must make no provider calls. Preserve the present provider path and privacy behavior.
2. **Explicit graph, offline:** implement admission → scope snapshot → evidence/candidate preparation → bounded decision segment → deterministic validation → review/commit boundary. Demonstrate duplicate delivery, no-repeat, stale grant, reset during run, interrupted approval, crash after application commit but before checkpoint, and uncertain paid outcome without paid requests. Any cloud persistence decision remains deferred.
3. **One bounded user outcome, paid only under a future finite grant:** compare the current fixed path with the bounded dynamic agent on the same admitted ambiguous repository; alternatively test one Scout brief that creates a reviewed public shortlist in its separate research collection. Count every planner, finalizer, repair, selector, subagent and provider attempt; require evidence-backed output and a readable trace of tool choices. A valid classifier `NO_MATCH` is completed analysis, not a reason to keep searching. The Scout must distinguish absent/insufficient evidence from a negative product claim.
4. **At most three repositories:** only after the first case passes, validate shared grant contention, partial successes, independent receipts, per-repository limits, restart, and protection of manual/rejected decisions. Expand scope only from an exact previewed cohort.
5. **Optional Deep Agents comparison:** compare against the same cases and controls. Adopt only capabilities with measured benefit; retain the fixed pipeline as a supported baseline/fallback.

Unresolved until those experiments: the exact transitive version lock, selected model's simultaneous tools/structured-output behavior, current HTTP wire and retry accounting, concrete MCP server/auth/protocol compatibility, local saver migration behavior, durable cloud saver, and whether dynamic selection improves user outcomes enough to pay for extra turns. No production-readiness or quality claim follows from this documentation review.
