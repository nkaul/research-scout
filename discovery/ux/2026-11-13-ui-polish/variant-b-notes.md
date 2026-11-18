# B · Precision workbench

This is an interactive HTML design proposal for review, created November 13, 2026. It is separate from the Next.js application. No app components, dependencies, backend services or saved research were changed for this concept.

Open [the mockup](variant-b-workbench.html), [desktop preview](previews/variant-b-desktop.png), [Videos preview](previews/variant-b-videos.png), [mobile preview](previews/variant-b-mobile.png) or [mobile reader](previews/variant-b-mobile-reader.png).

## Design intent

The current Dub-inspired light sidebar and research workflow are retained. The workbench makes research titles the strongest element, aligns list content to a shared baseline and gives the right reader a clear, quiet boundary. A slate palette carries secondary information; material blue identifies the selected row, active tab and primary action. Green is limited to access/completion status.

The query and its retrieval focus stay together. One control surface contains provider scope, the year slider/custom range, video count, Abstracts and Explore. Provider/access coverage sits in a short footer rather than another large report. The results begin roughly 450px from the top at 1440×1000, compared with approximately 650px in the reviewed November 12 Papers screenshot. These are observed positions in those two example screenshots, not a performance measurement.

A flat ranked list replaces a stack of equally prominent card borders. The selected record alone gains a blue edge and soft background. Every row uses the same sequence: title, provenance chips, byline, excerpt, expansion control and one action row. The reader separates Overview, Metadata and notes. Authors follow the source text. Original abstract/description remains available beside the illustrative key points.

The workbench favors research density over a large introductory area. Body text is generally 13px in results and the reader, titles 15px, and functional text controls generally 12px. Small provenance/status annotations are 10–11px. Icon controls use 32px targets; mobile result actions also use 32px targets. Those compact annotations should be reviewed at actual size before adoption; a 14px body baseline remains an available refinement.

## Interaction coverage

- Papers/Videos tabs support Left/Right and Home/End navigation. Both use consistent result controls.
- Desktop row intent updates the reader after a short hover delay. It preserves input/keyboard focus and pauses while a note is being edited. Up/Down keys move between result rows.
- Original abstract and video descriptions expand. Metadata shows separate provider records instead of blending fields.
- Source checkboxes, year presets/custom years and visible video count update the next-search draft. They do not silently re-run a saved search.
- Search displays an atom indicator and three skeleton rows, then restores the same sample dataset. Filter, save feedback and resource-specific in-memory notes work locally.
- Videos show illustrative thumbnail panels. Playback and captions require an explicit action. Sample caption loading is fenced to the selected record.
- The mobile reader opens inline and can be closed without removing the results. Navigation has a compact mobile toggle.

Source links and document download controls explain their intended destination in a small feedback message; they do not fetch a real paper or navigate to a fabricated citation. PDF preview is a clearly illustrative document sheet. The mockup uses no external fonts, media, libraries or HTTP requests. Research records, DOIs, institutions, counts, timings and captions are sample content, not research claims or current service status. Nothing persists after a page reload.

## Guidance consulted

The following are design references; this concept does not add Fluent or another component library to Research Scout.

- [Fluent 2 layout](https://fluent2.microsoft.design/layout): use spacing, proximity and alignment to establish relationships. Applied as a consistent layout rhythm, a shared action baseline and distinct list/reader regions.
- [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): tab/tabpanel semantics, selected state and arrow-key navigation. Applied to both resource tabs and reader sections.
- [WCAG 2.2 target size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): provide sufficient pointer target size or spacing. Applied with 32px icon controls and larger primary controls. This is not a full accessibility conformance claim.

## Local verification

Rendered in the repository's installed full Chromium through Playwright, using a local file URL:

- Desktop 1440×1000 and mobile 390×1000: no horizontal overflow.
- No page JavaScript errors; zero HTTP requests observed.
- Checked resource/reader tabs, tab arrow keys, row arrow keys, passive selection focus preservation and pause during note editing.
- Checked abstract expansion, save count/feedback, video selection, sample transcript loading, custom date range, video count, filtering, atom/skeleton search state and mobile reader opening/closing.
- Inspected desktop Papers, Videos, full mobile list and mobile reader screenshots.

This validates the standalone concept's behavior and rendering. It does not validate an application implementation, provider quality or a full accessibility audit.
