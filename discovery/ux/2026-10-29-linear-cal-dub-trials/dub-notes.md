# Dub-inspired Research Scout trial

Created October 29, 2026. This is a standalone HTML design study with fictional research records. It does not modify the application, contact a provider or demonstrate live research capability.

## Reference and transfer

- [Dub Links](https://dub.co/links): inspected the public product presentation and link-editor structure. Adapted the clear field hierarchy, compact controls, bordered surfaces and separation between the editable workspace and preview.
- [Dub’s published link-builder image](https://assets.dub.co/home/features/link-builder-mini.jpg): visually inspected the white editor and pale preview panel. Transferred its restrained split-pane proportions into a source index and persistent source reader. The image is a reference only; it is not embedded or copied into the mockup.
- [Dub Analytics](https://dub.co/analytics): used its explicit filter and progressive event-stream concepts as inspiration for source controls and arrival status. No marketing metrics or conversion features are carried into Scout.

The resulting direction uses a white slate sidebar, almost-black primary controls, fine borders, soft blue selection and a source preview that feels like a document rather than a marketing card. Original inline icons and system fonts keep the study self-contained.

## Trial interactions

- `#run-search` replays a fictional progressive arrival sequence: 2 → 4 → 6 records. The question remains editable; it does not affect a real search or make the fixed fictional results relevant to a different query.
- `[data-source]` selects a source; in stacked layouts it scrolls and moves focus to the selected source heading. Source-row focus survives progressive list updates. `D` returns to Discover outside editable controls and dialogs.
- `[data-tab]` switches Overview, Metadata and Your notes. Tabs support arrow keys, Home and End.
- `#save-source` adds/removes the selected source, with a three-source limit. `[data-view]` switches Discover, Shortlist and Notes.
- `#oa-filter` filters access; `#sort-button` switches best-match / oldest-first. Result-density buttons switch spacing.
- `#settings-button` or `#top-settings` opens search preferences, which change lexical/semantic labels, recent-year filtering and density. `#provider-chip` opens the provider explanation.
- `#source-note` and `#save-note` save a note in page memory. Export downloads a clearly marked fictional JSON shortlist.

OpenAlex remains the single discovery provider in this study. There are no fabricated DOIs, provider fallback, source blending, hosted-model calls or backend connections. State resets on reload. Desktop and mobile layouts are included; the parent agent performs rendered visual and interaction QA before delivery.
