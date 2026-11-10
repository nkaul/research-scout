# From repository organizer to evidence-backed investigation agent

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


**Detailed proposal · 23 October 2026 · not implemented**

## 1. The opportunity

GitHub Manager's current AI path is useful when the task is known: prepare evidence, shortlist approved labels, ask for structured selections, validate, then let the user review. It becomes less useful when **the next useful step is unknown**. A vague README might require a documentation overview; a possible project relationship might require inspecting an explicit link; an incomplete search might require a revised query. A fixed pipeline either guesses from insufficient context or needs a developer to add another branch.

An agent can make those bounded choices. The proposed product is not “chat with your repositories.” It is **give the system a concrete investigation, watch it gather justified evidence, and review a useful saved result**. The [product portfolio](product-direction.md) covers public research and personal organization, not just internal classification maintenance.

Keep the current fixed pipeline for routine work. Agentic investigation is a separate, explicitly admitted task profile, used when additional investigation can plausibly change the outcome. More tool calls are not inherently a better answer.

## 2. What exists, and what does not

| Capability | Current implementation | Proposed addition |
| --- | --- | --- |
| GitHub identity/access | OAuth App adapter and server-side, in-memory credentials | MCP connection broker with explicit identity/grant compatibility checks |
| Evidence | Local Evidence Parser, selected README passages, E0 metadata, RAKE phrases, saved profiles | Explicit acquisition outcomes; bounded selected supporting-document reads and agent-directed passage choices |
| Label lookup | Fixed sparse canonical retrieval with name/alias boost | Agent can request an additional approved search/definition lookup when evidence justifies it |
| Generation | Schema-bound taxonomy/classification calls | Multiple bounded decision turns whose tools and next actions depend on observations |
| State | SQLite aggregates, jobs, previews, manual decisions, durable analysis receipts and cost ledgers | Agent thread checkpoints, task/step journal, source references and review/operation receipts |
| Human review | Taxonomy publish and assignment accept/reject | A resumable agent-task review showing the exact proposed result/change and supporting evidence |
| Recovery | Durable local jobs, generation/epoch fences, no-repeat and uncertainty accounting | Per-step replay rules, MCP error classification, idempotent proposal/apply and interrupt resumption |
| MCP/agent frameworks | No application MCP server, LangGraph or Deep Agents integration found | Two MCP connections and a governed agent runtime, after compatibility gates |

The code evidence is in the source audit (original GitHub Manager source: `agentic-design/research/codebase-use-cases.md`). The canonical account of the present classifier remains Inside the GitHub Manager AI Pipeline (original GitHub Manager source: `docs/github-manager-ai-pipeline.md`). The approved cloud architecture remains system-design.md (original GitHub Manager source: `docs/system-design.md`); local SQLite here does not silently replace the DynamoDB/SQS target.

Two gaps deserve early attention:

1. `ensure_profile()` falls back to metadata-only extraction for several different README failures. An investigator needs typed acquisition status—missing, access denied, oversized, transient failure or parsed—before deciding whether another read is useful.
2. `BudgetedProvider.before()` rejects payloads with tools. A generic LangChain/Deep Agents client must not bypass its transport, privacy, cost and retry controls. Agent execution requires a new audited gateway and mode; leave the existing classifier contract intact.

## 3. What makes the proposed system genuinely agentic

### A concrete task

An authenticated user selects one verified public repository and asks:

> “Explain its main purpose and whether the proposed capability label is supported. Inspect another source if the current evidence is insufficient. Ask me before saving a final brief or changing organization.”

The following is a **proposed illustrative trace**, not a recorded run:

| Step | Observation available to the agent | Possible decision | System-controlled effect |
| --- | --- | --- | --- |
| Admission | Exact repository, current receipt, allowed public content, remaining grant | No model decision yet | Deny unauthorized repeat work or show a reviewed fresh-work preview |
| Inspect | E0 exists; README acquisition is marked transient failure | Read the pinned README through an allowed GitHub MCP action | Executor verifies public identity, allowed path, size and remaining tool quota |
| Observe | README introduces the product but a candidate capability appears only in an example | Inspect a relevant documentation heading or ask a precise question | Only a bounded allowed document/section is returned; no arbitrary browsing |
| Reassess | Additional passage distinguishes core purpose from optional integration | Look up the exact canonical definition, then prepare a brief/proposal | Host validates existing IDs and source references |
| Review | Proposed claims/labels, current labels, evidence and unknowns | Model requests human handoff | Task checkpoints in `WAITING_HUMAN`; no accepted mapping changes |
| Resume | User approves or corrects the concrete result | No autonomous reinterpretation of approval | Deterministic executor rechecks versions, applies allowed local effect once and records a receipt |

