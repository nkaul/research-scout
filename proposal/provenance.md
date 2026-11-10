# Research transfer: provenance and selection

**Copied on 25 October 2026.** Source: the local `github-manager/agentic-design/` work. Destination: `research-scout/proposal/`.

## Included

- The Research Scout and small Evidence Investigator product sections from the original product research.
- Design rationale, architecture, incremental planning, evaluation strategy and design-review notes that informed Research Scout.
- Framework/MCP research and the public-data/provider licensing notes.
- Research Scout-specific prototype documentation: user flow, interface, storage, framework controls, MCP implementation, limitations and validation.
- The generated sentiment-analysis example: report, approach and narration script.
- Two original illustrations, each in PNG and editable SVG, plus their original render-audit record.

## Adaptations

1. Added a standalone entry point and scope/continuation notes for Research Scout.
2. Extracted only Research Scout and Evidence Investigator from the six-product portfolio. The other product sections were not copied.
3. Added a historical-scope notice to copied Markdown documents. Original design and later prototype findings are kept in separate folders so their different claims and dates remain clear.
4. Rebased links to material included in this package. Links to original code, skills or broader GitHub Manager documents that were not copied became explicitly labeled original-source paths. Existing external reference URLs were preserved.
5. Copied illustration bytes unchanged. Added a new diagram index explaining their original context and current limits.

The copied original plan still discusses shared GitHub Manager concepts, such as taxonomy fences and existing workspace services. These are preserved design history; they do not make the new project depend on those services. The [standalone scope](scope-and-next-steps.md) describes the boundary for future planning.

## Excluded

Application source, tests, package manifests/locks, rendering scripts, installed tools, environment files, secrets, Git metadata, account/session state, SQLite databases, raw private traces, budget grants and remaining API allowance were not transferred. The broader GitHub Manager corpus, taxonomy and evaluation collection were not copied. No unrelated product portfolio or application codebase audit was brought into the new project.

The successful prototype example is a copied research output. The original tests and model-call charges remain evidence about the original prototype. They are not new Research Scout test results, model calls or spending authorization.

## Integrity and repeatability

[COPY-MANIFEST.json](COPY-MANIFEST.json) lists every source-derived file with its original relative path, copy mode, original SHA-256 and destination SHA-256. Selected source bytes and the source repository's Git status were checked before and after copying and remained unchanged.

The source working tree included uncommitted Research Scout work. Its recorded commit is contextual only; the per-file hashes identify the copied content. New orientation documents are separately listed in the manifest and do not pretend to have an original source-file equivalent.

All changes for this transfer are contained in this repository's `proposal/` folder. The existing root README, empty `docs/` directory and Git remote configuration remain intact. No commit, push, dependency install, application start or paid API call was made for this transfer.
