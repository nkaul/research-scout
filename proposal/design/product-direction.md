# Research Scout product direction — selected original research

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


## 1. Public Repository Research Scout — flagship public product

**User request:** “I am building a Python service that ingests data and exposes an API. Find public projects relevant to those roles. Explain what each would contribute and what I still need to verify.”

**Current difficulty:** users perform repeated GitHub searches, open many tabs, mistake adjacent tools for direct alternatives, and forget why they saved a repository. Stars and README keywords are useful signals, but neither proves fit.

**Proposed experience:** enter a brief, important constraints and a small search/read budget. The agent produces a search plan, inspects a bounded candidate set, follows the most relevant evidence, and returns a comparison organized by **role**. An API framework and a data-integration platform might complement each other; ranking them as interchangeable alternatives would be misleading.

### What the agent actually decides

1. Decompose the brief into roles and questions, then propose bounded search queries.
2. Search the existing GitHub MCP server through approved public-only wrappers. Inspect metadata for up to ten candidates in the first product trial; deeply read at most three.
3. Decide whether a candidate needs its README, a specific documentation overview, a license check, or no further reading.
4. Revise a search once if the first result set does not cover a required role. Stop at the configured query/read/cost limit.
5. Compare supported claims against the brief. Report absent evidence as **unknown**, rather than asserting a feature is absent.
6. Ask the user about a consequential ambiguity, then save a reviewed shortlist when requested.

### Visible output

| Field | Example of the information recorded |
| --- | --- |
| Role | API layer, ingestion, orchestration, storage integration |
| Fit to requirement | Supported / contradicted / unknown, with source references |
| Operational questions | Deployment assumptions, compatibility or integration work still to verify |
| License | Reported identifier and source/version; no legal compatibility conclusion |
| Activity | Dated observed release/commit signals, with collection time and limitations |
| Why shortlisted | Brief-specific rationale instead of “popular Python repository” |
| Why excluded | Explicit evidence or scope mismatch, separate from uninspected candidates |

Use real repository content during the approved pilot, but do not publish an example comparison as though it was already researched. Nothing here establishes that a particular project satisfies a production requirement.

### The product boundary

Discovered public repositories go into a proposed **Public Research collection**, initially private to the initiating user. They do not silently enter My Repos, Favorites, the connected account's accepted taxonomy, or the Public Ground Truth workspace. Saving a shortlist and later importing selected repositories for organization are distinct user actions. No stars, issues, PRs, commits or repository changes are made on GitHub.

This concept is strongest for a public demonstration: people can understand the input and result without understanding GitHub Manager's internal taxonomy first. Anonymous hosted search, shared API credentials, abuse controls and public links are later product decisions, not implied capabilities of the local MVP.

## 4. Evidence Investigator — the smallest useful end-to-end slice

**User request:** “What does this repository primarily do, and what evidence supports that conclusion?”

The agent starts from the existing profile. It may discover that only E0 metadata is available, inspect a README acquisition result, select a better section, compare canonical definitions, or request one approved supporting document. It stops once it can produce a grounded brief or a clear request for human help.

A completed investigation contains:

- a short purpose description, clearly marked as a generated interpretation;
- source passages that support each important claim;
- the exact inspected source versions and acquisition status;
- known unknowns and conflicting evidence;
- optional proposed existing concept IDs for review, when classification was authorized.

This differs from the existing deterministic Evidence Parser, which selects passages and does **not** generate a purpose summary. Any new summary is a separately budgeted, provenance-labelled agent result. Investigation notes do not replace E0/E1 source records or the canonical registry.

The user can approve saving the brief, correct it, or request a reviewed mapping. The agent pauses durably while that decision is pending. This is the recommended first technical slice because it proves tools, state, recovery and human handoff on a small real task, and is useful in its own right.