Different observations produce different paths: a complete profile may need no network read; a revoked permission requires sign-in, not another search; sufficient negative/absent evidence may justify an unresolved result. The second action depends on the first observation. That is the distinction from an unconditional chain of two model calls.

RAG remains useful **inside** this process. Retrieval supplies source evidence and canonical candidates. It does not by itself provide control flow, capability enforcement, durable recovery or approval semantics. Conversely, an agent that only makes many ungrounded calls would be worse than the existing fixed RAG classifier.

## 4. Recommended technical approach

### Option A: LangGraph with a bounded LangChain agent — preferred candidate

Use an explicit outer graph for admission, scope snapshots, task leasing, review interrupts, recovery and application effects. Within its investigation segment, a LangChain `create_agent` instance receives a small normalized tool catalog and chooses the next tool or a typed final result.

Do not give the inner agent authority fields it can mutate. Treat its output as a proposal. Before each model attempt and tool execution, trusted host code reads current permission, counters, receipt/admission status and fences. The graph does not have to be a separately deployed Agent Server: the initial implementation is local FastAPI plus one agent worker.

LangChain agents already use LangGraph. The proposed outer graph exists to make GitHub Manager's policy states explicit, not because every request requires stacked orchestration frameworks. [Framework architecture sources and limits](../research/framework-options.md).

### Option B: an explicit structured-action loop — accounting-first fallback

If the native tool-calling adapter cannot expose every physical request and side effect for inspection, use a small LangGraph loop in which the model returns a strict `NextAction` object. Host code maps its approved action name/arguments to an MCP call, records the observation, then invokes the model again when allowed.

This is still agentic: the model selects the next action after observations. It makes more loop and message code the application's responsibility, but keeps accounting and tool validation explicit. It is not permission to mislabel these calls as the existing one-shot classifier to evade its wire restrictions or no-repeat receipts.

### Option C: Deep Agents — a later harness experiment

Deep Agents is attractive for longer comparative research: progress plans, larger artifact context and isolated specialists can reduce repeated context assembly. A Public Scout might delegate one narrowly scoped reader per candidate and retain a structured comparison notebook.

The tradeoff is a wider default capability surface, extra context persistence and potentially multiplied calls. Current Deep Agents behavior is version-sensitive: task planning is opt-in in the current v0.7 line; default delegation must be disabled explicitly if unused. Filesystem backends and “memory” are not application authorization. The [framework research](../research/framework-options.md) documents the verified distinctions.

Evaluate Deep Agents **instead of the inner custom harness** for a selected task profile after the single-agent baseline. Do not wrap one tool-selection agent around another general agent. If enabled, use only a scoped virtual artifact backend, no shell, no arbitrary host filesystem, a small named specialist set and one shared host budget.

### Other alternatives

| Approach | Why it remains an option | Why it is not the initial recommendation |
| --- | --- | --- |
| Improve the current fixed pipeline only | Best for predictable extraction/retrieval gaps and deterministic defects | Cannot investigate unfamiliar evidence needs without more programmed branches |
| Plain LangChain agent with application middleware | Fewer outer graph nodes; reasonable for short read-only research | The current product has enough pause, grant, reset and commit semantics to benefit from explicit states |
| Separate autonomous service/cloud agent platform | Could isolate scaling and deployment later | Adds infrastructure/auth/persistence choices before proving product value |
| Broad multi-agent swarm | Can parallelize independent reading | Adds failure, budget, reconciliation and trust problems before a one-agent task is proven |

