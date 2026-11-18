# Impeccable-guided trials

November 15, 2026. Three light treatments of the same Research Scout workspace, using identical authored resources and browser-local interactions from the shared renderer. These previews do not change the application or run a research request.

| Preview | Design decision | What it favors | Tradeoff |
| --- | --- | --- | --- |
| [Quiet Workbench](impeccable-quiet.html) | Flat result rows, compact saved AI focus, restrained surfaces and a simple reader divider. | Fast comparison and the smallest visual departure from Scout's current compact workspace. | Individual resources have less separation; selection and the source actions must carry that distinction. |
| [Research Folio](impeccable-folio.html) | Separate source cards, more space around prose, a wider reader and a serif face reserved for source titles and reading text. | Sustained reading and a clear distinction between application controls and source material. | Fewer records fit on screen, and the reading emphasis leaves less room for parallel scanning. |
| [Signal Desk](impeccable-signal.html) | Slate layers, stronger selected-record boundaries, a structured focus strip and a vertical action rail beside each record. | Recognizing the selected source and finding repeated source actions without searching the prose. | The action rail reduces text width; on phones it returns to a horizontal action row. |

All three retain the sidebar, original question, project actions, Sources/Date/Limits/AI controls, four information icons and compact timing, saved AI focus, Papers/Videos/Data/Repos tabs and source reader. Heavy information remains behind the settings-row controls. The existing shared responsive behavior makes the reader explicit on smaller screens and moves navigation into a phone drawer. Provider identity, Key points/Original, expansion, metadata, notes, save affordances, media previews and progressive replay use the same interaction implementation in every family.

## Guidance applied

The primary task is **Operate**: find, compare and select sources. The reader is a **Read** surface. The trial uses proximity and stable alignment before adding containers; it assigns source prose a reading role only where that distinction is intentional. The polish sequence gives task visibility and truthful states priority over decoration. The family does not treat the research workspace as a marketing page.

These are locally authored directions informed by [Operate](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/.agents/skills/impeccable/reference/operate.md), [polish](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/.agents/skills/impeccable/reference/polish.md), [layout](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/.agents/skills/impeccable/reference/layout.md), [typeset](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/.agents/skills/impeccable/reference/typeset.md) and [clarify](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/.agents/skills/impeccable/reference/clarify.md). Upstream does not prescribe these exact combinations for Scout.

## Reusable adapter and evidence boundary

The active `.agents/skills/scout-impeccable` bundle and portable `skills/scout-impeccable` mirror contain the same 15 files. The upstream source is pinned at commit `2b86d9c07b97d4bed7de23583e1bd1e58dd2baae`; its generated Codex skill declares version 4.9.1. The bundle records source and bundled hashes for ten imported files, retains Apache-2.0 LICENSE and upstream NOTICE, and marks the Markdown link/provenance adaptations. Its local wrapper preserves current user preferences and Research Scout's workflow.

This is **Impeccable-guided design review**. The upstream engine, detectors, overlays, hook installation, native audit/critique storage and live-edit commands did not run. Written audit/critique references explain that boundary; they do not establish an executed engine audit or score.

The official skill-creator validator passes for both bundles using the existing project Python environment. Mirror equality and all ten bundled import hashes pass; no runtime script or binary is included. See [the validation receipt](impeccable-skill-validation.json).

All six initial screenshots were visually reviewed at 1440px desktop and 390px phone widths: [Quiet desktop](screenshots/impeccable-quiet-desktop.png), [Quiet phone](screenshots/impeccable-quiet-mobile.png), [Folio desktop](screenshots/impeccable-folio-desktop.png), [Folio phone](screenshots/impeccable-folio-mobile.png), [Signal desktop](screenshots/impeccable-signal-desktop.png) and [Signal phone](screenshots/impeccable-signal-mobile.png). No overlapping focus controls or clipped result cards were observed. Folio deliberately fits fewer records on screen; Signal's action rail becomes a horizontal row on the phone. The shared validation records interaction and intermediate-width checks separately. A mockup validates presentation and local interactions, not real retrieval quality.

Quiet Workbench is the lowest-change starting point for a later application decision. Research Folio tests a stronger reading preference; Signal Desk tests stronger action and selection structure. Selecting or combining a direction remains a separate user decision.
