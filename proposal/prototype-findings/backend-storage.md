# Research Scout storage and artifact contract

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


Implemented locally on 23 October 2026. This note covers the independent persistence adapter and deterministic report renderer. Runtime orchestration, session/CSRF checks, external tools and model admission belong to the application API and engine.

`backend/app/research/models.py` defines bounded Pydantic inputs with unknown fields rejected. A brief requires `use_case` (also accepts `brief`) and accepts a title, language, line-separated or list constraints, `license_policy` (`any`, `known`, `permissive`), commercial intent, data needs, at most five candidates and `CURATED`/`AGENT` mode. `CURATED` is the default. Dataset providers are opt-in: the default is an empty list. Supported provider names are AWS Open Data, Kaggle, Enigma, data.gov, Hugging Face and World Bank. Recording an `AGENT` brief does not admit a model request or grant spending authority.

`ResearchStore(path)` creates schema version 1 in a dedicated private SQLite file. It refuses an existing database containing any unrelated table, including workspace, corpus or analysis ledger tables, before writing Research tables. The application selects a file under its ignored private root; the adapter sets its file mode to `0600`. It never imports, mutates or resets the normal workspace store, taxonomy, corpus or existing analysis ledgers.

The storage tables are:

| Table | Scope and contents |
| --- | --- |
| `research_schema` | Local schema version |
| `research_tasks` | Owner/task key; bounded brief, status, step journal, sources, candidates, proposal and rendered artifacts |
| `research_collection` | Unique owner/numeric GitHub repository ID; accepted frozen snapshot |
| `research_receipts` | Unique owner/task/operation key; selection hash and atomic save receipt |

Every resource operation takes a trusted owner string separately from the payload. A task ID provides no authority. Cross-owner access receives the same unavailable result as an absent task. Listing and collection reads are owner-scoped. Mutation uses an immediate transaction; completed or cancelled tasks cannot be revived or receive later worker output.

The engine calls `create_task`, `update_task`, `append_step`, `add_sources`, `set_candidates` and `set_proposal`; it reads with `get_task`, `list_tasks` and `get_artifact`. A task exposes `brief`, `status`, `summary`, `error`, `steps`, `sources`, `candidates`, `proposal`, `artifacts`, `saved_repo_ids` and timestamps. A step has a stable `id`, action, status, public summary and source references. Reusing its ID with different output fails. Source references are immutable, carry acquisition time and content hash, and optionally carry an immutable commit. Missing commit provenance is reported as unpinned/unknown. Only the trusted engine may assert public verification after an actual permitted verification step; these schemas do not perform network verification themselves.

Candidates use numeric `repo_id`, `full_name`, its matching `https://github.com/owner/repo` URL, `public_verified`, `source_refs`, role, fit, limitations, reported license, description, language, stars and license policy status. A verified candidate requires task-owned repository metadata evidence with the same numeric ID and public verification flag. Candidate count cannot exceed the admitted brief. Candidates and the proposal are frozen once the proposal is staged.

The human API calls `save_selection(owner, task_id, repo_ids, idempotency_key)` after session and CSRF validation. It accepts only verified candidates from that task after a reviewable proposal exists. It checks license eligibility again: excluded candidates cannot be saved; `known` and `permissive` policies require an eligible status. The same operation key and selection returns the prior receipt; the same key with a different selection fails. Different save requests also deduplicate owner/repository membership. Existing collection snapshots remain unchanged, while each originating task and save receipt remains available. Accepted snapshots retain the brief, candidate, proposal, sources and artifacts. They do not create My Repos/Favorites membership or accepted labels.

`reports.py` renders three Markdown artifacts: `research_report`, `implementation_approach` and `narration`. Narration is a text script; no audio is generated. Findings and implementation claims require source references, each resolved against the task's actual evidence records. Dataset links must match cited inspected dataset/documentation evidence and an opted-in provider. The renderer adds no feature, activity or license facts. It labels generated interpretations, bounded coverage, unpinned versions, unknown terms and unresolved suitability explicitly. Structural citation validation cannot prove that a supplied interpretation accurately follows its evidence; that remains a responsibility of the bounded engine and human review.

Storage rejects unknown payload fields, known credential formats, credential-bearing links, non-public or non-HTTPS link forms, mismatched content hashes and excessive input sizes. No credential fields, provider client or network call exist in these modules. The engine must keep credentials in trusted runtime context and sanitize observations before storage; pattern matching is defense in depth rather than a substitute for that boundary.

Offline validation:

```sh
cd backend
.venv/bin/pytest tests/research/test_store.py -q
.venv/bin/ruff check app/research tests/research/test_store.py
```

At implementation time, all 11 storage/report tests pass. They cover cross-owner denial for every resource operation, unverified/foreign candidate rejection, concurrent receipt idempotency, restart persistence, frozen accepted snapshots, byte-identical preservation/refusal of unrelated databases, credential/bounds checks, citation/dataset evidence checks, provider opt-in, license-policy review and cancellation fences. These are offline contract tests, not evidence of a live GitHub MCP or paid model integration.