The design principle is to earn complexity through useful outcomes. The workflow/agent distinction is consistent with [Anthropic's discussion of predefined workflows versus model-directed processes](https://www.anthropic.com/engineering/building-effective-agents); its historical tooling examples are not our package-selection authority.

## 5. MCP serves two different jobs

**Existing server: official GitHub MCP.** Its narrow role is upstream source acquisition: approved public searches and repository/document reads. The existing REST/GraphQL sync adapter remains authoritative for connected inventory and relationship semantics. MCP search does not redefine My Repos.

**New server: GitHub Manager MCP.** Its role is workspace knowledge and local operations: approved registry definitions, profiles, manual decisions, research drafts and review previews. It delegates to application services, not direct SQL or arbitrary internal endpoints.

Both are called through a **host-owned Tool Gateway**. Only approved wrappers reach the model. Every result—including a third-party server's result—is validated, access checked, source bound, size limited and privacy filtered before it enters the next model context or retained trace. MCP server tool descriptions and optional read-only annotations are not sufficient enforcement.

The existing OAuth App remains the account model. The official remote server's registered-client requirements and the exact compatibility of the existing grant need an access spike. A separately disclosed local stdio OAuth flow is a fallback; switching to a PAT or GitHub App is not automatic. There is no claim that the tools available to a development agent already exist in the application. [MCP research and sources](../research/mcp-integration.md).

## 6. Boundaries of autonomy

| Agent may do within an approved task | Human or deterministic application authority retains |
| --- | --- |
| Choose among scoped public read/search tools | Identity, workspace, authorized cohort and credential selection |
| Choose an additional allowed passage or query | Tool catalog, source/path/network allowlists and privacy boundary |
| Compare observed evidence with user requirements | Limits, remaining money and whether a new paid attempt is authorized |
| Stage an evidence-backed brief or proposal | Accepted taxonomy, USER memberships and rejection tombstones |
| Ask a precise question or end unresolved | Approval, access/scope expansion, explicit fresh re-analysis and resumption |
| Recommend a separately reviewed taxonomy addition | Publishing/merging/archiving taxonomy and resetting data |

The first release has **no GitHub writes, arbitrary shell, code execution, automatic package installation, secret access, budget changes or automatic taxonomy publication**. An approval prompt is not an access control; the server must enforce the approved operation independently.

For Research Scout, permission to research permits temporary source/proposal storage, not a public share or accepted personal organization. For Curator, permission to inspect permits a draft, not a USER mapping. Public artifacts need their own redacted export preview and explicit publication action later.

## 7. State and memory without a second source of truth

1. **Application state:** repository metadata, registry, manual decisions, analysis receipts, task grants and operation receipts. These are authoritative.
2. **Agent checkpoint:** which step is next, evidence/artifact references, bounded messages, pending interrupt and counters. This supports continuation, not permission.
3. **Approved reusable knowledge:** user-confirmed preferences or research notes with provenance, version and expiry. Add only when there is a product use case.

No credential or refresh token belongs in any checkpoint or note. A reference to an old public document does not make it safe to resend after the repository becomes private or access is revoked. An agent-written note cannot become a policy instruction or canonical concept without the relevant approval.

Use a file-backed local LangGraph checkpointer in a separate private agent-state database. In-memory savers are fine for unit tests but fail the restart acceptance criterion. A checkpoint transaction and an application mapping transaction are not automatically atomic; the operation journal/idempotency design in [architecture.md](architecture.md) handles that gap. LangGraph distinguishes thread checkpoints from cross-thread stores in its [persistence documentation](https://docs.langchain.com/oss/python/langgraph/persistence).

## 8. Reliability is part of the product

The system should say “waiting for sign-in,” “source unavailable,” “waiting for review,” or “previous paid outcome unknown.” It must not silently hang, pretend a skipped action succeeded, or start the same costly operation because a browser refreshed.

Retries belong to the host. GitHub rate limiting is different from permission denial; a missing README is different from an expired token. An ambiguous provider timeout is different from a confirmed no-charge rejection. Resume rechecks current identity, source versions, manual decisions and remaining authorization before any effect.

The [architecture](architecture.md) defines these states and the [evaluation plan](evaluation-plan.md) makes them release gates. Long-running agent research also emphasizes durable handoff artifacts; the relevant lesson is explicit progress and verification, not adoption of a coding-agent filesystem or general shell. [Anthropic harness discussion](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).

## 9. Value and go/no-go decisions

Measure useful outcomes against the present fixed flow: supported claims, justified labels/relationships, reviewer correction effort, abstention quality, total attempts/tokens/cost and recoverability. Do not celebrate an agent for using more tools. Existing RAG evaluation results are a baseline for components, not evidence that the proposed agent works.

Approve implementation incrementally. Begin with the access/compatibility/accounting gates and one-repository Investigator. Choose Scout or Curator as the next product profile only after the shared loop produces a trustworthy saved result. Deep Agents and multi-agent work remain options to test, not prerequisites for an end-to-end agent.
