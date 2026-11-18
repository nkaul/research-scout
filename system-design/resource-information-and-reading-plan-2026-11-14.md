# Resource information and reading — approved plan and implementation

**Status:** User-approved v0.2 implemented and validated. Reviewed and executed with the shared-information, Data-reading and Repos-reading agents. November 14, 2026.

## Intended experience

Keep the search box, Sources/Date/Limits/AI controls, project actions, four resource tabs, progressive results and right-hand reader. Put search diagnostics in **one Search information bar immediately below the resource tabs**, with organized expandable details. Give the records and readable source content most of the screen.

The bar replaces the repeated Saved search limits, discovery completion, global counts, access coverage, saved-intent/direct-query paragraphs, provider observations and activity/timing preambles. The four tab badges keep their respective result counts. The four-resource limits/outcomes table exists once inside the information pane, rather than repeating in each tab's main content.

The existing detailed query trace and timing plot move into this pane. The editable original search remains at the top. The compact elapsed clock and current status become part of the bar, with one Stop search action while work is running. Reader-loading timing remains a distinct quiet reader clock.

## Implemented layout

```text
Question + Sources / Date / Limits / AI controls
Papers (n) | Videos (n) | Data (n) | Repos (n)
Search information | active sources + focus chips | status / elapsed | Filter | expand
Result list with readable previews                 | selected resource reader
```

The sources/focus chips share a compact line on desktop; overflow uses an accessible +N disclosure. They describe the saved active search/lane, independently of next-search toolbar preferences. Planned and unknown facts are labeled accordingly. Small screens can wrap without horizontal scrolling. Applied local filters remain visible as a filter indicator with Clear, even when details are collapsed.

## 1. Unify information and status

Use one shared presentation model and one mounted information pane. Its sections are:

| Section | Contents |
| --- | --- |
| Search overview | Saved execution mode/date/source scope, four resource limits and outcomes, available/candidate/related/unknown counts, identity grouping and overflow explanations. |
| Query and focus | Original question once; canonical intent, inferred/missing context and AI plan when applicable; active resource's planned/direct query and actual provider request arguments. Search focus tags are explicitly labeled. |
| Sources and coverage | Active tab's provider/catalog outcomes, retries/attempts and warnings. Paper access coverage contains Unpaywall details. Videos shows YouTube outcomes. Data shows Hugging Face/DataCite. Repos shows GitHub metadata, README and identity-check outcomes. |
| Timing and usage | Original search duration, first-evidence measurement, saved-view/reader clocks, actual request/stage timing and model usage. Parent and child clocks keep their separate origins; concurrent spans are not added into a fabricated total. |

Default the pane collapsed, retaining manual expansion and the selected section for the same search/turn. Reset for a new search. Filter is an icon/popover in the bar and only filters already received records. Content display controls remain compact operational controls associated with the active resource.

Keep actionable errors, clarification requests, reconnect status, active filtering and Stop accessible without expanding diagnostics. Distinguish whole-search outcome from opening/loading the active tab; an inactive lane's failure remains discoverable from the shared summary. Move parent errors/compacted-history recovery outside the Papers/Videos-only conditional so they remain available in Data/Repos as well, with one visible owner for each error.

**Correctness fix found during review:** completion is currently calculated separately by `SearchCoverage` and `performanceStatus`. One can report discovery complete while Data/Repos has failed. Replace that with one status calculation covering the parent and all enabled jobs; keep access-only partial outcomes distinct. Missing historical facts remain “Not recorded,” and available results do not imply completed retrieval.

Keep one GET/SSE owner for each existing parent/child lifecycle. Child information reaches the common pane through typed, conversation/turn/search-ID/revision-fenced state. Mask prior-turn details during a new admission/opening; reject late child callbacks. Tab changes and pane expansion must not create another subscription or acquisition path. Hidden Data/Repos result trees remain mounted and inert to preserve state. Legacy searches without resource jobs remain readable and keep their existing explicit API/acquisition compatibility; the central one-Search rule applies to new interactive searches.

Use one polite status announcer. The clock has an accessible label distinguishing original retrieval from saved-view loading; completed clocks stay quiet. Keep Stop and Filter outside the disclosure-toggle button. Preserve resource-tab keyboard behavior and support keyboard activation, Escape/outside-click and focus restoration for Filter/+N. SSE updates never move focus or auto-expand the pane. Preserve exact saved LLM request bodies and provider arguments. When a direct query equals the original question, show it once with both roles labeled rather than inventing a second query.

