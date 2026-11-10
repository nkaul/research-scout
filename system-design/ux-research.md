# UX research intake and Increment 1 implications

**October 26, 2026 · synthesis by UX Researcher, the UX research agent**

**Selected direction — October 29:** the user approved incorporating the Dub-inspired trial into the working Research Scout frontend while retaining the stack. The [adoption record](dub-ux-adoption.md) describes the implemented white/slate sidebar, source index, persistent desktop preview, mobile dialog and existing reason editor organized into tabs. It supersedes earlier visual preferences and the trial-stage “no selection” status below. The trial files remain unchanged historical artifacts; production data and behavior come from the existing application APIs. [Validation](../docs/validation/dub-ux-adoption.md) records this UI update separately from the initial framework evidence.

**October 29 design trials:** three independent design agents created [Linear, Cal.com and Dub-inspired HTML studies](../discovery/ux/2026-10-29-linear-cal-dub-trials/README.md) for review. “lear.app” is interpreted as Linear.app from the preceding discussion. These explore a compact list/reader, a spacious workbench with visible search scope, and a structured source inspector respectively. They use fictional data and local interactions; no application code, provider integration, or selected design changes as a result of this exploration.

**Latest user direction — October 29:** prioritize a **light main canvas, a modern left sidebar, and richer portal/settings controls**, using starter.cal.com as a positive visual baseline and Linear's workspace structure as a reference. Dark marketing homepages do not satisfy this direction. The user explicitly removed React/Next.js as a constraint on inspiration sources; this does not change the existing implementation stack. Two UX research agents added **15 references each, 30 distinct additions**, to the [Inspiring Sites list](../discovery/ux/inspiring-sites.md), covering knowledge workspaces and control-rich portals. Each counted reference has an inspected publisher-provided light UI image. Dated samples, native UI, mixed chrome and lower-fit control references are qualified. This is not an authenticated app walkthrough or a selected redesign.

**October 29 inspiration shortlist:** the user requested a separate subagent to curate high-quality React/Next.js sites. The [Inspiring Sites list](../discovery/ux/inspiring-sites.md) records direct viewing links, scoped framework evidence and specific UI patterns to study. It distinguishes public websites, publisher-provided product tours and inspectable demos; it does not treat a marketing site's framework as proof of a native app's technology. No product design or component library is selected by this research.

**October 28 second-round update:** the user did not accept the first three concepts and requested at least three additional variants from other design frameworks, using multiple subagents. [Lumen, Forma and Signal Board](../discovery/ux/2026-10-28-design-exploration/round-2-design-review.md) add independent Radix/shadcn, Apple/Spectrum/React Aria and Carbon/Fluent-informed compositions. The gallery retains all six; original HTML is unchanged. The earlier Cobalt recommendation is historical, not a selected product direction. Production UI/backend contracts remain unchanged.

**October 28 design exploration:** the user requested a UX Design Researcher and three more distinctive HTML variants. [Cobalt Studio, Fieldnotes and Midnight Observatory](../discovery/ux/2026-10-28-design-exploration/README.md) explore Material-inspired expressiveness, an editorial reading desk and a dark research console. The exploration includes current first-party design/MUI/accessibility research, color/icon/component guidance and prototype review. These are proposals; the current Next.js UI and backend contracts remain unchanged. A 2027 direction is a forward-looking design judgment, not a verified ranking of future products.

**Later implementation update:** Increment 1 development is approved. The standalone Next.js workspace now implements progressive rows, inspection, human selections, explicit checks and exports; local browser/visual evidence is in the [validation report](../docs/validation/increment-1.md). The source-research intake below remains historical evidence, not a claim of live-provider or participant-based usability validation.

The user requested a separate agent to read the new UX research under `discovery/ux/`. UX Researcher read the source notes, inspected the editable prototype and supplied preview, and related the findings to the current Increment 1 plan. This document preserves that context. The source files remain unchanged.

**Design refinement at intake:** the user confirmed separate provider services/backend boundaries and explicit provider routing, with no default provider mixing. The shared application core remains provider-agnostic; independently run Python provider services own OpenAlex, Crossref, DataCite and Semantic Scholar integrations. Restoring Crossref/DataCite checks and adding a separately enabled Semantic Scholar step were proposed sequencing changes at that time. The later implementation update above records current scope and separate live gates.

**Latest confirmed interaction behavior:** render entities as they become available from agents/providers. Source rows must appear before the final model summary or overall run completion when usable records are already available. The progressive-results requirements below come from this latest user direction; the historical mockup did not establish live progressive delivery. See the [progressive-results contract](progressive-results.md).

