# Incremental implementation plan

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


**Proposal only · 23 October 2026.** Use the gates below rather than a calendar promise. No phase has been implemented or verified by this design. Earlier Phase 0/0.5/0.9 readiness, corpus, benchmarks and recent bug fixes remain preserved.

## A0 — Prove the risky interfaces before building the product

**Outcome:** a small compatibility report that states which framework, MCP, OAuth and provider paths actually work.

### Work

- Resolve the [candidate dependency baseline](../research/framework-options.md#concrete-compatibility-baseline-to-investigate-later) in an isolated environment; do not upgrade the application's environment in place. Record exact direct/transitive versions and protocol capabilities.
- Use fake models and two fixture MCP servers to prove bounded action dispatch, structured outputs/errors, output filtering, cancellation and parent ASGI lifespan. Exercise the actual chosen SDK/client versions.
- Freeze a narrow GitHub MCP read catalog and test the GHM server's principal/task/audience-bound capabilities. Check cross-owner and expired-grant rejection.
- Separately test the registered OAuth App/hosted GitHub MCP path with the user's approved sign-in. Match numeric identity and effective scope. If incompatible, document the exact failure and propose the disclosed local stdio OAuth alternative.
- Audit a new model execution mode without making a generation: tool/request schema, privacy filter, model/token ceilings, input counting, full attempt interception, retries disabled and conservative reservation.
- Verify that the proposed model supports the required structured/tool behavior. A live probe, if necessary, needs an approved finite grant; a package import or mock response is not a live capability result.

**Gate:** exact lock and capability/schema manifest; both fixture MCP connections; denied bad capabilities; zero secret/private-text leakage; documented real GitHub MCP connection result or explicit blocker; no weakening of the existing provider restrictions. Preserve a working classifier regression baseline.

**Decision:** choose native bounded `create_agent` if it is observable/accountable; otherwise choose the explicit structured-action loop. Neither choice authorizes more tools or money.

## A1 — Make a durable agent task work with simulated observations

**Outcome:** a task can choose different next steps, pause, resume and recover without making external or paid calls.

### Work

- Add trusted task admission/preview, exact scope, finite grants, task leases, step journal and operation receipts.
- Implement the outer LangGraph states and one inner dynamic decision segment. Use deterministic fake-model responses to test observation-dependent branches; label this simulation clearly.
- Add file-backed local checkpoints under ignored private storage. Keep credentials out of state; rebuild principal context at invocation/resume.
- Extract shared context/proposal/preview/apply service functions from current route closures where needed. UI and MCP must call the same domain invariants.
- Add the minimal GHM MCP context, draft, preview and receipt tools. Keep apply unavailable to the model, with an executor-only capability and exact-plan approval.
- Add a compact task page: progress, inspected sources, unknowns, cost/call counters, clear pause/retry states and review. Use the existing indigo/white selected-state UI, compact controls and searchable inputs.
- Prove crash windows: before dispatch, after response, after domain commit before checkpoint, and during human interrupt. Recover known results by operation identity; park uncertain paid outcomes without repeating them.

**Gate:** the deterministic suite in [evaluation-plan.md](evaluation-plan.md) passes; repeat delivery/resume does not duplicate an effect; reset/manual/source/access changes are correctly handled; a fake trajectory is not reported as live agent intelligence.

## A2 — One real repository, two MCP servers, a human-approved saved result

**Outcome:** an Evidence Investigator performs one real end-to-end task in the current local app.

### Work

- User chooses one verified public repository, a question and exact allowed effects. Use a genuinely new admitted task or explicitly approved fresh re-analysis with reason; completed/uncertain analysis cannot be bypassed through a planner.
- Preview all limits and remaining cumulative allowance. Propose a separate live pilot grant of at most $1 total, subject to remaining historical limits and explicit user approval. Stop and request a new concrete grant if the evidence requires more.
- Use the working real GitHub MCP path for one necessary source read and GHM MCP for current context/draft/review. Prove an observation-dependent second action on an appropriate task.
- Produce a source-backed brief and, only if admitted, an existing-ID mapping proposal. Do not create/publish taxonomy as a side effect.
- Pause for the human to inspect claims/sources/current labels and approve, edit or reject the exact result/change.
- Resume with current auth, fence, evidence and plan checks; persist the saved brief or approved local mapping plus operation receipt. Refresh and restart to confirm it remains visible.
- Run a separate controlled recovery case: tool failure, reauth or checkpoint interruption. Fault injection can use a proxy/fixture; distinguish it from a naturally occurring live failure.

**Gate:** a real sanitized transcript proves both MCP integrations, dynamic next-action choice, typed failure handling, durable human handoff and one visible saved result. Record actual tokens, provider HTTP attempts, GitHub/tool attempts, cost/holds and residual limitations. Retain the original fixed workflow as fallback.

This is the first approval-sized delivery. It is **not** a public deployment, a 600-repository autonomous run, or a complete annotation/evaluation system.

## A3 — Choose the first full product workflow

| Branch | Deliverable | Scope and gate |
| --- | --- | --- |
| **A3-S: Research Scout — recommended public-facing branch** | Brief → bounded search → at most three deep reads → role-aware comparison → human-reviewed shortlist | Separate private Public Research collection; no automatic My Repos/Favorites import; fit claims have citations/unknowns; sharing is a separate explicit action |
| **A3-C: Workspace Curator — connected branch** | Selected cohort → receipt/reuse checks → bounded investigation → existing-ID proposals → review/accepted local mappings | At most three repositories initially; per-repo partial success; multi-label facets/derived Domains intact; no-repeat and manual decisions protected |

Implement one first rather than mixing their state semantics. Compare outcomes with the current fixed flow and human baseline. A public README can be used as evidence; the user's private preferences, account associations or review notes are not automatically public export material.

Add Project-family Detective after explicit relationship-evidence evaluation. For Maintenance Watch, start with an on-demand snapshot comparison before approving recurring schedules/spend. Annotation assistance stays in a new development-only lane, outside frozen reference labels and held-out tests.

## A4 — Evaluate deeper planning/delegation, only when useful

**Outcome:** a fair comparison of the bounded baseline with a constrained Deep Agents profile.

Test a scope-limited virtual artifact notebook, optional plan tracking and at most two named read-only specialists. No arbitrary shell/filesystem, automatic memory promotion or independent child budgets. Parent and children share the same grant, tool quotas and privacy policy. If the approved call budget cannot fund a fair comparison, do not run it or claim a winner.

Adopt only if the same cases show a useful improvement in supported results or human effort without unacceptable cost, latency or failure growth. Keep the simpler runtime if better evidence selection or deterministic logic solves the problem.

## A5 — Production hardening and optional public hosting

Defer cloud agent deployment, durable encrypted credential storage, multi-process execution/checkpointers, external GHM MCP clients, anonymous public usage, public sharing and recurring notifications until the local product is proven. Reconcile any new checkpoint/storage adapter with the approved DynamoDB/SQS target; do not introduce managed infrastructure solely because a framework example uses it.

An externally consumable MCP server requires standards-compliant OAuth/resource discovery/consent and independent security tests. A public anonymous product needs per-user quotas, abuse controls, cost ownership and export privacy rules. These are different approval scopes from local tool integration.

## Proposed implementation touchpoints

| Location | Proposed work; not created in this design |
| --- | --- |
| `backend/app/agentic/` | Task schemas, graph, policy, model/tool gateways, step executor, journal and approval service |
| `backend/app/mcp/` | GHM server, capability verification, context-bound tool wrappers and source/result schemas |
| `backend/app/demo/` | Shared service facade, typed evidence acquisition and atomic approved-operation receipt integration; preserve existing domain behavior |
| `backend/app/local.py` | Compose MCP lifespan, task API and agent worker; keep existing auth/CSRF/session boundaries |
| `backend/tests/agentic/` | Fake model, two-owner MCP fixtures, recovery/fault tests and trajectory assertions |
| `frontend/src/components/workspace/` | Compact task launch/review/status view, source inspector and human reply/resume actions |
| `frontend/tests/demo/` | Isolated task/review/auth recovery tests on test-only ports; never fixture-login on normal app ports |
| `backend/.env.example` | Non-secret agent/MCP configuration template; real credentials remain in local `.env` |
| `docs/validation/private/agentic/` | Runtime/checkpoints/pinned permitted evidence/sanitized traces and grants; already ignored by Git; trusted source retention is separate from model-visible traces |
| `agentic-design/validation/` | Sanitized Markdown readiness/evaluation reports and manifests created during later approved work |

Proposed configuration includes `AGENT_ENABLED=false`, validated `AGENT_ENGINE`, explicit `OPENAI_AGENT_MODEL`, per-task attempt/token/time/cost limits, approved MCP server identities and internal GHM audience. Values and names need implementation validation; this proposal does not edit `.env`, select a new model or infer credential availability.

## Preservation and rollback

- Keep current account/review data, completed-analysis receipts, experiment ledgers and all prior corpus/eval versions intact.
- Add explicit schema versions and forward migrations for new task tables. Test rollback with a local copy before changing the real app database.
- Feature-flag the agent path. Disabling it stops new agent admissions while leaving manual organization and the current fixed AI workflow usable.
- Avoid broad provider/dependency upgrades in the same change as UI/domain refactoring. Validate the isolated lock and review the dependency diff first.
- Each phase publishes its exact evidence and unresolved gates; no phase inherits a “passed” result merely because an earlier access or unit test passed.
