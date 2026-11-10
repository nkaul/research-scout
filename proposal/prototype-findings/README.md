# Research Scout — basic local implementation

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


Research Scout turns a use-case brief into a small, reviewable repository shortlist. It records public source evidence, explains an implementation approach, produces a narration script, and lets the signed-in user save selected repositories in a **separate Research library**. Saving does not star, fork, classify, or import a repository into My Repos, Favorites, or Public – Ground Truth.

This directory documents the implementation requested after the original agentic proposal (original GitHub Manager source: `agentic-design/README.md`). The earlier proposal files remain useful design history; their aspirational acceptance criteria are not evidence that every proposed feature shipped.

## Start here

1. Read [using Research Scout](user-guide.md) for the inputs and the complete review/save flow.
2. Read [implementation and design decisions](implementation.md) for the architecture, agent boundary, retrieval and recovery behavior.
3. Read [validation](validation.md) for tested behavior, actual API usage, known limits and remaining proofs.
4. See [public-data discovery and licenses](../research/public-data-and-licenses.md), [MCP integration](mcp-integration.md), [framework runtime](framework-runtime.md), [storage](backend-storage.md), and [interface design](ui-research.md) for focused detail.
5. Inspect the [successful live sentiment-analysis example](examples/sentiment-analysis/README.md), including its generated report, implementation approach and narration script.

## Two execution modes

| Mode | What chooses the next action? | Model charges? | Useful for |
| --- | --- | --- | --- |
| Curated discovery | A fixed local workflow: lexical search → inspect public results → curate optional catalogs → produce documents | None | Finding a few leads and learning the workflow |
| Live agent | A bounded Deep Agents harness running on LangChain/LangGraph selects approved MCP research tools from observations | Yes, only when explicitly enabled and admitted | Interpreting a brief, choosing search terms and writing cited findings/approach |

Curated discovery is not described as an autonomous agent or semantic recommendation. Both modes require human selection before anything enters the Research library. Narration is a downloadable **text script**, not generated audio.

## Quick setup

The existing GitHub OAuth App, localhost Next.js frontend and FastAPI backend are reused. No cloud deployment or new GitHub credential type is required for ordinary discovery.

```bash
# From repository root, using an installed uv executable:
uv sync --project backend --group dev --group ai-pretest --group research --locked
PATH="$PWD/.tools/node/bin:$PATH" npm --prefix frontend ci
scripts/dev-demo.sh --dev
```

The research dependency group is needed for the agent/MCP path. Curated discovery reuses the existing extraction dependencies. The generated Next.js production build must be rebuilt after UI changes; development mode picks them up directly.

For live execution, set `RESEARCH_LIVE_AI=true` in ignored `backend/.env`, retain `OPENAI_API_KEY` only there, and use the finite Research grant documented in [framework runtime](framework-runtime.md). The existing request/generation allowance and cumulative $5 experiment ceiling continue to apply. Enabling a switch does not create or renew budget.

`RESEARCH_GITHUB_TRANSPORT=rest` is the working default. `mcp` opts into the official remote GitHub MCP server and must pass its OAuth and protocol checks. A failure stops visibly; it never silently substitutes a PAT or GitHub App.

## Persistence and scope

Default storage is ignored, private `docs/validation/private/agentic/research.sqlite3`. It holds owner-scoped task briefs, trace events, retained public evidence, cited drafts, three Markdown artifacts and accepted library snapshots. Browser downloads let users keep individual Markdown documents elsewhere. Documentation for this feature stays here under `agentic-design/docs`; no benchmark or corpus release is replaced.

No repository cloning, installation, arbitrary browsing, code execution, dataset download, private README submission, autonomous library save, or GitHub write is part of this basic slice.