**Latest discovery refinement:** use a hybrid lexical + semantic + filter strategy within the chosen discovery provider. OpenAlex remains the primary/default through its official MCP, combining native keyword/Boolean and semantic text-query branches after the capability proof. This supersedes the earlier exclusive-mode selector and its prohibition on two within-provider searches: submitting an explicit bounded hybrid plan admits both branches. Semantic Scholar remains a complementary explicit provider choice. Editing provider, scope or strategy prepares the next search without submitting it or rerunning the current one. See the [hybrid-retrieval contract](hybrid-retrieval.md).

## Sources and read coverage

All seven top-level Markdown documents and the mockup README in the [UX handoff folder](../discovery/ux/research-scout-design-handoff/) were read:

| Source | Contribution |
| --- | --- |
| [UX handoff index](../discovery/ux/research-scout-design-handoff/research-scout-ux-handoff.md) | Consolidated direction, later palette refinement, prototype scope and validation limits. |
| [Site design elements](../discovery/ux/research-scout-design-handoff/agent-site-design-elements.md) | Modern application patterns, visual tokens, controls and progressive disclosure. |
| [Research Scout UX](../discovery/ux/research-scout-design-handoff/agent-research-scout-ux.md) | User jobs, information architecture, source rows, inspector, saving and responsive/accessibility guidance. |
| [Development handoff](../discovery/ux/research-scout-design-handoff/research-scout-development-handoff.md) | Wider product, provider, data and architecture context. |
| [Incremental development plan](../discovery/ux/research-scout-design-handoff/agent-incremental-development-plan.md) | Vertical slices, provenance, decisions and acceptance contracts. |
| [Scholarly provider research](../discovery/ux/research-scout-design-handoff/agent-scholarly-providers.md) | Access, identity and evidence distinctions that must remain visible in the UI. |
| [Search/video/MCP research](../discovery/ux/research-scout-design-handoff/agent-search-video-mcp.md) | Future web/video evidence and integration boundaries. |
| [Mockup README](../discovery/ux/research-scout-design-handoff/research-scout-mockup/README.md) | Prototype behavior, operation and production limits. |

The agent also inspected editable `dist/index.html`, `styles.css` and `app.js`, the portable HTML and the [Material Blue preview](../discovery/ux/research-scout-design-handoff/research-scout-material-blue-preview.jpg). The portable page embeds the editable CSS/JS. The JPEG is a narrow, cropped result-list preview, not a complete desktop-layout record. The agent did not rerun the reported browser walkthrough.

## Evidence status

The source material is a documented design synthesis and an interactive concept with fictional sample data. It does not document recruited participants, observational studies, interviews, task-success rates or validated personas. Its patterns and local interactions are useful design evidence; actual research-task usability remains to be evaluated.

The source handoff reports browser spot checks and explicitly leaves comprehensive keyboard, cross-browser and accessibility testing incomplete. Those are historical prototype observations, not passing tests for Research Scout's future Next.js implementation.

## Recorded visual direction

The handoff's “Selected design direction” records a later user-selected Material UI blue palette, superseding the original forest/teal proposal:

| Role | Recorded value |
| --- | --- |
| Primary action/accent | `#1976d2` |
| Hover/strong blue | `#1565c0` |
| Light detail | `#42a5f5` |
| Selected surface | `#e3f2fd` |

This is a color direction, **not a selection of the MUI React component library**. The component library remains open. Carry forward cool near-white/white surfaces, slate text, restrained blue, labeled outlined icons and semantic tokens. Neutral shades vary between the notes; consolidate actual tokens during component design and verify each text/control pairing.

The research suggests 14px UI body, 15–16px reading text, readable metadata, a 4/8/12/16/24/32/48 spacing rhythm and restrained shadows for overlays. These are starting points rather than fixed dimensions for every breakpoint.

## Main journey and information architecture

The research's source-first pattern, adapted to the latest provider and progressive-results requirements, is:

**One question + selected discovery provider → source rows as available → inspect, check and shortlist while work continues → reopen → export.**

The full concept has Discover, Library, Evidence and Research brief destinations, with Papers/Web/Videos as source facets. Increment 1 should retain its smaller **Research + Saved shortlist** structure; Discover/Library are possible labels for those two destinations. Evidence/Brief/Web/Videos are later references, not first-slice navigation promises.

