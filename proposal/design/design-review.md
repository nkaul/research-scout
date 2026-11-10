# Design review, decisions and remaining gates

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


**Reviewed: 23 October 2026.** This records design completeness, not a passing implementation test.

## Recommendation register

| Decision | Recommended default | Alternative / revisit trigger |
| --- | --- | --- |
| Product direction | Shared Investigator foundation; Scout flagship and Curator connected workflow | Build Curator before Scout if immediate personal organization has priority |
| First scope | One verified public repository and one reviewed saved result | Expand to three only after cost/recovery/safety gates |
| Agent boundary | LangGraph policy states plus bounded LangChain investigator | Explicit structured-action loop if native adapter accounting is inadequate |
| Deep Agents | Evaluate later for larger artifact context/specialists | Adopt as inner harness only after a fair bounded comparison |
| Existing MCP server | Official hosted GitHub MCP, compatibility gated | Disclosed local official stdio OAuth fallback; no silent PAT/GitHub App change |
| New MCP server | Private first-party GHM facade mounted with FastAPI, shared service invariants | Stdio facade if HTTP/auth/lifespan overhead is disproportionate |
| Accepted writes | Exact human-reviewed local result/mapping; executor-only apply | No automatic taxonomy publication or GitHub writes in initial release |
| Persistence | Local file-backed graph checkpoints + application operation receipts | Cloud adapter decision deferred; approved DynamoDB/SQS target preserved |
| Model input | Approved public/synthetic material only | Private material requires a new explicit content policy/grant |
| Live spend | New finite grant, proposed at most $1 pilot and existing cumulative ceiling | Stop and seek a concrete additional grant; do not renew by changing operation names |
| Public usage | Authenticated local task with private research collection | Anonymous hosting/public exports require separate abuse, cost and privacy design |

## Completeness audit

| Review area | Design result | Remaining execution evidence |
| --- | --- | --- |
| Product usefulness | Six concrete proposals, public/personal distinction and sequencing | User priority choice; real user feedback |
| Actual code versus proposal | Current pipeline/provider/storage/auth distinguished from new loop/MCP | Recheck code revision before implementation |
| Control flow and limits | Explicit states, meaningful next-action decisions and bounded stop conditions | Observation-dependent fake/live trajectories |
| State and restart | Checkpoint, journal, authoritative receipts and commit-gap recovery specified | Crash-window/interrupt persistence tests |
| Tool failure | Typed access/rate/schema/uncertain-outcome handling specified | Real MCP capability/auth read plus injected failures |
| Human boundary | Exact diff/result approval, hidden executor capability, current preconditions | CSRF, replay, stale-plan, same-label/manual and account-switch tests |
| Budget/no-repeat | Planner/finalizer/tool/count attempts included; historical receipt/ceiling preserved | Audited agent wire, exact per-call reservation and live accounting |
| Privacy and injection | All MCP outputs filtered; principal-scoped tools, state and exports | Denial/adversarial fixtures; no raw private/secret text in model traces |
| MCP compatibility | Dated primary sources and concrete candidate versions recorded | Actual dependency resolution, schema/era and OAuth compatibility |
| Evaluation integrity | New development-only agent suite, existing corpus/test labels frozen | Versioned scenarios; no reference leakage; independent human judgements |
| Visual explanation | Two approachable architecture/lifecycle illustrations plus exact Mermaid companions | Rendering/link QA recorded separately; figures are design illustrations |
| Delivery scope | Documentation and diagram sources only | Implementation approval; no live capability claims |

## Important qualifications found during review

1. Current LangChain MCP and protocol documentation differs from familiar older examples. Keep pinned candidates as **untested**, and use one server-specific client per credential/protocol boundary.
2. A public source can contain injected instructions or secrets. Public verification is necessary but does not replace output filtering and scope enforcement.
3. Conversation memory and checkpoint recovery do not authorize an action. Current domain state and a human approval remain authoritative.
4. A global manual-decision version can over-block independent labels. The design preserves the current label-specific human-review fix without weakening background AI commit checks.
5. GitHub HTTP attempt accounting may be hidden by a hosted MCP server. If it cannot be observed or bounded meaningfully, report that limit honestly and choose a pinned observable local server for strict accounting rather than inventing a precise count.
6. Richer research summaries and generated purpose descriptions would be **new model outputs**. They must not be described as existing deterministic parser results.
7. A0–A2 can prove a useful agent without six product-specific agents, automatic web crawling, a vector database, a cloud deployment or a broad shell.

## Approval-sized next step

Review the recommended architecture and product order, then approve **A0–A2 only** if appropriate. This delivers the compatibility proofs and one-repository end-to-end Investigator before committing to a larger product or Deep Agents integration.

The repository's AGENTS.md (original GitHub Manager source: `AGENTS.md`) says “Ask for approval before implementing,” and the execution guide (original GitHub Manager source: `docs/system-design-execution.md#step-e-present-results-and-wait-for-approval`) separates planning from application/infrastructure work. This package satisfies the requested design task; it does not infer permission to install the candidate stack, change auth, run paid calls or publish/deploy the result.