## 2. Make Data readable

- Reduce the preamble to catalog chips plus labeled search-focus chips on the information bar. Put repeated saved direct question/query, catalog activity, timing, coverage and technical explanations inside the pane.
- Keep **search focus** separate from each dataset's **catalog tags** and **tasks**. Deduplicate visible chips while preserving stored values and query fingerprints.
- Add **Key points / Original description** and **Read more / Read less** to both cards and the reader. Cards initially show two source points; the reader initially shows four. Expansion is inline and independent on each surface, preserving keyboard focus and the current selection.
- Derive bullets locally from supplied source sentences/paragraphs, preserving qualifiers and order. Do not apply paper-specific results/conclusions scoring to dataset documentation or introduce generated claims/model requests.
- “Original description” reveals all saved normalized catalog text. Missing source text shows an unavailable message and catalog link. Add known local truncation metadata for new records; historical and upstream completeness remain unknown when not established. Expansion does not download dataset files or refetch a catalog.
- Make the desktop reader viewport-bounded with a fixed small title/tab area and one scrolling tab body. Remove nested description-only scroll areas. Keep the mobile reader inline and bounded. Reset scroll on resource/tab changes, not on every streamed update.

## 3. Make Repos understandable and readable

**Current terminology:** the UI says “unassessed repositories.” These are fetched records whose local evidence does not establish a candidate match. This classification is independent of README availability. It does not mean unnecessary, inaccessible or confirmed irrelevant.

- Show candidate matches first, with **Other fetched repos — relevance not established** as an explicitly explained secondary group. Keep fit and README availability as two separate facts.
- Main Search remains the one acquisition entry point for enabled Repos. Its workflow already searches GitHub and locally ranks names, descriptions, topics and available README evidence. Explain the query and match rationale inside Search information; avoid another mandatory Find step.
- Treat the user's GitHub tags as the repository's published **GitHub topics**. Retained topics already participate in local matching; currently only six are shown on cards. Show compact topic chips with +N for all retained topics and the complete list in Metadata. Surface **Common topics** with counts derived from the fetched repository set as compact filter facets. Clicking a topic applies a local results filter; distinguish all-fetched facet counts from candidate-only view counts. Keep search-focus tags and matched terms separately labeled. Git release-tag acquisition or writes to GitHub are outside this plan.
- Add README key-point previews with inline Read more/less on cards, plus the same presentation switch and expansion in the right reader. Preserve source section/line/blob references. Use the description as a clearly labeled fallback when no readable README content is saved.
- Reader organization: **Overview** (README/description and why it matches), **Metadata** (complete topics, repository facts and evidence provenance), **Notes** (genuinely saved notes, as described below). Use the same bounded scrolling behavior as Data.
- Correct README availability labels using actual outcomes: queued, not fetched within the five-README budget, interrupted, unavailable at the public endpoint, rate-limited/denied, too large, identity-check failure, other error, or fetched with no readable excerpts. `not_assessed` can also mean interrupted; `blocked` can also mean oversized, so the current generic messages are insufficient.

### Original README: required supporting change

Current acquisition verifies a bounded README but retains at most eight cleaned excerpts, not the original Markdown. New acquisitions should retain the bounded source representation tied to its stable numeric repository ID, exact blob SHA, parser/evidence version and completeness information during the **existing** README fetch. Preserve the existing credential-redaction policy and explicitly flag any redaction, normalization or clipping; transformed content must not be described as byte-identical original Markdown. Promote readable artifacts only after the existing anonymous public numeric-ID recheck succeeds; failed checks discard artifacts and excerpts together. Store/read source text as a separate saved artifact so full text is not repeated in every SSE snapshot or model context. Its saved-read endpoint validates the record/blob/evidence association rather than accepting an arbitrary file path or URL. Render source safely without executing HTML, code, remote images or instructions.

New records can expose **Key points / Original README**. Historical records with excerpts only must say **Key points / Saved excerpts**, with a clearly separate current GitHub README link. Reading or toggling saved content makes no new GitHub/model request. Preserve the existing maximum of five README acquisitions per search; remaining repositories show their actual metadata-only status. Increasing that acquisition allowance is a separate decision, not a hidden side effect of Read more.

### Repository Notes: explicit proposed scope

