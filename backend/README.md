# Research Scout backend

**Latest November 14 resource reading:** [Unified search information and readable Data/Repos](../system-design/resource-information-and-reading-plan-2026-11-14.md) implements the approved v0.2 plan: one information pane below all resource tabs, accurate shared completion/coverage, source-derived points and Original/Saved excerpts with inline expansion, bounded readers, GitHub topic filters, verified saved README source and persistent local Repo notes. Existing retrieval ownership, request/credit limits, provider isolation and saved research remain intact.

**Latest November 14 central search:** [One Search across Papers, Videos, Data and Repos](../system-design/central-resource-search-2026-11-14.md) adds remembered 0–20 limits and parent-owned resource jobs for new interactive searches. Data/Repos no longer need a second Find action; saved/tab reads remain read-only. Counts distinguish disabled, pending, empty, failed, relevant and overflow states. The saved embedding-query parser failure is corrected, and the larger atom tilts whole rings in three dimensions. Existing model budgets, provider isolation and credit history are preserved.

**Latest November 14 optional AI refinement:** [AI/direct controls and used credits](../system-design/optional-ai-refinement-2026-11-14.md) makes refinement an explicit remembered switch beside sources/date controls in Search and Exploration. On retains model planning/review and its gates; Off uses the saved direct query without hosted-model calls or credits, including explicit Data/Repos lookups. This supersedes the earlier mandatory-AI UI policy. Saved traces retain actual execution mode. The header displays used/100; accounting/history/reset rules are unchanged.

**Latest November 14 daily credits:** [Daily credits and model economics](../system-design/daily-credit-tokenomics-2026-11-14.md) replaces the historical lifetime $0.25 admission blocker with 100 credits per local day. One credit is one dispatched hosted model request; reservations, explicit reset epochs and retained usage/cost history are authoritative in local SQLite. The header meter and `/admin` page require no login. Research/provider state and model routing stay separate.

Shared planning policyv7 is defined in `planning.py`. The existing initial model call emits bounded resource queries and context expansion; canonical intent remains separate from provider execution/repair. Data/Repos validate the saved plan fingerprint before new acquisitions. Generation receives source-bound non-evidence research context inside its existing request bound; model topology, quota and cost ceilings remain unchanged. [Design](../system-design/shared-ai-query-refinement-2026-11-14.md).

Public GitHub repository discovery adds separate repository contracts/evidence/lifecycle/agent modules and an isolated `providers/repo_service.py` process on8121. `/api/repo-providers` and `/api/repo-searches` expose saved-context lookup, GET/SSE and cancel; application MCP adds `search_repositories` and `get_repository_search`. Official REST search plus at most five bounded public README reads feed local sparse ranking; no extra hosted model or vector index is used. Optional `SCOUT_GITHUB_TOKEN` remains in the GitHub process only; GitHub Manager credentials/state are not imported. [Architecture and bounds](../system-design/github-repositories-2026-11-14.md).

Dataset metadata discovery adds `datasets.py`, `dataset_contracts.py`, `dataset_terms.py`, `agents/datasets.py` and `providers/dataset_catalog.py`. The independent Hugging Face process (`providers/dataset_service.py`) defaults to port8120; DataCite remains on8113 with a separate dataset-only operation. Application MCP exposes `search_datasets`/`get_dataset_search`; HTTP exposes `/api/dataset-providers` and `/api/dataset-searches` with saved reads, SSE and cancellation. Admission requires an existing saved AI-refined conversation/turn rather than arbitrary raw dataset query text. No new hosted model call is made. `backend/scripts/dev.py` includes Hugging Face by default; `--dataset-providers` with no values disables it and `--hugging-face-port` overrides its port. [Architecture and metadata boundaries](../system-design/dataset-discovery-2026-11-14.md).

The Python services, application MCP, provider adapters, agents and tests live here. The backend is a Python 3.13 uv project with an editable `research_scout` package and a committed `uv.lock`. The Next.js app and browser tests live in `../frontend/`; system design remains in `../system-design/`.

From the repository root, install the locked runtime and default development tools:

```sh
uv sync --project backend --locked
uv run --directory backend --locked pytest -q
uv run --directory backend --locked ruff check src tests scripts
uv run --project backend --locked python backend/scripts/dev.py --mode fixture
```

For the existing local live profile, install and retain the optional CPU encoder:

```sh
uv sync --project backend --locked --extra encoder
uv run --project backend --locked --extra encoder python backend/scripts/dev.py
```

Include `--extra encoder` on subsequent `uv run` commands when keeping that optional environment installed. uv syncs commands to their selected extras; omitting the extra can remove it from `backend/.venv`. Model artifacts remain in the existing ignored root cache and are never downloaded at service startup.

The equivalent backend-directory launch is:

```sh
cd backend
uv run --locked --extra encoder python scripts/dev.py
```

Both launch forms read the repository-root `.env`, preserve the repository-root `.scout` state, credentials, provider journals, model ledger and caches, and start the unchanged frontend on 3100, core on 8100 and isolated paper/video/access providers on 8111–8119, Hugging Face on8120 and GitHub on8121. Explicit relative launcher state paths also resolve from the repository root. The old root `.venv` is retained during migration and is not the backend runtime.

Other explicit tools, from the repository root:

```sh
uv run --project backend --locked python backend/scripts/connect_openalex.py
uv run --project backend --locked --extra encoder python backend/scripts/provider_preflight.py --provider crossref
uv run --project backend --locked --extra encoder python backend/scripts/setup_local_encoder.py
uv run --directory backend --locked python -m research_scout.agents.evaluate --output ../docs/validation/context-harness-evals.json
```

Provider preflight does no upstream operation unless `--live` is explicitly added. Encoder setup is an explicit public artifact download. OAuth connection is also explicit. These scripts retain root-relative runtime paths when invoked from either directory.

`requirements.lock` and `requirements-encoder.lock` preserve the earlier pip snapshots as migration provenance. `pyproject.toml` and `uv.lock` now define the maintained uv environment; existing application/encoder versions are constrained to their tested snapshot versions. Development tools are in the default `dev` dependency group. Package management uses uv, not global pip.

uv installation and project commands follow the [official uv documentation](https://docs.astral.sh/uv/guides/projects/). This workspace has an ignored local bootstrap at `.tools/uv/bin/uv` (uv 0.13.8); add the repository’s `.tools/uv/bin` to `PATH` when using that copy.
