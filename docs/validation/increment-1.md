# Increment 1 validation

**Current November 9 checkpoint:** automatic multi-source discovery and Unpaywall enrichment passed **270 Python tests, 43 browser cases and 11 structural harness cases**, plus lint/typecheck/build. Actual fixture records proved DOI grouping and once-per-DOI access; a bounded live Search journey automatically chose OpenAlex, arXiv and Crossref and returned 26 primary papers with six reported open-access observations. [Current validation, architecture and limits](../../system-design/automatic-federated-discovery-2026-11-09.md#validation-checkpoint). The October 26 report below remains the historical original validation record.

**October 26, 2026 · local framework validation; live readiness is provider-specific**

The user approved Increment 1 development and basic context/harness evals. The framework now runs a Next.js workspace, a Python application core, two actual Deep Agents graphs, actual application MCP and four independent provider processes. Default discovery uses labeled authored fixtures and a scripted model. No paid language-model requests or model downloads were performed.

## Results

| Check | Result | Evidence/scope |
| --- | --- | --- |
| Python suite | **106 passed in 14.07 s** | [JUnit receipt](python-tests.xml): 31 core, 22 provider, 31 agent, 13 API, 5 actual-process integration and 4 launcher cases. |
| Python lint | **Passed** | `ruff check src tests scripts`. |
| Context/harness evals | **11/11 passed** | [Machine-readable report](context-harness-evals.json), actual Deep Agents graphs with scripted BaseChatModel; injected search callback in this eval runner. Actual HTTP MCP is covered separately in the Python suite. |
| TypeScript | **Passed** | `npm run typecheck`. |
| Next.js production build | **Passed** | `npm run build`; local production preview uses port 3100. |
| Browser acceptance | **7/7 passed in 20.1 s**, zero skipped | Full Playwright Chromium, real click/keyboard interactions and fixture contracts plus one actual local-backend journey, against the final refreshed services. [Sanitized receipt](browser-tests.json). |
| Visual review | **Passed** | [Desktop workspace](images/workspace-desktop.png), [mobile workspace](images/workspace-mobile.png), [metadata-completeness inspector](images/metadata-completeness-inspector.png); source rows, fixture labeling and narrow-screen layout inspected. |
| Live metadata adapters | **3 successes / 4 attempts** | [Sanitized probe report](provider-access.md): Crossref agency/metadata and DataCite singleton HTTP 200; Semantic Scholar detail HTTP 429, no retry. OpenAlex was not called. |
| CI definition | Added; no remote run | [Fixture-only workflow](../../.github/workflows/validate.yml). Local YAML parse passed; no push/remote CI execution or deployment. |

The test count is a denominator of regression cases, not research topics, relevance judgments or live-provider accuracy.

The [implementation receipt](implementation-receipt.json) binds the final code, tests, dependency files and evidence hashes, and records preserved research/diagram hashes and local ignore checks. The JUnit receipt omits the local device hostname; counts and test outcomes are unchanged.

## Behavior exercised

- The selected provider remains scoped throughout coordinator → specialist → real application MCP → independent provider process. Effective compiled tool nodes exclude general delegation, filesystem and shell tools. Only human API actions mutate selections, check registry metadata or export.
- A valid lexical entity is committed and emitted while the run is still `RUNNING`, before the delayed semantic branch and final model response. It can be inspected and saved immediately. Same-provider overlap deduplicates; semantic-only candidates remain possible; failed branches remain visibly partial.
- Explicit year/type filters apply to both branches. Missing required metadata is ineligible. A changed date/type can remove a current ranked candidate while retaining its saved history with a warning. RRF uses eligible branch ranks; source fields are not generated or blended.
- Finite grants survive duplicate operations, unknown outcomes and restart. Single-writer locks cover core and provider lifecycles. Durable state and its event cursor publish together; replay/gap recovery performs no new upstream work.
- Cancellation before execution, deadline expiry and late callbacks cannot publish new discovery effects. Detail/check actions have separate explicit deadlines and can use remaining allowance after search ends.
- Crossref agency lookup routes exact metadata checks to Crossref or DataCite. Registry evidence, field conflicts, unchecked fields and discovery observations remain separate. A whole-record citation-source switch is explicit. Successful cache reuse makes zero new research calls.
- Human revisions, selected source snapshots and old exports remain stable under later ranks/details/checks. Saved reads, decisions and exports work after providers stop. Manifest exports include plan, executed-operation provenance, runtime, usage, source snapshots and event cursor.
- Browser contracts exercise progressive rows, stable inspector/focus, local reason drafts after revision conflict, reconnect without re-search, empty/partial states, mobile keyboard flow, nullable titles and missing/truncated metadata. The actual-backend case includes early save, shortlist/reload and Markdown download.
- Input preflight rejects an over-budget question before creating a run, retaining supported ASCII/multilingual input exactly. The launcher checks planned local ports before starting any process; an occupied port is rejected while the existing listener remains untouched.

## Context and harness eval interpretation

The eleven authored cases cover OpenAlex delegation, isolated Semantic Scholar delegation, empty results, source instructions treated as data, rejection of foreign/invented IDs and fields, attempted human mutation, generation-cap enforcement after retrieval, no automatic replay, and compact context retaining all twenty identities and observation versions with bounded previews. Context v2 additionally has regression tests for full supported ASCII/multilingual briefs, excessive JSON expansion and identity-only overflow without replay.

Successful fixture runs use four scripted generations, one delegation, one application search and zero model HTTP attempts/charges. Context limits use fixture UTF-8 byte upper-bound units, not provider tokens. This verifies structural scope and validation behavior. It does not demonstrate live LLM prompt-injection robustness, relevance, entailment, literature coverage or production safety. A hosted model adapter, real token/rate accounting and reviewed research-question eval set remain future gates.

## Live access evidence and remaining gates

Exactly four anonymous public metadata operations were attempted, with no retries: Crossref agency and metadata for `10.1038/nphys1170`, DataCite singleton for `10.14454/qdd3-ps68`, and Semantic Scholar DOI details for `DOI:10.1038/nphys1170`. Their normalized outcomes and timestamps are in [provider-access.json](provider-access.json). These identifier-specific successes do not establish aggregate quality or full-text access.

OpenAlex's official MCP requires configured OAuth and actual tool-schema/native hybrid proof. It was not replaced with REST. Semantic Scholar anonymous access was rate-limited; its compatible optional local encoder remains unconfigured. No live language model is configured. The local framework is ready for review; the expanded Increment 1 is **not fully live-validated**.

Validated toolchain: Python 3.13.0; Node.js 24.22.1; FastAPI 0.162.0; Deep Agents 0.7.32; LangChain 1.4.7; MCP 1.30.0; Next.js 16.4.3; React 19.3.1; TypeScript 5.9.3; Playwright 1.64.1. Dependency files are [requirements.lock](../../requirements.lock) and [package-lock.json](../../frontend/package-lock.json).

Reproduction commands are in the [root README](../../README.md#validate). Local operational state, browser binaries, package installations, logs and credentials are ignored. This report includes no private tokens, raw response bodies or account files. The prior GitHub Manager repository was used only as a reference.