Repository notes are not currently persisted; existing paper/video selection notes and project pins cannot be reused unchanged. Include a real local Notes feature for Repos: bounded note text and atomic persistence using the existing JSON storage approach. Key notes by **conversation ID + turn ID + numeric GitHub repository ID**, surviving child-search refresh IDs. Use independent note revisions and optimistic edit checks so streaming discovery revisions do not cause false conflicts. Retain originating evidence versions and their inspectable saved observations/artifacts. Pause hover-follow while editing/dirty, and retain drafts by scope during tab switching, filtering and streamed updates. Earlier evidence references remain inspectable after README updates. Do not add a cosmetic or browser-memory-only Notes tab. Dataset Notes and repository project-pin redesign are outside this change.

## Execution sequence after review

1. **Shared information and status foundation:** central pane, scoped child information contracts, one completion calculation, shared query/timing bodies, visible errors and removal of repeated blocks across all four tabs.
2. **Parallel content work:** one agent handles Data reader/card expansion and scrolling; one handles Repo tags/status/README cards and reader; another handles source artifact/truncation contracts and persistent Repo notes. Keep file ownership separate and integrate through agreed contracts.
3. **Consistency pass:** Papers/Videos use the same pane and keep existing abstract, PDF, media, notes, project and keyboard behavior. Verify mobile spacing, chip overflow, icon tooltips, focus and progressive loaders.
4. **Validation and design update:** targeted fixtures and browser regressions, appropriate backend checks for artifact/notes changes, frontend typecheck/build, then affected end-to-end acceptance. Record measured evidence and update the system-design index/status after implementation.

## Acceptance criteria

- Exactly one information pane per main search, below the resource tabs; no repeated four-resource limits/totals, completion, access or activity panels in the record area. Expansion persists for the current scope and resets on a new search; legacy results without job metadata remain honest.
- Direct question and active resource query appear once each with accurate mode labels. Search focus, catalog tags, GitHub topics and matched terms remain distinguishable.
- Closing details keeps required error/clarification/stop actions and active filters visible; async updates do not steal focus or turn a failure into success. Cover failed inactive lanes, independent per-lane loading, access-only partial outcomes, unknown/off states and delayed callbacks across pending/new turns.
- Long, short, missing and truncated Data/Repo content has honest Key points/Original-or-excerpts controls and functional Read more/less on cards and readers.
- Bullets are attributable source wording; Original text remains available, safe and version-bound. Dataset/provider identities and immutable GitHub blobs remain separate.
- Both readers scroll to their last item with fixed headers/tabs; desktop, keyboard and narrow mobile layouts remain usable. Presentation state is scoped to resource/version and does not leak across searches.
- All retained topics can be inspected and locally filtered. Unknown-fit records remain available without being described as inaccessible or irrelevant.
- Repo notes survive reload, preserve evidence references and unsaved drafts, and detect conflicting edits. Existing paper/video notes and projects are preserved.
- Opening tabs, filtering, expanding text, switching presentation and reading saved artifacts initiate no provider/model acquisition or duplicate GET/SSE owner. Existing limits, cancellation, replay protection and credit policy remain intact.
- Validation uses isolated fixtures and saved reads; any new live query would be a separate explicit operation.

## Review log

The initial three-agent review added four items that a superficial visual tidy-up would miss: conflicting completion calculations; parent errors hidden on Data/Repos; absence of full original README storage; and absence of persistent repository Notes. The acquisition budget and source-completeness limits above are explicit review boundaries.

The second review updated v0.1 to v0.2: saved-versus-next-search chip semantics; inactive-lane failures and independent saved-read loading; prior-turn masking and exact request preservation; keyboard/announcement behavior; Common topics facets; public-ID validation before artifact promotion; explicit transformed-source labels; independent note revisions, stable context keys and retained inspectable evidence. The reviewers reported no remaining design blocker with those refinements. The user subsequently approved execution with “go execute”; validation and the final implementation record follow below.

## Implementation record

The shared `SearchInformation` component sits once below the resource tabs. It owns the collapsed summary, saved source/focus chips, local Filter popover and four organized sections. Existing parent/child GET/SSE owners report scoped snapshots; disclosure changes do not acquire records. The original question, exact model bodies and source arguments remain in Query and focus. Canonical completion accounts for all enabled jobs, clarification, stopped work and access-only partial outcomes. Prior-scope information is masked while a new search opens. Compacted history retains trustworthy counts and preserves citation grouping when record identities remain available.

