# Dub-inspired frontend implementation review

**October 30, 2026 · selected trial applied to the working Next.js application**

The application now follows the selected [Dub-inspired direction](../../system-design/dub-ux-adoption.md). This is an implementation update to the existing React/TypeScript/CSS frontend. The original HTML trial is preserved; no trial scripts, fictional identities or simulated progress were copied into the production UI. The working application still uses the backend's explicit fixture/live labeling and saved data.

| Validation | Result and boundary |
| --- | --- |
| TypeScript | `npm run typecheck` passed. |
| Production build | `npm run build` passed using the existing Next.js 16.4.3 / React 19.3.1 dependencies. |
| Production browser acceptance | **9 passed in 25.0 seconds; zero skipped.** Eight controlled application-API journeys and one actual local fixture-backend integration. [Sanitized browser receipt](dub-ux-browser.json). |
| Responsive/visual review | Desktop 1440px, tablet 1024px, phone 390px and narrow phone 320px. Source Overview, Metadata, Your notes and Settings states checked at all four widths. [Rendered checks](dub-ux-visual-checks.json). |
| Preservation | Backend/API code, dependencies and original design trials unchanged. [Current UI receipt](dub-ux-receipt.json) records changed files and preserved baseline hashes. |

## Rendered implementation

- [Desktop workspace](images/dub-workspace-1440.png)
- [Tablet workspace](images/dub-workspace-1024.png)
- [Phone workspace](images/dub-workspace-390.png)
- [Narrow phone workspace](images/dub-workspace-320.png)
- [Mobile source reader](images/dub-mobile-reader.png)

Screenshots use saved records from the actual local fixture services. The visual-review script performs only GET requests; it does not initiate discovery, model calls, selection changes, detail lookups or DOI checks. A reopened terminal run may initially display “Connecting to updates” while its saved snapshot is already readable; the existing event endpoint sends an idle heartbeat after ten seconds. No backend timing or service contract was changed for the screenshots.

## Behavior verified

The browser cases retain progressive source arrival, stable keyed rows/focus, early inclusion, the three-source limit, saved reason drafts through revision conflicts, explicit agency-routed DOI observations, whole-record citation choice, reopen without re-search, deterministic exports, and reconnect without duplicate discovery. Untitled/missing/truncated metadata remains clearly labeled. The complete UTF-8 question boundary remains editable and enforced.

New coverage verifies the persistent desktop preview and keyboard tab navigation; existing reasons grouped into Research notes; local result filtering; display preferences that make no research calls; year edits that affect the next explicit search; invalid year bounds rejected before dispatch; active reader/note retention when eligibility changes; and responsive resizing that does not automatically open the phone dialog. Phone dialog closure restores focus to the invoking source.

The visual script checks sixteen viewport/state combinations for horizontal document overflow, visible button names, input labels and rendered text contrast over solid backgrounds. Its result is a scoped automated sample, not full WCAG conformance or a participant usability study. Backdrops, parent opacity, all hover states and cross-browser behavior are outside that contrast check. The parent agent inspected the desktop, tablet, phone and reader screenshots.

## Reproduction

From `frontend/`, with the repository Node toolchain on `PATH`:

```sh
npm run typecheck
npm run build
npm run start
```

With the existing independent services running in fixture mode, in a second terminal from `frontend/`:

```sh
SCOUT_BROWSER_INTEGRATION=1 SCOUT_BROWSER_EXTERNAL_SERVER=1 npm run test:browser
```

From the repository root, the read-only visual review requires a saved fixture run and the frontend on port 3100:

```sh
.tools/node/bin/node docs/validation/dub-ux-review.mjs
```

The preview servers started for this review were stopped after validation. Existing backend/provider processes were left running. Python suites and context/harness evals were not repeated for this frontend-only change; their October 26 results remain historical evidence. Live OpenAlex OAuth, Semantic Scholar semantic access and hosted-model quality remain separate gates, as recorded in [implementation status](../../system-design/implementation-status.md).