The discovery-provider choice and its scope belong beside the question because they change what the user searches. Provider catalogs, API/MCP transport configuration, agent administration and raw diagnostics belong outside the main reading path. Show technical details when they explain an actionable limitation, with fuller receipts available in run details.

## Explicit provider scope and verification

Each discovery run selects **OpenAlex or Semantic Scholar**, with **OpenAlex as the primary/default** through its official MCP. Semantic Scholar is complementary and becomes an actionable choice only when its independently enabled service and search capability are ready. Do not issue default fan-out, combine provider results behind one unlabeled list, or silently switch providers after a failure. A user can explicitly start a separate run with another available provider, retaining the earlier run and its outcome.

The selected provider remains visible in the scope summary, results and saved run. Detail retrieval uses the provider service that supplied that observation. Search filters must describe the selected service's supported capability; preserve and disclose any changed filter or query scope when starting a new run with a different provider.

Default OpenAlex discovery to an explicitly described **Hybrid** plan: native MCP keyword/Boolean retrieval plus native semantic text-query retrieval, under the selected scope and filters. The primary interaction remains one question and Search action; users need not choose an exclusive lexical or semantic mode to obtain the default behavior. Keep the plan bounded and validate each branch's actual capabilities and effective filter scope before publishing eligible records. Expose lexical/semantic contribution, executed queries/OQL, effective filters, branch outcomes and provisional/final ranking in secondary search details rather than filling every source row with technical scores. See [hybrid retrieval](hybrid-retrieval.md).

A provider, filter or strategy edit prepares a new request; the user starts it explicitly. Keep existing results and decisions attached to their original run scope. The hybrid plan authorizes its declared within-provider branches, not provider fan-out, an implicit paid rerun or a silent transport switch. Semantic Scholar's semantic route must be capability-proven with its actual compatible encoder configuration; a provider brand or endpoint label does not establish that the route is ready. Expose an unavailable branch honestly and retain useful results according to the declared plan, without replacing it with another provider.

Exact DOI verification is a separate, explicit action on a selected record. Route by the DOI's registration agency to Crossref or DataCite; these are verification destinations rather than retrieval branches or additional discovery providers in the search selector. An unknown agency, unsupported route or provider miss remains unresolved with a clear reason. It does not trigger a broadcast to all services or establish that the DOI is invalid.

The inspector should preserve the original discovery observation and show registry observations alongside it, including provider, retrieval time, identifier, available fields and check outcome. Use field-level comparison and labels such as **Provider supplied**, **Registry record found**, **Metadata conflict**, **Not found at this registry** or **Check unavailable**. A registry response is a bibliographic observation, not proof of full-text review, study quality or scientific validity. A match in one field must not imply that every field was checked.

Conflicting titles, authors, dates and versions remain visible. Verification must not silently replace or merge discovery metadata. Keep resource identity, publication/version relationships and provider observations distinct: the same work appearing in OpenAlex and Semantic Scholar does not become two independent studies, while similar titles do not establish a shared identity. A later run can show an explicit confirmed relationship without erasing either provider's original record.

Progress, access and failure are scoped to the active operation and provider service. For example, a saved OpenAlex search can remain usable while a Crossref check is unavailable, or a Semantic Scholar access failure can leave earlier OpenAlex observations intact. Show the affected provider, whether saved data remains available, and the next explicit action. Connection configuration can remain in settings; successful access to one provider must not imply that the others are connected or checked.

## Progressive results and continued review

The user has confirmed progressive rendering as current product behavior. Publish available source records into the list once the application can identify and preserve them and validate their branch scope/effective filters, while agents and provider operations continue. An early lexical or semantic batch is usable while the other branch is pending; show that state and label its ranking **Provisional**. A provider that returns a single batch can reveal that batch when it arrives; the UI must not simulate per-item streaming or wait for a later model summary or fused ranking to reveal it. The [progressive-results contract](progressive-results.md) defines the related delivery and recovery behavior.

Show each operation's actual state separately: the selected provider's lexical and semantic branches, record-detail retrieval, a user-requested registry check and model fit-note/summary preparation can finish or fail at different times. A row with provider metadata is usable while its fit note is **Pending** or **Unavailable**. Registry checking has its own **Not checked**, **Checking**, completed observation or failure annotation. Pending annotations do not hide source fields, masquerade as missing provider metadata or imply that a check ran. A failed branch leaves a visible partial discovery outcome with the successful branch's rows and scope; it does not silently switch providers. Show **No matches** only after the declared discovery branches complete with zero candidates; branch failure or unavailability must retain its incomplete-coverage explanation.