`ReadableContent` provides source-order points, Original/Saved excerpts, inline Read more/less and independent card/reader state. Paper abstract behavior remains in its existing wrapper. Data normalizers now record known local clipping at 20,000 characters or eight DataCite descriptions; absent historical flags and upstream completeness remain unknown. Data/Repo readers have viewport-bounded scrolling bodies with fixed header/tabs. Mobile inline buttons do not trigger premature reader insertion.

Repos separates candidate fit from actual README outcomes and exposes all retained topics, +N and common-topic filters. Repository notes persist atomically under ignored local `repo-notes/` state, keyed by conversation/turn/numeric GitHub ID, with independent revisions and inspectable historical evidence. Note text is bounded to 8,000 characters/16,000 UTF-8 bytes and stays separate from model context and project pins.

New README acquisitions retain a bounded, credential-redacted inert source representation after the existing anonymous public-ID check. Provider-owned artifacts are bound to repository/blob/parser/evidence identity, with content hashes and transformation disclosures. Core validates the association on saved reads. Source text is absent from result snapshots, SSE and agent/model context. Historical records retain Saved excerpts; the five-README acquisition cap is unchanged. The normalized cache policy advances for new explicit acquisitions; existing operation receipts still replay without upstream requests.

Application endpoints added:

- `GET /api/repo-searches/{search_id}/records/{record_id}/readme?evidence_version=...`: verified saved source text; no GitHub acquisition or fallback.
- `GET /api/repo-searches/{search_id}/records/{record_id}/evidence/{evidence_version}`: retained observation, including evidence pinned by a note.
- `GET /api/repo-searches/{search_id}/records/{record_id}/notes`: saved note or empty revision zero, without creating a note file.
- `PUT` on that Notes endpoint: `{text, expected_revision, evidence_version}` with independent optimistic edit checks.

The isolated GitHub provider exposes a local saved-artifact read route. All upstream search, README, identity-check, rate and model/credit limits remain separate and unchanged. No database or frontend dependency was added.

## Validation record

[Combined acceptance receipt](../docs/validation/2026-11-14-reading-ui-final.json), [backend test results](../docs/validation/2026-11-14-reading-ui-python.xml), [scripted harness](../docs/validation/2026-11-14-reading-ui-harness.json) and [saved-live checks](../docs/validation/2026-11-14-reading-ui-live-readonly.json).

- **433 backend tests pass**, with one optional local-encoder proof skipped. Seven new source/notes cases cover redaction, identity rejection, content/association verification, local-only saved reads, clipping disclosure, note revisions, refresh, pinned evidence and persistence. Ruff passes.
- **246 unique browser cases pass across the full and final affected runs** on the final production source. The full run passed 241 with five old diagnostic assertions failing; test migrations move those assertions to the common pane and retain grouping, timing, request, caption and replay checks. The final 24 affected cases pass across the 24-case rerun and corrected three-case timing file; the latter accommodates disclosure reset when the loaded turn is accepted. Original failure counts remain in the receipt. No automatic retries were used.
- Focused Data 13/13, Repos 14/14 and shared-information 32/32 checks pass. The actual isolated HTTP/MCP browser workflow verifies original saved README reading and durable repository notes without another acquisition. Fixtures remain authored test records, not live research-quality proof.
- All **11 scripted context/tool harness checks**, TypeScript and isolated production build pass. All 91 frontend source files match the tested build. Desktop/mobile visual review and seven widths from 320 to 1440 pixels show no horizontal overflow.
- The live app was restarted and checked using existing saved research with API writes and external browser assets blocked. That read-only check passed with all 13 services healthy, 58 saved paper cards and 10 video cards readable, unchanged projects/provider usage/accounting and **17 used / 100 credits**. An intermediate hash check also matched all 900 protected pre-existing files. Validation initiated no live provider search, hosted-model request or allowance reset.
- **Concurrent live activity:** two new interactive searches arrived in the running app during the browser suite, after the read-only check. The final receipt separately records their new conversations, project/cache/rate updates and additional model usage. Earlier research snapshots and `.env` remain unchanged; the new activity was preserved without rollback or reset. Final accounting is therefore not claimed unchanged. The tested production build routes to isolated fixture core 8180, independently of live core 8100.

Historical README searches continue to expose **Saved excerpts** because complete originals were never retained; viewing them does not silently reacquire files. Known local dataset clipping is disclosed, while historical/upstream completeness remains unknown. New full-source artifacts remain bounded and explicitly disclose normalization/redaction.
