# Research Scout — Agent Instructions

## Project context

Research Scout is a standalone project for finding resources and approaches to solve a problem, build a system or conduct research. Development proceeds incrementally in this repository.

The repository contains a working local Increment 1 framework, research, proposals, historical prototype findings and reusable agent skills. Increment 1 development/design and validation were explicitly approved by the user. Read [implementation status](system-design/implementation-status.md) and [validation evidence](docs/validation/increment-1.md) before extending it. The earlier Research Scout prototype remains in GitHub Manager; that repository is a source of context, not this project's working directory.

The confirmed standalone foundations are Python backend services, a Next.js frontend, LangChain's Deep Agents framework with a multi-agent setup, a local application MCP server and suitable provider MCP integrations. The latest user direction makes automatic multi-source discovery the default: the user need not select providers. Keep provider services isolated behind a bounded, recorded automatic route; OpenAlex remains the primary discovery resource. Discovery uses within-provider lexical/semantic retrieval and common filters, then groups exact normalized DOIs into canonical paper cards with preserved provider observations. Automatically resolve discovered DOIs through Unpaywall for access locations. Manual provider controls are optional advanced behavior. Database and other storage choices remain open. Read the [current system design](system-design/README.md) for the evolving baseline; older manual-selection requirements are superseded.

Before architecture planning, start with [system-design/README.md](system-design/README.md). For the current first slice, read [product organization](system-design/product-organization.md), [architecture](system-design/architecture.md), the [Increment 1 plan](system-design/increment-1.md) and its implementation-status record. Preserve the distinction between approved targets, implemented fixture behavior and unproved live-provider/model gates. [Research inputs](system-design/research-inputs.md) preserve the two complete research readings. Keep the system-design index and affected increment current as decisions or implementation change.

Then read the relevant background:

1. [Proposal orientation](proposal/README.md) and [standalone scope and next decisions](proposal/scope-and-next-steps.md).
2. The design, research and prototype findings linked there, as needed for the requested decision.
3. [Project Research Resource Guide](discovery/research/project-research-resource-guide.md) when choosing resource categories or discovery providers. This is a dated research snapshot; verify service details before integration.
4. [GitHub Manager Architecture](docs/github-manager-architecture.md) when considering local parsing, lexical retrieval, compact model inputs, caching, analysis receipts and other efficiency approaches. Treat it as a source-system reference, not an approved Research Scout architecture.

The documents under `proposal/` preserve earlier work. Their implementation claims, test results, budgets and stack choices describe the original GitHub Manager work, unless explicitly adopted and verified here. Current standalone design and execution documents take precedence over historical material; distinguish their confirmed decisions from proposed details.

## Decision priority

1. Latest explicit user instructions and existing session authorization.
2. Confirmed Research Scout decisions in [system-design/](system-design/README.md).
3. Explicitly approved Research Scout implementation plan, when present.
4. Historical proposals, prototype findings and conversation rationale.

Inspect current repository evidence when determining what is implemented. Do not revive superseded proposals or infer approval from copied documents.

## Execution rules

- Work in Research Scout. Changes to GitHub Manager require a separate user request.
- Review existing files and any implementation before proposing changes. Identify material gaps and produce a phased plan when architecture work calls for one.
- Honor planning-only requests. When implementation is already authorized, proceed within that scope without requesting the same approval again. Document material architecture changes and their reasons.
- Preserve source provenance, historical findings and existing artifacts. Clearly distinguish implemented behavior, approved targets, measured results and new proposals.
- Choose the standalone stack from current requirements. Do not automatically inherit GitHub Manager's frontend, authentication, storage, cloud architecture or taxonomy workflows.
- Copying research and skills does not transfer credentials, private runtime data, provider grants, remaining API allowance or deployment authorization.

## Implementation and validation

- Code is under `src/research_scout/`; the Next.js app is under `frontend/`. `scripts/dev.py` launches owned independent local processes. Use the repo `.venv` (Python 3.13) and Node 24; an ignored local Node toolchain is available at `.tools/node/bin`.
- Default fixture mode still executes real Deep Agents graphs, application MCP, service HTTP and browser SSE. Never describe fictional provider records or scripted model responses as live research/quality evidence.
- Research Scout ports are frontend 3100, core 8100 and providers 8111–8118. The [provider expansion checkpoint](system-design/provider-expansion-2026-11-09.md) defines the current eight-service/six-discovery roles and Unpaywall access configuration. GitHub Manager may occupy 3000; do not attach tests to it or terminate unrelated processes.
- Run `.venv/bin/python -m pytest -q`, `.venv/bin/ruff check src tests scripts`, and the synthetic eval command in the root README for relevant backend changes. Frontend checks are `npm run typecheck`, `npm run build` and Playwright browser acceptance. The explicit actual-backend browser case requires `SCOUT_BROWSER_INTEGRATION=1` and running fixture services; it must fail rather than silently skip when explicitly enabled.
- Keep provider SDKs/access/cache/attempt journals in independently launched single-provider services. Keep app eligibility/rank validation, canonical DOI grouping and human authority in the core. Automatic fan-out to the recorded eligible source plan is authorized; do not silently switch outside that plan or blend fields across provider observations.
- Single-owner atomic JSON is the implemented local persistence; production database/authentication/hosting remain unselected. Read the status record before claiming recovery or model-cost guarantees.

## Project skills

Read a relevant `SKILL.md` before using it, then load only the supporting references needed for the task:

- [system-design](.agents/skills/system-design/SKILL.md): architecture, tradeoffs, gap reviews and phased plans.
- [engaging-technical-writing](.agents/skills/engaging-technical-writing/SKILL.md): technical explanation, articles and revisions that preserve evidence and depth.
- [illustrated-explainers](.agents/skills/illustrated-explainers/SKILL.md): the established paper-and-marker illustration style and diagram animations.

`.agents/skills/` contains the active project-local copies; `skills/` contains matching portable copies, usage prompts and provenance. Keep corresponding skill folders synchronized when editing. See the [bundle guide](skills/README.md) and [agent task preamble](skills/AGENT-INSTRUCTIONS.md).

The original GitHub Manager root and frontend instructions are preserved under `skills/provenance/` for historical reference. Their framework-specific rules are not adopted as Research Scout requirements.