Users can open available rows, include/exclude them and save reasons during the run. Those human decisions remain authoritative as new fields, annotations or results arrive. Give save acknowledgement and revision/conflict feedback independently of discovery progress. A later model response, provider update or reconnect must preserve the current selection, reason and inspector context. Cancellation or a later operation failure retains already available records and human decisions, with a truthful partial/cancelled outcome.

Use stable row identities tied to saved resource/provider observations. Deduplicate repeated lexical/semantic hits by stable canonical provider identity while retaining both branch contributions and their observations. Patch fields and annotations in place; repeated deliveries update the corresponding row rather than create a duplicate. Preserve row positions, scroll position, keyboard focus, human decisions and any open detail view as updates arrive. Keep the current reading order stable and reveal new rows predictably. When fused ranking is ready, make it available with an explicit **Apply final ranking** or equivalent action; do not automatically reorder rows while the user is inspecting them. Field/version changes remain attributable and follow the shortlist-revision contract.

During a disconnected progress channel, retain the visible list and show **Reconnecting** or **Updates may be stale**, including the last synchronized state where useful. Reconnect to saved state and reconcile delivered records/annotations by stable identity. Recovery must not duplicate rows, clear human decisions or implicitly start another paid provider/model run. An interrupted operation stays distinguishable from an operation whose latest status is temporarily unknown. Resume/retry/new-run actions remain explicit and obey the application's limits.

Use a concise status region for accessible progress. Throttle and coalesce polite announcements such as updated source counts or a completed check; avoid announcing every field/token update. Announce an actionable failure with clear provider/operation context, preserve keyboard focus and provide a discoverable way to reach new results. Apply busy/loading treatment to the affected operation or annotation while keeping available rows and Save/inspect controls usable. Verify keyboard/screen-reader behavior, reduced motion and a reconnect during an active shortlist edit.

## Adaptation to Increment 1

| Area | Design implication |
| --- | --- |
| Question | One prominent composer and Search action; default to OpenAlex via official MCP with a declared hybrid keyword/Boolean + semantic text-query plan and supported effective filters. Semantic Scholar is a complementary explicit provider choice after capability/encoder proof. No exclusive-mode choice is required by default; editing scope/provider does not submit. |
| Progress | Per-provider/branch/operation preparation, active, completed, partial and failure states, with separate model-summary/detail/check status. Show the other retrieval branch pending and early ranking provisional; coalesce accessible announcements and retain truthful disconnected/stale states. |
| Results | Render scope/filter-validated rows from either branch before model-summary/run completion. Show original title, available bibliography, short available description, content state, discovery provider/source link and explicit saved state. Deduplicate stable provider IDs, retain branch contribution and patch rows in place. Preserve reading position, focus and decisions; expose final fused rank without automatic reorder during inspection. |
| Coverage | Display returned count, truncation and stop reason. Replace the prototype's “all caught up” message with bounded-search wording. |
| Inspector | Closed initially; open explicitly, preserve list position, dismiss with focus restoration and use a full-width treatment on narrow screens. |
| Details | Show saved metadata first. An uncached lookup uses the originating provider service as a separate explicit action, with its allowance and loading/failure state. |
| DOI check | Explicit action routed by registration agency to Crossref or DataCite. Show registry observations, field matches/conflicts and unresolved outcomes alongside the original metadata; never silently merge fields. |
| Access and failure | Display readiness/failure for the selected provider, retrieval branch or check destination. A branch failure preserves the other branch's usable rows as partial results; offer an explicit new run or retry where allowed, with no hidden provider fan-out or fallback. |
| Human decisions | Inspect and save scoped include/exclude/reasons while discovery continues. Preserve human decisions through incremental updates, cancellation and reconnect; provide backend acknowledgement, revision conflict and save-failure behavior. |
| Selection cap | Current Increment 1 caps included papers at three. The prototype's three-source comparison limit is a different later operation. |
| Reopen | Read saved discovery/registry observations, decisions and retrieval dates without another provider/model call. Refresh and new checks are explicit. |
| Reconnect | Retain visible saved rows, display reconnecting/stale status and reconcile stable records/annotations. Reconnecting creates neither duplicate rows nor an implicit paid rerun. |
| Export | Saved-revision bibliography/JSON manifest with discovery provider/service, record IDs/versions, branch queries/effective filters, retrieval times, contribution/ranking state and missing-field warnings. Include actual registry checks, routing/outcomes and conflicts; identify which recorded fields the bibliography renders. Do not imply complete hybrid coverage after a branch failure, checks that did not run, silent field reconciliation or full-paper review. |

