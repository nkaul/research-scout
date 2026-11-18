# Backend/frontend layout and uv migration

Implemented November 13, 2026. The package layout changes where code and tooling live; the service boundaries, provider capabilities, UI and persisted research identities keep their existing behavior.

## Repository organization

```text
backend/
  pyproject.toml          Python 3.13 uv project and development group
  uv.lock                 Maintained, reproducible dependency resolution
  .python-version         Python 3.13
  src/research_scout/      Core HTTP/SSE/MCP, agents and isolated providers
  tests/                  Python contracts and integration tests
  scripts/                Launcher, OAuth, preflight and encoder tools
  fixtures/               Authored provider fixtures
  evals/                  Context/harness evaluation assets
frontend/
  src/                    Next.js App Router, components and browser client
  tests/browser/          Playwright contracts and fixture acceptance
  scripts/                Frontend-only browser tooling
system-design/            Current architecture and incremental decisions
discovery/                Research and standalone UX explorations
docs/                     References and dated validation evidence
.env                      Ignored, repository-root local configuration
.scout/                   Ignored, existing root state and caches
```

Python imports retain the `research_scout` package name. The frontend continues to use Next.js 16.4.3 and React 19.3.1; moving files does not introduce a component framework or replace its design. Browser tests now resolve their dependencies from the frontend project and run through its own `test:browser` script.

## Dependency management and commands

`backend/pyproject.toml` and `backend/uv.lock` are the maintained dependency definition and resolution. The former pip lock snapshots moved into `backend/` as provenance. Existing installed versions of 95 packages were preserved; this migration does not upgrade LangChain, LangGraph, Deep Agents or provider libraries. uv resolves the additional platform-conditional packages required for portable installation.

The validated runtime is Python 3.13 with uv 0.13.8 (`>=0.13.8,<0.14`). Node.js 24 remains the frontend toolchain. From the repository root:

```sh
uv sync --project backend --locked
uv run --project backend --locked python backend/scripts/dev.py
uv run --directory backend --locked pytest -q
uv run --directory backend --locked ruff check src tests scripts
uv run --project backend --locked python -m research_scout.agents.evaluate --output .scout/context-harness.json
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix frontend run test:browser
```

The local live profile uses the optional encoder. Include `--extra encoder` on both `uv sync` and **each** `uv run` that shares that environment. uv can remove unselected extras while synchronizing. Encoder artifacts remain separately cached; installing the Python extra does not authorize downloading model artifacts or making provider calls.

An ignored local uv bootstrap lives at `.tools/uv/bin/uv`; Node lives at `.tools/node/bin`. Add those directories to PATH when using these checkout-local tools. The backend environment is `backend/.venv`. The earlier root `.venv` is preserved but is no longer the active project environment.

`uv run --project backend` selects the project without changing the working directory; root-relative script paths above are intentional. `uv run --directory backend` changes directory so pytest and Ruff load backend configuration. A backend-directory launch is `cd backend && uv run --locked --extra encoder python scripts/dev.py`.

## Runtime paths and service boundaries

The launcher always reads only repository-root `.env`. The new `research_scout.paths` module anchors default and relative state, OAuth, provider journals and encoder caches at the repository root, independently of whether commands start from the root or `backend/`. Explicit absolute overrides are preserved. This prevents a second state namespace, a reset cost ledger or lost saved projects after the code move.

The running local `.env` selects its existing `.scout/live` namespace. Neither credentials nor saved data are migrated into source folders. A fixture launch with an explicit separate `--state-dir` cannot overwrite it. `.gitignore` excludes nested `.venv`/`.scout` directories, frontend browser artifacts and the existing root tooling/cache locations; `backend/uv.lock` stays visible to Git.

The frontend remains on 3100, core on 8100 and the nine independently launched provider services on 8111–8119. Frontend application requests are rewritten to the core; provider clients and secrets remain in the Python services. The launcher uses `backend/.venv/bin/python` for its children and the existing frontend Node toolchain. No provider is combined with another service by this migration.

## Validation and documentation

The [validation index](../docs/validation/increment-1.md) and [migration receipt](../docs/validation/2026-11-13-backend-uv-final.json) record the completed checks: 335 Python tests passed with 1 optional encoder proof skipped; 148 unique browser cases passed across a full run and four corrected focused cases; and all 11 scripted harness cases, Ruff, TypeScript, isolated Next.js production build, uv package builds and lock checks passed. The new path tests cover repository, backend and unrelated working directories plus explicit relative/absolute overrides. The complete Python suite exercises actual local MCP/service protocols; the browser suite includes explicitly enabled fixture-backend journeys. Context/harness evals use scripted models and authored records, not live research-quality evidence.

The first root `npm --prefix frontend` test attempt exposed a browser-cache resolution difference: Playwright used npm's original working directory for the relative cache. The package script now supplies the absolute frontend cache path. The full corrected-cache run passed 144 cases and identified four older test assumptions/races; the final four-case run passed after test-only corrections for citation display grouping, accepted mocked turns, and the separate YouTube caption endpoint/cached replay. Product behavior was preserved.

CI now installs uv, syncs the backend lock, runs backend checks from the new directory, and executes the frontend browser suite from `frontend/`. Local validation uses an isolated fixture namespace and a separate production-build directory. The [live restoration check](../docs/validation/2026-11-13-backend-uv-live.json) confirms all eleven services healthy and compares saved research, projects, provider usage and model cost/holds across the restart without starting a new search. Saved 58-paper and 10-video views pass at six widths with zero API writes. Remote CI was not executed locally.

Historical documents and validation receipts retain their original paths and measured package counts. For current execution use the root [README](../README.md), [backend guide](../backend/README.md), [frontend guide](../frontend/README.md) and [agent instructions](../AGENTS.md). They supersede commands from dated pre-migration checkpoints.
