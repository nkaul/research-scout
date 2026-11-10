# Research Scout UI

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


Implemented as a separate workspace section on 23 October 2026. This is the user-authorized Research Scout extension to the main application. It preserves the existing repository ownership, favorites, taxonomy and synchronization semantics in `docs/system-design.md`.

## Navigation and data boundary

Research has its own sidebar navigation button and saved-repository count, outside the Repository collections group. It does not add a `research` collection option. The app holds its current GitHub/demo collection while rendering a separate Research content branch. That branch has no repository KPIs, normal sync progress, repository table or source coverage panels.

All reads and writes use the isolated `frontend/src/lib/research.ts` client against `/api/v1/research`. Its request helper does not accept a normal repository collection. Requests use the existing session-aware fetch wrapper and CSRF header on mutations. The library count is derived from persisted Research entries; selecting candidates in the form is not a save.

Only an explicit **Save selected to Research** action stores reviewed candidates. Nothing in this UI imports a repository, stars it, adds a favorite, assigns a taxonomy concept, or changes the normal sync inventory. Unverified public candidates and license-policy exclusions cannot be selected. Unknown license findings are selectable only for runs with the exploratory `any` policy. A known license identifier and the server's policy eligibility finding are displayed separately: a license name does not itself establish suitability for a user's use case.

## Compact task admission

The primary form asks for a title and short use-case brief. Optional constraints live in a disclosure: preferred language, license policy, a maximum of one/three/five candidates, other constraints, commercial intent and public data sources. Selecting data sources exposes a short data-needs input and explicit AWS Open Data, Kaggle, Enigma, data.gov, Hugging Face and World Bank catalog choices. Existing `SearchableSelect` controls provide the same keyboard behavior and constrained menus as the rest of the app.

Execution modes are explicit. **Curated discovery** is the fixed discovery/local-evidence workflow and says that it makes no model calls. **Live agent** is selectable only when the backend reports availability. A configured test fixture is labeled as a simulated trajectory in both admission and run results. No test fixture is described as evidence of live model behavior.

## Review and evidence

Persisted runs expose status, execution mode/model, creation time, progress and any backend-advertised stop/retry actions. The human-review state calls for evidence and license inspection before selection. The trace is a bounded disclosure showing recorded actions, outcomes and evidence references rather than an invented conversation transcript.

Candidate cards show the GitHub name/link, verified public status, description, language, SPDX/unknown license finding, policy eligibility, role, fit explanation, caveats and linked evidence references. Public data references are a separate catalog section with access/license values, including explicit unknowns. A catalog search lead is not presented as a verified dataset or as a permission grant.

Research report, approach document and narration text appear in separate tabs with a Markdown download for the selected document. Narration is text; the UI does not claim that audio was generated. Content is rendered as plain text, with escaped React text nodes. Links are restricted to HTTPS, and external pages open with a suppressed referrer.

## Styling and verification

The UI reuses the app's indigo/white selected states, buttons, typography variables and searchable controls. Component styles live in a CSS module to avoid altering the existing organizer and review queue. Desktop candidate cards use two columns where space allows; narrower screens stack the form, results and document controls.

The isolated browser contract test in `frontend/tests/demo/research-scout.spec.ts` deliberately mocks only Research endpoints. It covers execution disclosure, form payloads, human review, verified selection, source/unknown labels, trace, document switching/download, explicit library saves, reload, mobile width, and the absence of a normal repository request with `collection=research`. It is a UI contract test, not a live discovery/model evaluation.

Verification on 23 October: TypeScript checking and ESLint passed for the changed frontend files; the scoped Research browser test passed. 1920×1080 desktop and 390px mobile screenshots were visually reviewed. Run the browser check with the repository's local Node on `PATH`, `PLAYWRIGHT_BROWSERS_PATH=$PWD/../.tools/playwright`, and `node node_modules/@playwright/test/cli.js test --config playwright.demo.config.ts research-scout.spec.ts` from `frontend/`. The existing config uses disposable servers on ports 3016/8016.