The prototype's global browser-local Save/Remove set is not the persistence contract for the application. Reuse its presentation while keeping the backend-owned run/project scope, human reasons and revision behavior in the current architecture.

Model-generated fit notes need a distinct identity and supporting record/field references. An OA link is not retrieved full text; an abstract is not a parsed paper. Do not fill rows or inspectors with fabricated findings to imitate later-stage sample screens.

## Components and acceptance gaps

The first component sketch should cover the workspace shell, question composer, default-hybrid scope summary and explicit discovery-provider selector, supported filters, per-branch/operation/provider status, stable progressive source row/list, provisional/final ranking affordance, secondary branch-contribution/effective-filter details, separate pending fit-note/check annotations, content/completeness/provenance labels, inspector with DOI-check and field-comparison states, shortlist decision/reason control, save/conflict feedback, export control and loading/empty/partial/error/reconnecting/stale states.

Preserve visible focus, labeled controls, keyboard submission, Escape dismissal, focus restoration, wrapping metadata and reduced-motion behavior. The prototype provides useful examples but requires production verification:

- Static CSS contrast checks by UX Researcher found some small metadata below the research brief's 4.5:1 target: `#747a80` on white is about 4.34:1 and `#7c848d` about 3.79:1. Light blue `#42a5f5` is decorative, rather than a small-text default.
- Some mobile Save controls are 36 × 36px, below the brief's approximately 44px touch-target recommendation.
- Off-canvas navigation needs verified expanded-state/background-focus handling; inspector dismissal and re-rendered Save controls need reliable focus restoration.
- Tabs need a complete keyboard/associated-panel implementation. Written breakpoint recommendations and actual prototype breakpoints differ; validate usable layouts rather than copying thresholds blindly.

These are source/code observations, not a complete accessibility audit. Initial user validation should observe provider choice → question → inspect → explicit DOI check → include/exclude with reason → reopen → export. Check whether users understand search scope, content availability, registry observations/conflicts, saved state and bounded coverage. Include a failed selected-provider search with no hidden alternate call, and a failed registry check that leaves discovered records usable. Confirm that switching providers starts a clearly separate run and that repeated records are not presented as independent supporting studies.

Progressive/hybrid acceptance must additionally show a scope/filter-validated source row from an early branch before the other branch or final model summary completes; inspection and saving while later work remains active; separate pending or failed branches/annotations; stable provider-ID deduplication and positions/focus/decisions as updates arrive; and explicit application of final fused ranking. Include a failed branch with retained partial results and no provider switch, plus disconnect/reconnect reconciliation without duplicate rows or new external calls. Check coalesced screen-reader announcements and an interrupted run that retains earlier records. These are required future checks, not test results from the supplied prototype.

## Scope reconciliation

The UX bundle includes later evidence comparison, research-brief creation and web/video states. Those remain later capabilities. The latest user direction confirms provider isolation, explicit routing, progressive rendering of available entities and hybrid lexical/semantic/filter retrieval within the selected provider. The revised [Increment 1](increment-1.md) proposal restores selected-record Crossref/DataCite checks and adds a separately enabled Semantic Scholar discovery step after the OpenAlex path, while retaining metadata/abstract-level scope. The original research placed complementary discovery in a later increment; moving it earlier is a new sequencing proposal, not an observed capability or a consequence automatically required by provider isolation. Progressive delivery/recovery and hybrid branch/ranking contracts are recorded separately in [progressive results](progressive-results.md) and [hybrid retrieval](hybrid-retrieval.md). The static UX concept did not validate those live behaviors or establish their production transport.

SQLite, STDIO and specific component-library suggestions in older notes remain proposals rather than adopted stack changes. Search-provider selection does not require the user to configure MCP transport in the main workflow, and provider-service separation does not create a multi-provider search by default.

The next UX refinement should settle navigation labels, default-hybrid provider/scope presentation, secondary branch/filter details, in-run include/exclude/reason controls, stable result updates and explicit final-rank application, detail/check and exhausted-allowance states, provider/branch-specific progress/access/failure behavior, reconnect/stale feedback, registry field conflicts, partial model-failure results, save conflicts and provenance-rich export warnings. The recorded blue direction informs that work. No application UI implementation or hosted publication was performed during this intake.
